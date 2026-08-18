import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '../intake/events.ts';
import { buildReveal, isEmptyReveal, statedRatio } from '../intake/reveal.ts';

const at = '2026-08-18T09:00:00.000Z';

const log: SessionEvent[] = [
  { kind: 'answer', at, turn: 1, data: { slot: 'who_uses_it', value: 'Collections, three people', source: 'stated', quote: 'the three of us in collections' } },
  { kind: 'answer', at, turn: 2, data: { slot: 'overdue_clock', value: 'UTC midnight', source: 'drafted_confirmed', quote: 'yeah that sounds right' } },
  { kind: 'fork', at, turn: 3, data: { question: 'Where the page lives', options: ['Inside the billing app', 'A standalone page'], decision: 'Inside the billing app', decided_by: 'requester', fallback: 'Split it out if billing deploys slow down' } },
  { kind: 'fork', at, turn: 4, data: { question: 'Pagination at scale', options: ['Load all', 'Page at 200'], decision: 'Page at 200', decided_by: 'agent', fallback: 'Raise the page size if the list is routinely shorter' } },
  { kind: 'assumption', at, turn: 5, data: { text: 'Invoice due dates are already stored in UTC.', why_not_verified: 'The requester does not own the invoices table.' } },
  { kind: 'declined', at, turn: 6, data: { question: 'What happens to a disputed invoice?', why: 'Said to leave it for now.' } },
];

describe('the reveal', () => {
  it('leads with what the agent inferred rather than heard', () => {
    const reveal = buildReveal(log);

    expect(reveal.inferred.entries).toEqual([
      { slot: 'overdue_clock', value: 'UTC midnight', confirmedWith: 'yeah that sounds right' },
    ]);
  });

  it('never shows a confirmed draft as something the requester stated', () => {
    const reveal = buildReveal(log);

    expect(reveal.inferred.entries.map((entry) => entry.slot)).not.toContain('who_uses_it');
    expect(reveal.inferred.entries).toHaveLength(1);
  });

  it('shows only the forks the agent decided alone', () => {
    const reveal = buildReveal(log);

    expect(reveal.defaulted.entries.map((fork) => fork.question)).toEqual(['Pagination at scale']);
  });

  it('carries the fallback for each defaulted fork, not just the decision', () => {
    expect(buildReveal(log).defaulted.entries[0]?.fallback).toBe('Raise the page size if the list is routinely shorter');
  });

  it('lists standing assumptions and declined questions as recorded', () => {
    const reveal = buildReveal(log);

    expect(reveal.assumptions.entries).toHaveLength(1);
    expect(reveal.declined.entries[0]?.question).toBe('What happens to a disputed invoice?');
  });

  it('reports the ratio of stated to drafted answers', () => {
    expect(statedRatio(log)).toEqual({ stated: 1, drafted: 1, ratio: 0.5 });
  });

  it('reports a ratio of zero when nothing was answered at all', () => {
    expect(statedRatio([])).toEqual({ stated: 0, drafted: 0, ratio: 0 });
  });

  it('recognises a reveal with nothing in it, which is a claim to disbelieve, not a pass', () => {
    expect(isEmptyReveal(buildReveal([]))).toBe(true);
    expect(isEmptyReveal(buildReveal(log))).toBe(false);
  });
});
