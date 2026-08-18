# Design decisions — Layer 1a

The live record. Settled decisions live in `CLAUDE.md` as invariants; this file
holds what is **deferred**, what is **owed by someone else**, and what still has
to be **built** before the prototype means anything.

Resolved questions have been removed. If something is not here and not in
`CLAUDE.md`, it is not an open item.

Last revised 2026-08-18.

---

## Owed by Layer 1b — the only external dependency

### D1. The sealed contract must carry the human-spec and the trace map

Retention here ends at completion: the intake box (human-spec, tech-spec, ticket
id, conversation) exists from submit until the task completes, then is dropped,
and the **sealed contract becomes the audit record**.

That trade is only safe if the sealed contract carries the human-spec and the
trace map, not just the tech-spec. If it does, dropping the box loses only the
transcript — acceptable. If it does not, the drop destroys the basis on which the
work was authorised, and "who approved this, on what grounds" stops having an
answer at exactly the moment it would matter.

**Needs confirming with whoever owns 1b.** Until then, treat it as unresolved
rather than assumed.

One rule that belongs on this side: the drop condition is **"on completion, and
not frozen."** A frozen ticket keeps its box, because the resume URL depends on
it.

### D2. The Standard Spec's shape is not fixed

Layer 1b may be rewritten, so there is no published schema to build against yet.
Do not invent a competing shape and reconcile later — that is the failure the
1a/1b split was designed to avoid. Until a shape is published, keep the intake
agent's output structure thin and in one place, so retargeting it is an edit
rather than a rewrite.

---

## To build in v1

Things the design requires. The first prototype slice built B1–B5 and part of
B6; each entry below now carries where it lives and what is still missing from
it. Nothing here is finished until a real conversation has been through it.

### B1. The reveal

The single most important surface in this repository, because it is the whole
gate (`CLAUDE.md` § 5). Ordered to make rejection easy:

1. values the agent **inferred rather than heard**;
2. forks where it **picked a default** instead of getting a decision;
3. assumptions still standing;
4. what the requester declined to answer;
5. then the human-spec, the trace map, and the tech-spec.

**Built.** `intake/reveal.ts` derives all four lists from the event log;
`web/src/Reveal.tsx` renders them in that order with the approve button below
them. Typing anything at the gate reopens the conversation and drops the
documents (`intake/engine.ts`).

### B2. The downstream-panel interrogation

The agent's own precondition for being allowed to declare done
(`CLAUDE.md` § 6). Select the smallest useful panel for the work type — a config
change does not convene the data owner. Each seat must name one blind spot or
missing fact and ask at least one difficult question, and every collision it
surfaces must resolve into one named decision or an explicit deferral with a
stated fallback before the conversation can end.

Divergence is mandatory **in the conversation** and absent **from the artifact**.
A slot has exactly one answer; never "two perspectives, pick one later."

**Built, with one deviation.** `intake/panel.md` holds the eight seats and the
three exits (ask the requester, take it as a fork with a fallback, record it as
an assumption). The phase machine makes the panel unskippable: the reveal is
reachable only from `panel`. **Not built:** selecting the smallest useful panel
for the work type — every conversation currently convenes all eight seats. That
is a cost the prototype accepts in exchange for never under-convening while the
elicitation is still being tuned.

### B3. Two questions nobody volunteers

Both belong in the human-spec, in the requester's own language:

- **"If we only get half of this, is half useful, or is half worse than
  nothing?"** This is what decides stop-the-line behaviour when ticket 3 of 8
  fails. Half-finished migrations are the classic way this goes wrong.
- **The blast-radius ceiling.** Under unsupervised execution the requester is
  authorising every action sight unseen: what it may touch, what it may spend,
  what it may never do (production data, secrets, external calls, schema changes,
  deleting things), and what happens at the ceiling. Elicit it **once per
  project**, not per spec — re-asking guarantees rubber-stamping, which is worse
  than not asking.

**Built as slots.** Both are required fields on the human-spec schema
(`intake/spec.ts`: `half_value`, `blast_radius_ceiling`), so the documents
cannot be generated without them. **Not built:** eliciting the ceiling once per
project — there is no cross-conversation memory in the prototype, so every
conversation asks it. This is the rubber-stamping risk the entry warns about,
and it is accepted only until the deferred cross-conversation memory exists.

### B4. Acceptance criteria must be machine-adjudicable

A criterion whose verification is "a human reviews it" is a stall that, by
construction, nobody downstream will ever service. Either refuse such criteria or
convert the judgement into a rule the requester pre-commits to: not "I'll know it
when I see it" but "I accept it if p95 stays under 200 ms and no existing test
goes red."

**Pre-commit the judgement, not the judge.**

**Built as a schema requirement.** Every acceptance criterion carries
`adjudicated_by` — the named test, command or query that decides it
(`intake/spec.ts`). A criterion with no nameable check cannot be written down.
Whether the named check is a *real* one is not mechanically verifiable here; it
becomes verifiable at 1b or L3.

### B5. Fatigue detection

No cost cap means the replacement control is a fatigue signal: shortening
answers, rising agreement, corrections stopping (`CLAUDE.md` § 13). Pause and
resume rather than pushing harder. Companion metric: the ratio of human-stated to
agent-drafted content in the finished spec.

**Built.** `intake/fatigue.ts` fires on three very short answers, answers
halving turn on turn, or three turns with nothing recorded, and injects an
operator instruction to stop and offer to resume. The ratio is computed in
`intake/reveal.ts` and shown on the gate screen. **The thresholds are guesses**
— three turns, forty characters — and the first real conversation is what
calibrates them. Per `CLAUDE.md`, when a guard trips wrongly the fix is the
code, not the threshold; that rule does not apply to a number that has never
been calibrated at all, so tuning these once against real transcripts is
expected and should be recorded here when it happens.

### B6. Stance switching by technical fluency

Same door for everyone, different posture. For a fluent engineer the draft-first
approach is friction: switch from *"I draft, you correct"* to *"you state, I
challenge."* Nearly free with a frontier model, and it is what keeps "one door"
from meaning "one script."

**Partly built.** `intake/instructions.md` tells the agent to match the
requester's language and never make a non-technical requester answer a
technical question, and to challenge a stated preference rather than validate
it. There is no explicit fluency detection and no posture switch beyond that —
the model is trusted to read the room, which is exactly the kind of claim the
prototype exists to test.

---

## Decisions taken while building the first slice

Settled by building. Each is a choice that could have gone another way.

### D3. The phase is the gate, and it lives in the store

`gathering → panel → reveal → approved → submitted`, with `frozen` terminal and
reachable only from `submitted` (`intake/phase.ts`). Every transition not named
is refused, so admitting a new one is deliberate. The agent gets two tools —
`begin_panel` and `open_reveal` — that *ask* to move; the machine decides. The
practical effect is that the panel cannot be skipped and the reveal cannot be
reached from gathering, however confident the model is.

### D4. The drift check gates the reveal, not the submit

`open_reveal` generates both documents and runs the bidirectional trace check
before the gate screen opens. Findings go back to the agent as a tool error and
the reveal stays shut (`intake/documents.ts`, up to three attempts). Checking at
submit instead would have meant showing the requester documents that cannot
ship, and asking them to approve something a machine was about to reject.

### D5. Anything typed at the reveal reopens the conversation and drops the documents

The alternative — keep the documents and patch them — would let a document
outlive the conversation it was derived from. Regenerating is cheap; a document
nobody approved in its current form is not.

### D6. Submit writes the envelope, then checks it

The order is: write `submitted/TICKET-*.json`, move the phase to `submitted`,
then run the stand-in for 1b's seal check. A refusal freezes the ticket where it
is and prints the email that would be sent, resume URL included. The envelope is
written either way, because a frozen ticket keeps its box (D1). Checking before
writing would have made a failed seal look like a failed submit, and the design
says submit is one-way.

Email delivery is not wired. The freeze path is: the email is printed in full to
the server log. Wiring a transport later must not change any of the above.

### D7. Attribution at the end, resume link from the first turn

The conversation is anonymous while it runs; name and email are taken on the
submit screen, because that is the moment they are needed and the moment they
cost nothing. The session id goes into the URL on the first turn regardless, so
the resume link exists before anyone knows where to send it. Ids are 24
characters of `randomBytes`, since an anonymous session is protected by nothing
else.

### D8. Sessions are JSON files, one per conversation

`node:sqlite` is available and unused. A file per session is inspectable by hand
while the elicitation is being tuned, which is worth more right now than any
query. The trigger to move is the deferred duplicate check, which is the first
thing needing a query across sessions.

---

## Deferred, with the trigger that brings it back

| Deferred | Why it is safe for now | Trigger to build it |
|---|---|---|
| **Reading the target repository** | Prototype treats every task as a brand-new standalone build (see `README.md`) | The workflow itself is proven, and the next question is whether it handles changes to existing systems — which is most real work |
| **Duplicate / in-flight detection** | Conversations are logged with an owner, so the query is possible whenever it is worth building | Two requesters submit substantially the same request and the factory builds it twice |
| **A terminal state for frozen tickets** | Freezing is intentional and correct; accumulation is slow | Somebody needs a list of frozen tickets, or one has been frozen long enough to be stale |
| **Retry and one-question return paths** | Only the incomplete-or-conflict path is built | A class of failure keeps arriving that a single targeted question would resolve in one reply |
| **A scored evaluation suite** | Model capability plus user testing, by decision (see `README.md`) | A prompt change makes something worse and nothing catches it |
| **Per-customer request shaping, content-hash control** | External-customer intake is a separate later workflow | An external customer actually exists |
| **Cross-conversation memory, spec reuse** | Sandbox closes; no accumulated per-project learning in the prototype | Repeat small work makes a full interview per change the adoption blocker |

---

## Known limits of what the prototype can prove

Recorded so nobody overstates the result. Full reasoning in `README.md`.

- **Greenfield only.** It can show whether this workflow elicits a complete spec
  for a brand-new standalone build. It cannot show that for a change to an
  existing system, because the failure mode there — being wrong about what is
  currently true rather than about what is wanted — surfaces at L3, outside the
  prototype.
- **No benchmark.** "It worked" and "it read well" are the same observation. A
  polished spec missing the one thing that mattered scores the same as a good one.
- **The first tester already knows the answer.** Whoever designed this knows what
  the spec was supposed to say, which makes the test easier to pass than it will
  be in reality. The first honest signal comes from a requester who was not part
  of designing it.
