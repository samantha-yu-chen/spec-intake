# Working on spec-intake

> **Current direction overrides the original Layer 1a programme below.** Read
> `AGENTS.md` and `CURRENT-DIRECTION.md` first. The existing implementation and
> tests remain valid evidence for the intent-authoring mechanisms they exercise,
> but the claim that this is the only human touchpoint is retired.

This file governs work **on** this repository. It is not the instruction set the
intake agent runs — that is a separate, versioned artifact and is budgeted and
tested on its own.

The complete and final operating-model SSOT is
`../prod-eng-govrn-op-model/docs/v0/greenfield-ai-first-operating-model-v0.10.md`.
Its Diagram 1 v0.8 and Diagrams 2 and 3 v0.10 are companion views, not competing
authority. This repository is executable design research and must not claim to
be the target control plane or Outcome Case SSOT.

**A `CLAUDE.md` in a parent directory does not apply here.** Any playbook above
this one describes a different harness — pipeline phases, an agent roster,
`/harness:*` skills — none of which exist in this repository. Where the two
disagree, this file wins.

## What this is, and what we agreed

Legacy Layer 1a, now retained as an intent-authoring experiment. A requester
arrives with an intention; this repository tests ways to produce a reviewable,
traceable specification draft. Downstream execution may still require named
human decisions under the current consequence classifier.

The original no-human-downstream assumption no longer governs future work.
Intake should capture intent and foreseeable forks, but it must not manufacture
future consequence, release, activation, or exception decisions before their
evidence exists.

P3 work here is limited to extracting the complete legacy evidence list in
`CURRENT-DIRECTION.md`, including authoring, reveal, provenance, drift,
ordering, fatigue, freeze/resume, declined-answer and break records, structured
generation, malformed-output refusal, session resume, and one-way submission.
P4 classifies that evidence; P5 derives v0.10 conformance independently in the
operating-model repository. Neither a generated human-spec nor tech-spec grants
downstream authority.

See `README.md` for the outputs and the declared prototype trade-offs, and
`docs/DESIGN-DECISIONS.md` for what is settled, what is deferred, and what is
still owed by Layer 1b.

## Invariants

These are the agreed non-negotiables. Changing one is a design decision, not an
implementation detail — record it in `docs/DESIGN-DECISIONS.md`.

### The output

1. **Two documents, one conversation.** In the experiment, the requester
   confirms the human-spec and the Agent drafts the tech-spec. Both are produced
   before submit so the requester can choose whether to read the technical one.
   This authors a candidate intent package; it grants no downstream decision
   authority.
2. **No drift, checked both ways.** A tech-spec item tracing to no human-spec
   statement is the agent inventing scope. A human-spec requirement with no
   tech-spec item implementing it is a requirement silently dropped. The second
   is the one that gets missed.
3. **Break analysis is output, not conversation.** The forks found, the decision
   taken at each, and the fallback when one is hit all land in the spec. Thinking
   that stays in the transcript evaporates at submit, and the pipeline then
   guesses.
4. **The tech-spec declares ticket order.** Non-overlapping files do not imply
   semantic independence, and a greenfield build has real internal dependencies.

### The gate

5. **The reveal is the entire gate.** No deterministic check exists ahead of
   execution — 1b's seal-check is downstream of submit. So the reveal is the only
   moment the model's self-assessment meets anything outside itself, and it is
   **built to make rejection easy, not approval easy**: lead with what the agent
   inferred rather than heard, the forks where it picked a default, the standing
   assumptions, and what the requester declined to answer. Finished documents come
   after those, never before.
6. **"I have every answer" needs a forcing function.** Asked whether it is done, a
   model will tend to say yes. Declaring done requires passing the downstream-panel
   interrogation first: role-play each downstream consumer — implementer, reviewer,
   verifier, security, on-call, data owner, the next engineer in six months, the
   auditor — let each ask the hardest question from its own lens, and keep grilling
   until none can ask something the spec cannot answer.
7. **Submit is one-way.** One return path only: a spec that is incomplete or
   self-contradictory emails the requester a URL that resumes the artifact at the
   conflict; the ticket freezes there. Transient or self-repairable failures never
   email. A reply to that email cannot amend the spec — that would be a second,
   un-grilled door.

### The conversation

8. **Never fabricate.** A fact not in what the requester said is a claim or an
   assumption. Label it and ask. Separate what they stated from what was inferred,
   always, in the record as well as in the moment.
9. **A draft to correct, not a blank form.** The default is a proposed value with
   its reasoning, offered for correction. A blank open question is the
   **exception**, reserved for the slots where a draft would anchor the answer: the
   authority and reversibility ceiling, risk, and the "what would make this fail"
   answers.
10. **Never let the system answer its own question.** A drafted value becomes an
    answer only on explicit confirmation. Re-offering an ignored draft is not
    progress.
11. **Stuck is de-escalated, not terminated.** After two very short answers or an
    explicit "I don't know": reduce the scale of the question, offer one direction
    explicitly labelled as an example rather than an answer, then return to an open
    question. Do not create dependence by continually supplying the requester's
    point of view.
12. **Challenge a stated preference.** When the requester has already decided, do
    not merely validate it. The job is not to make them feel good; it is to expose
    gaps in their reasoning.
13. **Grill as hard as necessary — and watch for fatigue, not cost.** There is no
    turn or cost cap. The risk that replaces it is fatigue-induced compliance:
    answers getting shorter, agreement rising, corrections stopping. When that
    fires, pause and resume; do not push harder. The quality number is the ratio of
    human-stated to agent-drafted content in the finished spec.

## Working style here

- Small commits on a branch off `main`, merged locally. **No pull request** — this
  repository is the tool, not work the tool produces.
- Every commit leaves the repository coherent: a decision recorded in
  `docs/DESIGN-DECISIONS.md` in the same commit as the behaviour it governs.
- **Never `git add -A` or `git add .`** — stage named paths.
- `Waki_Second_Brain_UK_English_Package/` is local-only third-party reference
  material (see `.gitignore`). Draw ideas from it; never commit it, and never
  quote it into a shipped artifact as if it were ours.

## Rules that are not visible in the code

- **A rule and the question that fills it are one object.** Two lists that must
  agree will stop agreeing.
- **Anything checkable by a program is not checked by a model.** In this layer the
  model elicits; where a check can be mechanical — the trace map, ticket ordering,
  what is inferred versus stated — make it mechanical.
- **A check that cannot evaluate its condition refuses.** Empty input, a missing
  file, an unresolvable reference: stop, never assume it was probably fine.
- **When a test that guards a boundary fails, fix the code, not the threshold.**
- **No new runtime dependency without asking.** It is a supply-chain decision.

## Recorded deviations

- **React + Vite, asked for and granted.** A build step and four dependencies
  (`react`, `react-dom`, `@vitejs/plugin-react`, `vite`) were added deliberately.
  The reveal (§ 5) is the entire gate and has to be a real interface — ordered
  lists a requester can reject at, not a transcript dump — so a hand-rolled
  no-build page would have made the gate harder to build than the thing it
  guards. The server side stays dependency-thin: `node:http`, no framework.
