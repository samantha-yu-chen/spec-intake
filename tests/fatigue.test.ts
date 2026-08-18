import { describe, expect, it } from 'vitest';
import { fatigueNudge, fatigueSignal } from '../intake/fatigue.ts';
import type { TurnMetric } from '../intake/session.ts';

function turn(requesterChars: number, eventsRecorded = 1): TurnMetric {
  return { at: '2026-08-18T09:00:00.000Z', phase: 'gathering', requesterChars, agentChars: 600, eventsRecorded };
}

describe('fatigue', () => {
  it('stays quiet before there is enough conversation to judge', () => {
    expect(fatigueSignal([turn(10), turn(8)]).fired).toBe(false);
  });

  it('fires on three very short answers in a row', () => {
    expect(fatigueSignal([turn(400), turn(30), turn(12), turn(6)]).fired).toBe(true);
  });

  it('fires when each answer is shorter than the last and the last is less than half the first', () => {
    expect(fatigueSignal([turn(600), turn(300), turn(120)]).fired).toBe(true);
  });

  it('does not fire on a single short answer between substantial ones', () => {
    expect(fatigueSignal([turn(500), turn(20), turn(430)]).fired).toBe(false);
  });

  it('fires when three turns pass with nothing recorded, however talkative the requester is', () => {
    const signal = fatigueSignal([turn(900, 0), turn(800, 0), turn(850, 0)]);

    expect(signal.fired).toBe(true);
    expect(signal.reason).toContain('nothing has been recorded');
  });

  it('says why it fired, so the nudge can tell the requester what was noticed', () => {
    const signal = fatigueSignal([turn(400), turn(30), turn(12), turn(6)]);

    expect(signal.reason).not.toBe('');
    expect(fatigueNudge(signal)).toContain(signal.reason);
  });

  it('tells the agent to stop rather than push', () => {
    const nudge = fatigueNudge(fatigueSignal([turn(600), turn(300), turn(120)]));

    expect(nudge).toContain('Do not push harder');
    expect(nudge).toContain('offer to stop');
  });
});
