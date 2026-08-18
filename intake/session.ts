import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { sessionEvent } from './events.ts';
import { phase } from './phase.ts';
import { specPair } from './spec.ts';

// WHY: the SDK owns the meaning of a message; this schema only asserts that the
// stored array is objects, so a resumed session replays byte-identical to what
// was sent. Re-deriving the message shape here would be a second definition
// drifting from the first.
const messageParam = z.custom<Anthropic.MessageParam>(
  (value) => typeof value === 'object' && value !== null,
  { message: 'stored message is not an object' },
);

export const turnMetric = z.object({
  at: z.string(),
  phase,
  requesterChars: z.number().int().nonnegative(),
  agentChars: z.number().int().nonnegative(),
  eventsRecorded: z.number().int().nonnegative(),
});

export const owner = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const session = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  phase,
  messages: z.array(messageParam),
  events: z.array(sessionEvent),
  turns: z.array(turnMetric),
  owner: owner.nullable(),
  documents: specPair.nullable(),
  ticketId: z.string().nullable(),
  frozenAt: z.string().nullable(),
  freezeReason: z.string().nullable(),
});

export type TurnMetric = z.infer<typeof turnMetric>;
export type Owner = z.infer<typeof owner>;
export type Session = z.infer<typeof session>;

export function newSession(id: string, now: string): Session {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    phase: 'gathering',
    messages: [],
    events: [],
    turns: [],
    owner: null,
    documents: null,
    ticketId: null,
    frozenAt: null,
    freezeReason: null,
  };
}
