import type Anthropic from '@anthropic-ai/sdk';
import { DocumentsRefused, generateDocuments } from './documents.ts';
import type { SessionEvent } from './events.ts';
import { fatigueNudge, fatigueSignal } from './fatigue.ts';
import { conversationRequest, operatorMessage, systemBlocks } from './model.ts';
import { assertTransition, PhaseError, type Phase } from './phase.ts';
import type { Session } from './session.ts';
import type { SpecPair } from './spec.ts';
import { InvalidToolInput, recordFromToolUse, recordTools, UnknownTool } from './tools.ts';

export interface TurnListener {
  text(delta: string): void;
  recorded(event: SessionEvent): void;
  moved(phase: Phase): void;
}

export interface Engine {
  turn(session: Session, requesterText: string, listener: TurnListener): Promise<Session>;
}

export function createEngine(client: Anthropic): Engine {
  return { turn: (session, requesterText, listener) => runTurn(client, session, requesterText, listener) };
}

// WHY: the phase tools are how the agent asks to move, not how it moves. Every
// request goes through the phase machine, and open_reveal additionally has to
// get past the drift check — so the gate screen is unreachable while the
// tech-spec carries scope the human-spec does not justify.
const phaseTools: Anthropic.Tool[] = [
  {
    name: 'begin_panel',
    description:
      'Ask to leave gathering and run the downstream panel. Call this when you believe the spec is complete — you will then have to prove it seat by seat.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { readiness: { type: 'string', description: 'What makes you think gathering is complete.' } },
      required: ['readiness'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_reveal',
    description:
      'Ask to show the requester the gate screen. Only call this once a full panel pass produced no question the requester alone can answer. The two documents are generated and checked for drift when you call it; if they disagree you will be told how and the reveal stays shut.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { panel_summary: { type: 'string', description: 'What the panel asked and how each was resolved.' } },
      required: ['panel_summary'],
      additionalProperties: false,
    },
  },
];

const tools: Anthropic.Tool[] = [...recordTools, ...phaseTools];

interface Draft {
  phase: Phase;
  events: SessionEvent[];
  documents: SpecPair | null;
  agentChars: number;
}

async function runTurn(client: Anthropic, session: Session, requesterText: string, listener: TurnListener): Promise<Session> {
  const draft = reopen(session, listener);
  const messages = openingMessages(session, requesterText);

  for (;;) {
    const message = await streamOnce(client, messages, draft, listener);
    messages.push({ role: 'assistant', content: message.content });
    if (message.stop_reason !== 'tool_use') break;
    messages.push({ role: 'user', content: await answerToolUses(client, session, draft, message, listener) });
  }

  return commit(session, draft, messages, requesterText);
}

// WHY: a requester who types anything at the gate screen is rejecting it, so
// the conversation reopens and the finished documents are dropped. Documents
// that outlive the conversation they came from are documents nobody approved.
function reopen(session: Session, listener: TurnListener): Draft {
  const draft: Draft = { phase: session.phase, events: [...session.events], documents: session.documents, agentChars: 0 };
  if (session.phase === 'reveal') {
    assertTransition('reveal', 'gathering');
    draft.phase = 'gathering';
    draft.documents = null;
    listener.moved('gathering');
    return draft;
  }
  if (session.phase !== 'gathering' && session.phase !== 'panel') {
    throw new PhaseError(`refusing a turn: this session is ${session.phase}`);
  }
  return draft;
}

function openingMessages(session: Session, requesterText: string): unknown[] {
  const messages: unknown[] = [...session.messages, { role: 'user', content: requesterText }];
  const signal = fatigueSignal(session.turns);
  if (signal.fired) messages.push(operatorMessage(fatigueNudge(signal)));
  return messages;
}

async function streamOnce(client: Anthropic, messages: readonly unknown[], draft: Draft, listener: TurnListener) {
  const stream = client.beta.messages.stream(conversationRequest(systemBlocks(), messages, tools));
  stream.on('text', (delta) => {
    draft.agentChars += delta.length;
    listener.text(delta);
  });
  return stream.finalMessage();
}

async function answerToolUses(
  client: Anthropic,
  session: Session,
  draft: Draft,
  message: Awaited<ReturnType<typeof streamOnce>>,
  listener: TurnListener,
): Promise<Anthropic.ToolResultBlockParam[]> {
  const uses = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const use of uses) {
    results.push(await answerOne(client, session, draft, use, listener));
  }
  return results;
}

async function answerOne(
  client: Anthropic,
  session: Session,
  draft: Draft,
  use: Anthropic.ToolUseBlock,
  listener: TurnListener,
): Promise<Anthropic.ToolResultBlockParam> {
  try {
    return { type: 'tool_result', tool_use_id: use.id, content: await runTool(client, session, draft, use, listener) };
  } catch (cause) {
    if (isFatal(cause)) throw cause;
    return { type: 'tool_result', tool_use_id: use.id, is_error: true, content: describe(cause) };
  }
}

async function runTool(
  client: Anthropic,
  session: Session,
  draft: Draft,
  use: Anthropic.ToolUseBlock,
  listener: TurnListener,
): Promise<string> {
  if (use.name === 'begin_panel') return enterPanel(draft, listener);
  if (use.name === 'open_reveal') return openReveal(client, session, draft, listener);
  return keepRecord(session, draft, use, listener);
}

function keepRecord(session: Session, draft: Draft, use: Anthropic.ToolUseBlock, listener: TurnListener): string {
  const event = recordFromToolUse(use.name, use.input, new Date().toISOString(), session.turns.length);
  draft.events.push(event);
  listener.recorded(event);
  return `Recorded. The requester will see this ${event.kind} on the gate screen.`;
}

function enterPanel(draft: Draft, listener: TurnListener): string {
  assertTransition(draft.phase, 'panel');
  draft.phase = 'panel';
  listener.moved('panel');
  return 'Panel open. Sit every seat in panel.md in turn. Anything only the requester can answer goes back to them as a question, and the panel then runs again from the start.';
}

async function openReveal(client: Anthropic, session: Session, draft: Draft, listener: TurnListener): Promise<string> {
  assertTransition(draft.phase, 'reveal');
  const pair = await generateDocuments(client, { ...session, events: draft.events });
  draft.documents = pair;
  draft.phase = 'reveal';
  listener.moved('reveal');
  return 'Reveal open. The requester is now looking at what you inferred, the forks you decided alone, your standing assumptions and their unanswered questions — the documents sit below those. Say nothing further; wait for them.';
}

// WHY: a refused pair and a malformed tool call are the agent's problems and go
// back to it as tool errors. A phase violation or a transport failure is not,
// and must not be swallowed into the conversation as though it were feedback.
const RECOVERABLE = [DocumentsRefused, InvalidToolInput, UnknownTool];

function isFatal(cause: unknown): boolean {
  return !RECOVERABLE.some((kind) => cause instanceof kind);
}

function describe(cause: unknown): string {
  if (cause instanceof DocumentsRefused) {
    return [`The reveal stays shut. ${cause.message}:`, ...cause.findings.map((finding) => `- ${finding.code}: ${finding.detail}`)].join('\n');
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function commit(session: Session, draft: Draft, messages: readonly unknown[], requesterText: string): Session {
  return {
    ...session,
    phase: draft.phase,
    documents: draft.documents,
    events: draft.events,
    messages: messages as Anthropic.MessageParam[],
    turns: [
      ...session.turns,
      {
        at: new Date().toISOString(),
        phase: session.phase,
        requesterChars: requesterText.length,
        agentChars: draft.agentChars,
        eventsRecorded: draft.events.length - session.events.length,
      },
    ],
  };
}
