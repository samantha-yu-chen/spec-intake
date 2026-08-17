# Working on spec-intake

This file governs work **on** this repository. It is not the instruction set the
intake agent runs — that is a separate, versioned artifact and is budgeted and
tested on its own.

**A `CLAUDE.md` in a parent directory does not apply here.** Any playbook above
this one describes a different harness — pipeline phases, an agent roster,
`/harness:*` skills — none of which exist in this repository. Where the two
disagree, this file wins.

## What this is, and what we agreed

Layer 1a. The **only** place a human touches the system. A requester arrives with
an intention; this repository grills them until that intention is a standardised
specification an unsupervised pipeline can carry to done without asking anyone
anything.

That last clause is the whole design. Everything downstream — 1b, the ticket
system, the harness — runs with no human in it. So **every human judgement the
pipeline will ever need has to be extracted here, at the one moment a human is
present.** A gap in this repository is not a missing field; it is a question the
pipeline will later need answered that nobody asked while the human was still in
the room.

See `README.md` for the outputs and the declared prototype trade-offs, and
`docs/DESIGN-DECISIONS.md` for what is settled, what is deferred, and what is
still owed by Layer 1b.

## Invariants

These are the agreed non-negotiables. Changing one is a design decision, not an
implementation detail — record it in `docs/DESIGN-DECISIONS.md`.

### The output

1. **Two documents, one conversation.** The requester *authorises* the human-spec.
   The agent *owns* the tech-spec, and both are produced before submit so the
   requester can choose whether to read the technical one.
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
