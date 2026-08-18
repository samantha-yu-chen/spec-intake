import { z } from 'zod';

export const phase = z.enum(['gathering', 'panel', 'reveal', 'approved', 'submitted', 'frozen']);
export type Phase = z.infer<typeof phase>;

// WHY: the phase is the only thing standing between a half-grilled conversation
// and a sealed ticket. Anything not named here is refused, so a new phase has to
// be admitted deliberately rather than by falling through a default.
const ALLOWED: Readonly<Record<Phase, readonly Phase[]>> = {
  gathering: ['panel'],
  panel: ['gathering', 'reveal'],
  reveal: ['gathering', 'approved'],
  approved: ['reveal', 'submitted'],
  submitted: ['frozen'],
  frozen: [],
};

export class PhaseError extends Error {}

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) {
    throw new PhaseError(`refusing transition ${from} -> ${to}`);
  }
}

export function assertPhase(actual: Phase, required: Phase, action: string): void {
  if (actual !== required) {
    throw new PhaseError(`refusing ${action}: session is ${actual}, must be ${required}`);
  }
}
