import type { TurnMetric } from './session.ts';

// WHY: there is no turn or cost cap, so fatigue is the only thing that should
// stop a grilling. Answers getting shorter, corrections stopping, nothing new
// being recorded — that is compliance, and everything recorded after it is
// worth less than nothing because it looks like agreement.

const WINDOW = 3;
const VERY_SHORT = 40;

export interface FatigueSignal {
  fired: boolean;
  reason: string;
}

const QUIET: FatigueSignal = { fired: false, reason: '' };

export function fatigueSignal(turns: readonly TurnMetric[]): FatigueSignal {
  if (turns.length < WINDOW) return QUIET;
  const recent = turns.slice(-WINDOW);
  return allVeryShort(recent) ?? steadilyShrinking(recent) ?? nothingLanding(recent) ?? QUIET;
}

function allVeryShort(recent: readonly TurnMetric[]): FatigueSignal | null {
  if (!recent.every((turn) => turn.requesterChars < VERY_SHORT)) return null;
  return { fired: true, reason: `the last ${recent.length} answers were all under ${VERY_SHORT} characters` };
}

function steadilyShrinking(recent: readonly TurnMetric[]): FatigueSignal | null {
  const lengths = recent.map((turn) => turn.requesterChars);
  const shrinking = lengths.every((length, index) => index === 0 || length < lengths[index - 1]!);
  const halved = lengths.at(-1)! * 2 < lengths[0]!;
  if (!shrinking || !halved) return null;
  return { fired: true, reason: 'each answer has been shorter than the one before it, and the last is less than half the first' };
}

// WHY: a requester who keeps agreeing produces turns with nothing recorded.
// The conversation looks alive and the spec has stopped growing.
function nothingLanding(recent: readonly TurnMetric[]): FatigueSignal | null {
  if (recent.some((turn) => turn.eventsRecorded > 0)) return null;
  return { fired: true, reason: `nothing has been recorded in ${recent.length} turns` };
}

export function fatigueNudge(signal: FatigueSignal): string {
  return [
    `Operator: fatigue signal — ${signal.reason}.`,
    'Do not push harder and do not fill the gap with your own answers.',
    'Say plainly what you have noticed, tell the requester the session is saved and',
    'this link brings them back to exactly here, and offer to stop for now.',
    'If they want to continue, shrink the next question to something concrete and local.',
  ].join(' ');
}
