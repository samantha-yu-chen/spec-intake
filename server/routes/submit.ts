import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSpecPair, traceMap, type DriftFinding } from '../../intake/drift.ts';
import { assertTransition } from '../../intake/phase.ts';
import { statedRatio } from '../../intake/reveal.ts';
import { owner as ownerSchema, type Owner, type Session } from '../../intake/session.ts';
import { transcriptOf } from '../../intake/transcript.ts';
import type { SessionStore } from '../session-store.ts';
import { viewOf, type SessionView } from '../view.ts';

export class SubmissionRefused extends Error {}

export interface SubmitDeps {
  store: SessionStore;
  submissionsDir: string;
  resumeBase: string;
}

export async function approve(store: SessionStore, id: string): Promise<SessionView> {
  const session = await store.load(id);
  assertTransition(session.phase, 'approved');
  return viewOf(await store.save({ ...session, phase: 'approved' }));
}

// WHY: submit is one-way. The envelope is written first, the phase moves, and
// only then does the stand-in for 1b's seal check run — because a ticket that
// fails downstream freezes where it is and emails a resume link. It does not
// quietly reopen.
export async function submit(deps: SubmitDeps, id: string, rawOwner: unknown): Promise<SessionView> {
  const session = await deps.store.load(id);
  assertTransition(session.phase, 'submitted');
  const owner = readOwner(rawOwner);
  const envelope = envelopeFor(deps, requireDocuments(session), owner);

  await mkdir(deps.submissionsDir, { recursive: true });
  await writeFile(join(deps.submissionsDir, `${envelope.ticket_id}.json`), `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');

  const submitted: Session = { ...session, phase: 'submitted', ticketId: envelope.ticket_id, owner };
  return viewOf(await deps.store.save(freezeIfRefused(deps, submitted, sealCheck(session))));
}

function readOwner(raw: unknown): Owner {
  const parsed = ownerSchema.safeParse(raw);
  if (!parsed.success) throw new SubmissionRefused('a submission needs a name and an email — the one return path has nowhere to go without them');
  return parsed.data;
}

function requireDocuments(session: Session): Session {
  if (session.documents === null) throw new SubmissionRefused('this session has no documents to submit');
  return session;
}

// WHY: this stands in for 1b's seal check, which is downstream of submit and
// does not exist yet. It runs the one mechanical check we own, so the freeze
// path is exercised by the prototype rather than described in a document.
function sealCheck(session: Session): DriftFinding[] {
  return session.documents === null ? [{ code: 'nothing_to_check', subject: 'session', detail: 'no documents in the envelope' }] : checkSpecPair(session.documents);
}

function freezeIfRefused(deps: SubmitDeps, session: Session, findings: DriftFinding[]): Session {
  if (findings.length === 0) return session;
  assertTransition('submitted', 'frozen');
  const reason = findings.map((finding) => `${finding.code}: ${finding.detail}`).join('; ');
  logTheEmail(deps, session, reason);
  return { ...session, phase: 'frozen', frozenAt: new Date().toISOString(), freezeReason: reason };
}

// WHY: delivery is not wired in this slice, but the return path is. What would
// be sent is printed in full so the freeze is visible and testable now, and so
// the wiring later is a transport change rather than a design one.
function logTheEmail(deps: SubmitDeps, session: Session, reason: string): void {
  console.log(
    [
      '--- email that would be sent ---',
      `to: ${session.owner?.email ?? 'unknown'}`,
      `subject: ${session.ticketId} is frozen — it needs one thing from you`,
      `resume: ${deps.resumeBase}/s/${session.id}`,
      `conflict: ${reason}`,
      'A reply to this email cannot amend the spec. The link is the only way back in.',
      '--- end ---',
    ].join('\n'),
  );
}

function envelopeFor(deps: SubmitDeps, session: Session, owner: Owner) {
  const pair = session.documents!;
  return {
    ticket_id: `TICKET-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`,
    submitted_at: new Date().toISOString(),
    session_id: session.id,
    resume_url: `${deps.resumeBase}/s/${session.id}`,
    owner,
    human_spec: pair.human,
    tech_spec: pair.tech,
    trace: traceMap(pair),
    record: session.events,
    transcript: transcriptOf(session.messages),
    stated_ratio: statedRatio(session.events),
  };
}
