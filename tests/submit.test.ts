import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhaseError } from '../intake/phase.ts';
import type { Session } from '../intake/session.ts';
import type { SpecPair } from '../intake/spec.ts';
import { approve, submit, SubmissionRefused, type SubmitDeps } from '../server/routes/submit.ts';
import { createStore } from '../server/session-store.ts';

let deps: SubmitDeps;

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spec-intake-'));
  deps = {
    store: createStore(join(dir, 'sessions')),
    submissionsDir: join(dir, 'submitted'),
    resumeBase: 'http://localhost:4317',
  };
});

const pair: SpecPair = {
  human: {
    title: 'Overdue invoice view',
    problem: 'Collections rebuilds a spreadsheet by hand every morning.',
    outcome: 'One page shows what is overdue.',
    statements: [{ id: 'H1', kind: 'requirement', text: 'Show every invoice past its due date.', source: 'stated' }],
    happy_path: ['Open the page', 'See the overdue invoices'],
    out_of_scope: ['Reminder emails'],
    what_would_make_this_fail: ['Due dates are stored per customer timezone'],
    half_value: 'Half is useful.',
    blast_radius_ceiling: 'Reads the invoices table, writes nothing.',
  },
  tech: {
    approach: 'One read-only query behind one page.',
    items: [
      {
        id: 'T1',
        title: 'Overdue query',
        detail: 'Select unpaid invoices past due_date.',
        derived_from: ['H1'],
        depends_on: [],
        acceptance: [{ given: 'an unpaid invoice due yesterday', when: 'the query runs', then: 'it is in the result', adjudicated_by: 'tests/overdue-query.test.ts' }],
      },
    ],
    ticket_order: ['T1'],
  },
};

const requester = { name: 'Sam Okafor', email: 'sam@example.com' };

async function sessionAt(phase: Session['phase'], documents: SpecPair | null = pair): Promise<Session> {
  const created = await deps.store.create();
  return deps.store.save({
    ...created,
    phase,
    documents,
    messages: [{ role: 'user', content: 'I need to see overdue invoices.' }],
    events: [{ kind: 'answer', at: '2026-08-18T09:00:00.000Z', turn: 1, data: { slot: 'who_uses_it', value: 'Collections', source: 'stated', quote: 'the three of us in collections' } }],
  });
}

describe('approve', () => {
  it('is legal at the reveal and nowhere else', async () => {
    const atReveal = await sessionAt('reveal');

    expect((await approve(deps.store, atReveal.id)).phase).toBe('approved');
    await expect(approve(deps.store, (await sessionAt('gathering')).id)).rejects.toBeInstanceOf(PhaseError);
    await expect(approve(deps.store, (await sessionAt('panel')).id)).rejects.toBeInstanceOf(PhaseError);
  });
});

describe('submit', () => {
  it('is refused until the requester has approved', async () => {
    for (const phase of ['gathering', 'panel', 'reveal'] as const) {
      const session = await sessionAt(phase);
      await expect(submit(deps, session.id, requester)).rejects.toBeInstanceOf(PhaseError);
    }
  });

  it('is refused without a name and an email, because the return path has nowhere to go', async () => {
    const session = await sessionAt('approved');

    await expect(submit(deps, session.id, { name: 'Sam' })).rejects.toBeInstanceOf(SubmissionRefused);
    await expect(submit(deps, session.id, { name: 'Sam', email: 'not-an-email' })).rejects.toBeInstanceOf(SubmissionRefused);
  });

  it('is refused when there are no documents to submit', async () => {
    const session = await sessionAt('approved', null);

    await expect(submit(deps, session.id, requester)).rejects.toBeInstanceOf(SubmissionRefused);
  });

  it('writes an envelope carrying the human-spec, the trace map, the record and the owner', async () => {
    const session = await sessionAt('approved');

    const view = await submit(deps, session.id, requester);

    const files = await readdir(deps.submissionsDir);
    const envelope = JSON.parse(await readFile(join(deps.submissionsDir, files[0]!), 'utf8')) as Record<string, unknown>;
    expect(view.ticketId).toMatch(/^TICKET-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
    expect(envelope['human_spec']).toEqual(pair.human);
    expect(envelope['trace']).toEqual([{ statement: 'H1', kind: 'requirement', text: 'Show every invoice past its due date.', implemented_by: ['T1'] }]);
    expect(envelope['owner']).toEqual(requester);
    expect(envelope['record']).toHaveLength(1);
    expect(envelope['resume_url']).toBe(`http://localhost:4317/s/${session.id}`);
  });

  it('closes the session one way — the phase is submitted and the ticket id is kept', async () => {
    const session = await sessionAt('approved');

    const view = await submit(deps, session.id, requester);

    expect(view.phase).toBe('submitted');
    expect((await deps.store.load(session.id)).ticketId).toBe(view.ticketId);
  });

  it('freezes the ticket and logs the email when the envelope does not hold together', async () => {
    const drifting: SpecPair = { human: pair.human, tech: { ...pair.tech, items: [{ ...pair.tech.items[0]!, derived_from: ['H9'] }] } };
    const session = await sessionAt('approved', drifting);
    const logged = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const view = await submit(deps, session.id, requester);

    expect(view.phase).toBe('frozen');
    expect(view.freezeReason).toContain('dangling_derivation');
    expect(logged.mock.calls[0]?.[0]).toContain(`resume: http://localhost:4317/s/${session.id}`);
    expect(logged.mock.calls[0]?.[0]).toContain('cannot amend the spec');
    logged.mockRestore();
  });

  it('still writes the envelope for a frozen ticket, because a frozen ticket keeps its box', async () => {
    const drifting: SpecPair = { human: pair.human, tech: { ...pair.tech, items: [{ ...pair.tech.items[0]!, derived_from: ['H9'] }] } };
    const session = await sessionAt('approved', drifting);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await submit(deps, session.id, requester);

    expect(await readdir(deps.submissionsDir)).toHaveLength(1);
    vi.restoreAllMocks();
  });
});
