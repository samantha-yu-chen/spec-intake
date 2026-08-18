import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { eventInputs, sessionEvent, type EventKind, type SessionEvent } from './events.ts';

const KINDS = ['answer', 'fork', 'assumption', 'declined'] as const satisfies readonly EventKind[];

// WHY: strict tool use takes a narrow slice of JSON Schema, and the length and
// pattern constraints are ours to enforce anyway — recordFromToolUse parses
// every call with the full zod schema. Sending them would risk a 400 for a
// check we already do better on our side.
const LOCAL_ONLY = new Set(['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format']);

const DESCRIPTIONS: Record<EventKind, string> = {
  answer:
    'Record a filled slot the moment it is filled. Use source "stated" only when the value is the requester\'s own; use "drafted_confirmed" when you proposed it and they agreed. The requester is shown this split before they approve, so record it honestly.',
  fork:
    'Record a point where the build could reasonably go two ways, with the decision and what the pipeline should do if that decision turns out wrong. Set decided_by to "agent" when you chose rather than the requester — the gate screen leads with those.',
  assumption:
    'Record something you are proceeding on that nobody confirmed. The pipeline will build on it as though it were true, so the requester is shown it before approving.',
  declined:
    'Record a question the requester would not or could not answer. Nobody downstream can ask it again.',
};

export function toolNameFor(kind: EventKind): string {
  return `record_${kind}`;
}

export const recordTools: Anthropic.Tool[] = KINDS.map((kind) => ({
  name: toolNameFor(kind),
  description: DESCRIPTIONS[kind],
  strict: true,
  input_schema: inputSchemaFor(kind),
}));

export class UnknownTool extends Error {}
export class InvalidToolInput extends Error {}

// WHY: the model's tool input is validated here, by the same schema the store
// holds, before it can become a record. A malformed call is refused and handed
// back as a tool error rather than written half-shaped.
export function recordFromToolUse(name: string, input: unknown, at: string, turn: number): SessionEvent {
  const kind = kindFor(name);
  const parsed = eventInputs[kind].safeParse(input);
  if (!parsed.success) throw new InvalidToolInput(z.prettifyError(parsed.error));
  return sessionEvent.parse({ kind, at, turn, data: parsed.data });
}

function kindFor(name: string): EventKind {
  const kind = KINDS.find((candidate) => toolNameFor(candidate) === name);
  if (kind === undefined) throw new UnknownTool(`no such tool: ${name}`);
  return kind;
}

function inputSchemaFor(kind: EventKind): Anthropic.Tool.InputSchema {
  const schema = z.toJSONSchema(eventInputs[kind], { target: 'draft-2020-12' });
  return stripLocalConstraints(schema) as Anthropic.Tool.InputSchema;
}

function stripLocalConstraints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLocalConstraints);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !LOCAL_ONLY.has(key))
      .map(([key, nested]) => [key, stripLocalConstraints(nested)]),
  );
}
