import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { checkSpecPair, type DriftFinding } from './drift.ts';
import type { SessionEvent } from './events.ts';
import { MAX_TOKENS, MODEL } from './model.ts';
import type { Session } from './session.ts';
import { specPair, type SpecPair } from './spec.ts';

export class DocumentsRefused extends Error {
  findings: DriftFinding[];

  constructor(findings: DriftFinding[], message: string) {
    super(message);
    this.findings = findings;
  }
}

const ATTEMPTS = 3;

// WHY: the pair is generated under the schema rather than checked against it
// afterwards, and then the drift check runs over the result. A pair that still
// drifts after every attempt is refused — the reveal must be unreachable while
// the tech-spec contains scope the human-spec does not justify.
export async function generateDocuments(client: Anthropic, session: Session): Promise<SpecPair> {
  let findings: DriftFinding[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const pair = await attemptGeneration(client, session, findings);
    findings = checkSpecPair(pair);
    if (findings.length === 0) return pair;
  }
  throw new DocumentsRefused(findings, `the two documents still disagree after ${ATTEMPTS} attempts`);
}

async function attemptGeneration(client: Anthropic, session: Session, findings: DriftFinding[]): Promise<SpecPair> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: GENERATION_RULES,
    messages: [{ role: 'user', content: prompt(session, findings) }],
    output_config: { format: zodOutputFormat(specPair), ...EFFORT },
    ...THINKING,
  });
  return specPair.parse(response.parsed_output);
}

// WHY: the SDK types installed here predate response effort and adaptive
// thinking. Spread in rather than cast, so the rest of the call keeps its types
// and the parsed output stays inferred.
const EFFORT = { effort: 'high' } as Record<string, unknown>;
const THINKING = { thinking: { type: 'adaptive' } } as Record<string, unknown>;

const GENERATION_RULES = `You are writing the two documents that end an intake conversation.

The human-spec belongs to the requester. It must be in their language, and every
statement in it must be something the conversation actually establishes. Give each
statement an id (H1, H2, …) and mark whether it was stated by the requester or
drafted by you and confirmed by them — the record below says which.

The tech-spec is yours. Every item names the human-spec statements it implements
in derived_from; an item that implements nothing is scope you invented, and you
must not write it. Every human-spec statement of kind "requirement" must be
implemented by at least one item. depends_on and ticket_order carry the build
order: non-overlapping files do not make two tickets independent.

Acceptance criteria are adjudicated by a machine. "Works correctly" is not a
criterion. Name the check that decides each one — a test file, a command, a
query. If you cannot name the check, the criterion is not written yet.

Write nothing the conversation does not support. A gap you paper over here is a
gap nobody downstream can find.`;

function prompt(session: Session, findings: DriftFinding[]): string {
  return [
    'Here is the intake conversation, then the record of what was captured during it.',
    '',
    '## Conversation',
    transcript(session.messages),
    '',
    '## Record',
    record(session.events),
    repair(findings),
  ].join('\n');
}

function repair(findings: DriftFinding[]): string {
  if (findings.length === 0) return '';
  return [
    '',
    '## Your previous attempt did not hold together. Fix these and regenerate both documents.',
    ...findings.map((finding) => `- ${finding.code}: ${finding.detail}`),
  ].join('\n');
}

function transcript(messages: readonly Anthropic.MessageParam[]): string {
  return messages
    .map((message) => ({ role: message.role, text: textOf(message.content) }))
    .filter((turn) => turn.text.length > 0)
    .map((turn) => `**${turn.role === 'user' ? 'Requester' : 'Intake'}:** ${turn.text}`)
    .join('\n\n');
}

function textOf(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block): block is Anthropic.TextBlockParam => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function record(events: readonly SessionEvent[]): string {
  if (events.length === 0) return '(nothing was recorded during this conversation)';
  return events.map((event) => `- ${event.kind}: ${JSON.stringify(event.data)}`).join('\n');
}
