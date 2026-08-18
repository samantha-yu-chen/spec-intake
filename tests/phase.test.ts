import { describe, expect, it } from 'vitest';
import { assertPhase, assertTransition, canTransition, PhaseError, type Phase } from '../intake/phase.ts';

const ALL: Phase[] = ['gathering', 'panel', 'reveal', 'approved', 'submitted', 'frozen'];

describe('phase machine', () => {
  it('refuses submit before the requester has approved', () => {
    expect(() => assertPhase('reveal', 'approved', 'submit')).toThrow(PhaseError);
    expect(() => assertPhase('gathering', 'approved', 'submit')).toThrow(PhaseError);
    expect(() => assertPhase('approved', 'approved', 'submit')).not.toThrow();
  });

  it('refuses approve anywhere but the reveal', () => {
    for (const from of ALL.filter((p) => p !== 'reveal')) {
      expect(() => assertPhase(from, 'reveal', 'approve')).toThrow(PhaseError);
    }
  });

  it('will not let the conversation skip the panel or the reveal', () => {
    expect(canTransition('gathering', 'reveal')).toBe(false);
    expect(canTransition('gathering', 'approved')).toBe(false);
    expect(canTransition('panel', 'approved')).toBe(false);
    expect(canTransition('reveal', 'submitted')).toBe(false);
  });

  it('allows the panel and the reveal to send the conversation back for more grilling', () => {
    expect(canTransition('panel', 'gathering')).toBe(true);
    expect(canTransition('reveal', 'gathering')).toBe(true);
    expect(canTransition('approved', 'reveal')).toBe(true);
  });

  it('treats submit as one-way: nothing leaves submitted except a freeze, and nothing leaves frozen', () => {
    for (const to of ALL.filter((p) => p !== 'frozen')) expect(canTransition('submitted', to)).toBe(false);
    expect(canTransition('submitted', 'frozen')).toBe(true);
    for (const to of ALL) expect(canTransition('frozen', to)).toBe(false);
  });

  it('throws rather than reporting a refused transition, so a caller cannot ignore it', () => {
    expect(() => assertTransition('gathering', 'submitted')).toThrow(PhaseError);
    expect(() => assertTransition('gathering', 'panel')).not.toThrow();
  });
});
