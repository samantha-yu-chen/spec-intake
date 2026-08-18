import type { AnswerEvent, AssumptionEvent, DeclinedEvent, ForkEvent, SessionEvent } from './events.ts';

// WHY: CLAUDE.md § 5 — the reveal is the entire gate, and it is built to make
// rejection easy. So it is a query over the event log, in the order the
// requester must see it: what was inferred rather than heard, then the forks
// the agent decided alone, then standing assumptions, then what went
// unanswered. The finished documents come after all four, never before.

export interface RevealSection<T> {
  heading: string;
  invitation: string;
  entries: T[];
}

export interface InferredAnswer {
  slot: string;
  value: string;
  confirmedWith: string;
}

export interface Reveal {
  inferred: RevealSection<InferredAnswer>;
  defaulted: RevealSection<ForkEvent['data']>;
  assumptions: RevealSection<AssumptionEvent['data']>;
  declined: RevealSection<DeclinedEvent['data']>;
  statedRatio: StatedRatio;
}

export interface StatedRatio {
  stated: number;
  drafted: number;
  ratio: number;
}

export function buildReveal(events: readonly SessionEvent[]): Reveal {
  return {
    inferred: {
      heading: 'You did not say this — I did',
      invitation: 'I proposed each of these and took your agreement as the answer. Strike any that are not what you meant.',
      entries: answers(events)
        .filter((event) => event.data.source !== 'stated')
        .map((event) => ({ slot: event.data.slot, value: event.data.value, confirmedWith: event.data.quote })),
    },
    defaulted: {
      heading: 'Forks I decided without you',
      invitation: 'The build could have gone either way here and I chose. Each one is a decision you can reverse now and cannot reverse later.',
      entries: forks(events).filter((event) => event.data.decided_by === 'agent').map((event) => event.data),
    },
    assumptions: {
      heading: 'Standing assumptions',
      invitation: 'These are unverified. The pipeline will build on them as though they are true.',
      entries: pick(events, 'assumption').map((event) => event.data),
    },
    declined: {
      heading: 'Questions you left unanswered',
      invitation: 'Nobody downstream can come back and ask these. If one matters, it has to be answered here.',
      entries: pick(events, 'declined').map((event) => event.data),
    },
    statedRatio: statedRatio(events),
  };
}

// WHY: CLAUDE.md § 13 — the quality number is the ratio of human-stated to
// agent-drafted content. It sits on the gate screen so a spec the agent mostly
// wrote itself is visible as such at the moment of approval.
export function statedRatio(events: readonly SessionEvent[]): StatedRatio {
  const all = answers(events);
  const stated = all.filter((event) => event.data.source === 'stated').length;
  return { stated, drafted: all.length - stated, ratio: all.length === 0 ? 0 : stated / all.length };
}

export function isEmptyReveal(reveal: Reveal): boolean {
  return [reveal.inferred, reveal.defaulted, reveal.assumptions, reveal.declined].every(
    (section) => section.entries.length === 0,
  );
}

function answers(events: readonly SessionEvent[]): AnswerEvent[] {
  return pick(events, 'answer');
}

function forks(events: readonly SessionEvent[]): ForkEvent[] {
  return pick(events, 'fork');
}

function pick<K extends SessionEvent['kind']>(
  events: readonly SessionEvent[],
  kind: K,
): Extract<SessionEvent, { kind: K }>[] {
  return events.filter((event): event is Extract<SessionEvent, { kind: K }> => event.kind === kind);
}
