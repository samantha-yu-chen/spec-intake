import { z } from 'zod';

// WHY: one schema per recorded fact, used both as the tool the model calls and
// as the shape the store holds. Two definitions that must agree would stop
// agreeing — CLAUDE.md, "a rule and the question that fills it are one object".

export const recordAnswerInput = z.object({
  slot: z.string().min(1).describe('The named thing this answers, e.g. "blast_radius_ceiling".'),
  value: z.string().min(1).describe('The answer as it will appear in the spec.'),
  source: z
    .enum(['stated', 'drafted_confirmed'])
    .describe('"stated" when the requester said it unprompted; "drafted_confirmed" when you proposed it and they confirmed.'),
  quote: z
    .string()
    .min(1)
    .describe('The requester\'s own words: what they stated, or the words with which they confirmed your draft.'),
});

export const recordForkInput = z.object({
  question: z.string().min(1).describe('The fork itself — the point where the build could go two ways.'),
  options: z.array(z.string().min(1)).min(2).describe('The directions available at this fork.'),
  decision: z.string().min(1).describe('The direction taken.'),
  fallback: z.string().min(1).describe('What the pipeline does if this decision turns out wrong at build time.'),
  decided_by: z
    .enum(['requester', 'agent'])
    .describe('"agent" when you picked a default rather than the requester choosing. Say so honestly; the reveal leads with these.'),
});

export const recordAssumptionInput = z.object({
  text: z.string().min(1).describe('The assumption, stated as a claim that could be false.'),
  why_not_verified: z.string().min(1).describe('Why this was not confirmed with the requester.'),
});

export const recordDeclinedInput = z.object({
  question: z.string().min(1).describe('The question you asked.'),
  why: z.string().min(1).describe('What the requester said instead of answering it.'),
});

const recorded = z.object({
  at: z.string(),
  turn: z.number().int().nonnegative(),
});

export const sessionEvent = z.discriminatedUnion('kind', [
  recorded.extend({ kind: z.literal('answer'), data: recordAnswerInput }),
  recorded.extend({ kind: z.literal('fork'), data: recordForkInput }),
  recorded.extend({ kind: z.literal('assumption'), data: recordAssumptionInput }),
  recorded.extend({ kind: z.literal('declined'), data: recordDeclinedInput }),
]);

export type SessionEvent = z.infer<typeof sessionEvent>;
export type EventKind = SessionEvent['kind'];
export type AnswerEvent = Extract<SessionEvent, { kind: 'answer' }>;
export type ForkEvent = Extract<SessionEvent, { kind: 'fork' }>;
export type AssumptionEvent = Extract<SessionEvent, { kind: 'assumption' }>;
export type DeclinedEvent = Extract<SessionEvent, { kind: 'declined' }>;

export const eventInputs = {
  answer: recordAnswerInput,
  fork: recordForkInput,
  assumption: recordAssumptionInput,
  declined: recordDeclinedInput,
} as const satisfies Record<EventKind, z.ZodType>;
