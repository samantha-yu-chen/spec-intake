# spec-intake — build plan (Layer 1a)

> **Origin document. Partly superseded — read `CLAUDE.md` and
> `docs/DESIGN-DECISIONS.md` first.** This is the plan Layer 1a was handed at
> the split, kept for its reasoning. Six things have since been decided
> differently: the stop condition is the agent's own judgement plus a reveal and
> a human approval, not a pre-flight oracle call (1b's seal-check now sits
> downstream of submit); the output is two documents, human-spec and tech-spec,
> not one; the Standard Spec's shape is not fixed, because 1b may be rewritten;
> attribution is collected at the end rather than per answer during the
> conversation; the prototype ships with no evaluation suite; and the spec
> carries an ordered plan, so decomposition lives here after all. Everything the
> plan says about elicitation discipline still binds.

Written so an agent with no prior context on this conversation can pick this
up and start. If anything here conflicts with instructions you're given
elsewhere, this document describes Layer 1a's contract with Layer 1b
(`spec-kernel`) — that contract is not yours to renegotiate unilaterally;
flag the conflict back to whoever briefed you instead of resolving it
silently.

## Where this sits

```
L1a  spec-intake   human intent  ->  Standard Spec        <- this repo
        │  (one document crosses this boundary, nothing else)
L1b  spec-kernel   Standard Spec ->  sealed contract
        │
L2   agent-ticket-system   sealed spec -> contract, queue, ledger
        │
L3   lite-harness          contract -> branch + evidence per criterion
```

`spec-kernel` already exists and is well along (eighteen shipped slices).
This repository is the missing front half — the part of Layer 1 that used to
live inside `spec-kernel`'s own conversational interview and has been pulled
out on purpose. Read that as: `spec-kernel` is deterministic, human-free, and
model-free by design now. Every bit of judgement, elicitation quality, and
model behaviour for Layer 1 lives here instead.

## The one door

Every requester goes through the same guided-elicitation process, regardless
of whether they already know exactly what they want or are starting from
"I'm unhappy with X, help me." A requester who can answer everything in one
turn just finishes fast — there is no separate "just let me write the spec
directly" shortcut. Do not build one. A fast finish through the real process
is fine; a bypass around it is not.

You have real design freedom over *how* the conversation is structured —
framework selection, option-driven questions instead of blank prompts,
staged short explanations before each phase, whatever produces a requester
who actually understands what they just committed to. You do **not** have
freedom over what counts as "done" — that is `spec-kernel`'s call, not
yours (see "The oracle call," below).

## What this repo produces — exactly one artifact

The output is a **Standard Spec**: a structured, append-only, per-slot
answer ledger — not a prose document a human would need to re-parse. It must
be structurally compatible with what `spec-kernel`'s `kernel/answers.ts` and
`kernel/specification.ts` already define. Coordinate with the `spec-kernel`
team to get the current published shape before writing any elicitation
logic against it — building your own competing shape and reconciling it
later is exactly the "two lists that must agree will stop agreeing" failure
this split was designed to avoid.

Every slot answer carries:

- the value,
- `answered_by` — who supplied it, by name, not by role,
- when it was answered,
- whether it was a human's direct statement or a model-drafted proposal the
  human then confirmed (these are not the same thing and must not be
  conflated in the record).

The ledger is append-only. A later correction is a new entry, not an edit to
an old one — `spec-kernel` will reject a ledger whose append order looks like
it was rewritten after the fact.

## The oracle call — this is not optional

Before this repo ever declares a Standard Spec finished, it must call
`spec-kernel`'s published seal-check rule set as a dry-run oracle and get a
clean (zero missing items) result back. This is the actual stop condition —
not a turn count, not "the requester seems satisfied," not an internal sense
that all the interesting questions got asked. If the oracle says something
is missing, go back and ask about it.

This call happens as many times as needed during the conversation, cheaply,
so that incompleteness gets caught and resolved while the requester is still
present — not discovered later as a rejected handoff. A real handoff
rejection by `spec-kernel` after this repo's own oracle call passed should be
rare, and should be treated as a bug in this repo (a stale copy of the rule
set, a malformed ledger) — not answered by sending the requester more
questions.

**This repo may never itself declare a specification "sealed."** Only
`spec-kernel`'s own deterministic seal-check, run again inside `spec-kernel`
at the real handoff, decides that. The oracle call here is for UX — catching
problems early — not the authoritative gate. `spec-kernel` does not trust
that this repo already checked, because this repo is a model-backed, not
purely deterministic and system, and is expected to be replaced or upgraded
over time.

## Hard constraints on the elicitation itself

These carry over from `spec-kernel`'s own hard-won interview design and bind
regardless of which framework or model you use to run the conversation:

- **Never let this system answer its own question.** A model-drafted
  suggestion is always shown with its reasoning and requires an explicit,
  named confirmation from the requester before it becomes an answer. A draft
  the requester hasn't seen yet is new information for its slot; showing the
  same unconfirmed draft again is not — don't let the conversation stall by
  re-offering an ignored suggestion as if it were progress.
- **Fields tagged `consequence: authority` in `spec-kernel`'s schema —
  things like risk, irreversibility, who is authorized — must never receive
  a drafted or suggested default.** No "here's our recommendation, just
  confirm it" UX for these specifically, even though that pattern is fine
  and expected everywhere else. These require an explicit, freely-given
  decision from a named, entitled person, every time.
- **Never fabricate.** If a fact isn't in what the requester said, it's a
  claim or an assumption, not an answer — label it as such and ask, don't
  fill the gap with something plausible-sounding.
- **The same question, asked twice, with nothing new coming back, is a
  blocking decision** — hand it off explicitly rather than looping on it
  forever.
- **Declare your model's context window and refuse a reply that would
  overrun it**, rather than silently discarding the oldest part of the
  conversation (usually the system prompt) and answering fluently anyway.
- **Enforce each answer's shape at generation time** (structured
  output/schema per the specific slot being asked about), not by generating
  freely and validating afterward — a shape the model enforced while
  generating can't be silently lost.

## What this repo does not own

Do not build these here, even though the elicitation frameworks you're
drawing on might tempt it:

- **No goal/scope splitting.** `spec-kernel` already owns "one intent → many
  contracts" (its `SplitPort`, one contract per target repository). Planning
  or strategic-decomposition frameworks are useful for helping a requester
  think, but their output must resolve into a single Standard Spec — do not
  build a second splitter here that competes with `spec-kernel`'s.
- **No sealing, no signing, no merge logic.** Entirely `spec-kernel`'s job.
- **No authoritative entitlement decisions.** You may read project
  configuration to ask the right person the right question, but every answer
  you produce is provisional until `spec-kernel` re-verifies entitlement on
  import. Don't treat your own entitlement check as final, and don't let a
  requester believe an answer is accepted just because this repo took it.
- **No unresolved multi-perspective output in the ledger.** If your
  elicitation design includes a divergent phase (surfacing blind spots,
  weighing options from different angles), its output must always be
  collapsed to one named decision before it enters the answer ledger. A slot
  can have exactly one answer with exactly one author — never "two
  perspectives, pick one later."

## Eval suite

Ship a behavioural regression suite before this repo is considered
releasable — scenario, expected behaviour, pass/fail, re-run after any
change to prompts, framework selection, or model. At minimum, cover:

- a repeated non-answer becomes a blocking decision, not an infinite loop;
- a drafted value is never treated as self-confirmed;
- an authority-consequence field never receives a suggested default;
- a context-window overrun is refused, not silently truncated;
- a response's shape is enforced per-slot at generation time;
- the requester's own later correction outranks a standing draft in the same
  slot;
- the oracle call actually blocks completion — a spec with a known-missing
  slot cannot be declared finished by any conversational shortcut.

Where possible, seed fixtures from `spec-kernel`'s own record of specs that
were fully answered and still turned out wrong (`kernel/outcomes.ts` — an
append-only log of exactly this). Behavioural-compliance tests prove this
repo is polite and careful; only outcome-linked fixtures prove it actually
asks the question that would have mattered.

## Build order

1. Get the current published Standard Spec schema and the seal-check oracle
   from `spec-kernel` — do not start writing elicitation prompts against a
   guess.
2. Build the single-door conversation loop against that schema.
3. Build the eval suite; seed it with the constraints listed above plus any
   available outcome fixtures.
4. Integration-test against a real `spec-kernel` handoff end to end: a
   completed Standard Spec from this repo should seal with no manual
   intervention on the receiving side.

## Left for this repo's own team to decide

Not resolved by the conversation this plan came out of — these are yours:

- Exact transport for the oracle call (a published npm package of the rule
  schema vs. an HTTP endpoint `spec-kernel` exposes).
- Model choice and cost/turn budget management.
- Which specific elicitation methodology or question style to use, as long
  as it respects the hard constraints above.
