import { traceMap, type TraceRow } from '../intake/drift.ts';
import { buildReveal, type Reveal } from '../intake/reveal.ts';
import type { Phase } from '../intake/phase.ts';
import type { Session } from '../intake/session.ts';
import type { SpecPair } from '../intake/spec.ts';
import { transcriptOf, type TranscriptTurn } from '../intake/transcript.ts';

export interface SessionView {
  id: string;
  phase: Phase;
  transcript: TranscriptTurn[];
  reveal: Reveal;
  documents: SpecPair | null;
  trace: TraceRow[];
  ticketId: string | null;
  freezeReason: string | null;
}

// WHY: the reveal is sent on every view, in every phase, and the documents may
// be null. The gate screen is built from the log; the documents are the part
// that comes after it, so a view without them is still a usable screen.
export function viewOf(session: Session): SessionView {
  return {
    id: session.id,
    phase: session.phase,
    transcript: transcriptOf(session.messages),
    reveal: buildReveal(session.events),
    documents: session.documents,
    trace: session.documents === null ? [] : traceMap(session.documents),
    ticketId: session.ticketId,
    freezeReason: session.freezeReason,
  };
}
