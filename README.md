# spec-intake — intent-authoring experiment

> **Current direction:** this is a working TypeScript experiment, not the target
> operating-model implementation. Its retained boundary is model-backed
> Discovery/Intent authoring: reveal, provenance, fatigue, break analysis and
> human-to-technical trace. It is **not** the only place a human participates in
> the current hybrid model. Read [`CURRENT-DIRECTION.md`](CURRENT-DIRECTION.md)
> before extending it.

The original experiment treated this as the only place a human touched the
system. That assumption is now retired; the current model also reserves human
decision rights for consequence, boundary, envelope, external, release,
activation and exception decisions.

A requester arrives with an intention. This repository grills them until that
intention is a **standardised specification** an unsupervised pipeline can carry
to done without asking anyone anything. Everything downstream runs without a
human in it.

```
L1a  spec-intake       human intent  ->  Standard Spec        <- this repo
        │  (one document crosses this boundary, nothing else)
L1b  spec-kernel       Standard Spec ->  sealed contract
        │
L2   agent-ticket-system   sealed spec -> contract, queue, ledger
        │
L3   lite-harness          contract -> branch + evidence per criterion
```

`CLAUDE.md` holds the invariants this repository is built to, and
`docs/DESIGN-DECISIONS.md` is the live record of what is settled, what is
deferred and what Layer 1b still owes. `docs/BUILD-PLAN.md` is the superseded
origin plan, kept for its reasoning.

## Running it

Node 24 or later. The intake talks to `claude-opus-5`, so it needs a key:

```sh
export ANTHROPIC_API_KEY=…      # refused at start-up if missing
npm install
npm run dev                      # API on :4317, UI on :4316
```

Open `http://localhost:4316`. The session id lands in the URL on the first turn
— that URL is the resume link, and reloading it brings the whole conversation
back. `npm run check` runs the typecheck and the tests; `npm run build` then
`npm run serve` runs the built UI from the API server on one port.

Sessions are one JSON file each under `sessions/`, submitted envelopes under
`submitted/`. Both are gitignored: they are runtime state and carry whatever a
requester typed.

## What comes out

Two documents, produced in the same conversation and submitted together:

| Output | Level | Who is accountable |
|---|---|---|
| **human-spec** | High-level architecture and design, the intake, what the requester is trying to do, with the full happy path | The requester **authorises** it |
| **tech-spec** | Low-level design in full detail, decomposed so each harness agent can pick up one ticket, execute, and take the next | The agent **owns** it; every item must trace to a human-spec statement |

The requester ratifies the human-spec and sanity-checks the tech-spec. A
non-technical requester cannot audit a low-level design, so the review surface is
the human-spec, the trace map, and four short lists (what the agent inferred vs.
what the human stated, standing assumptions, forks and the decision taken at
each, and questions the requester declined).

Break analysis is part of the output, not just part of the conversation: the
forks the agent found, the decision made at each, and the fallback when one is
hit, all land in the spec. Foreseeable breaks are therefore already answered
before execution starts.

## The one return path

Submit is one-way. There is no supervision downstream, so the pipeline cannot
ask a question — with one exception:

> When the request fails because the specification is **incomplete or
> self-contradictory**, an email goes back to the requester. It carries a URL
> that resumes the artifact at the conflict or the missing piece. **The ticket
> freezes at that step** until they return.

Transient failures, flaky infrastructure and anything the pipeline can repair
itself never generate an email. The link resumes a real session; a reply to the
email cannot amend the specification, because that would be a second, un-grilled
door into the spec.

## Prototype scope and declared trade-offs

This is a prototype to prove the workflow. The following are deliberate
simplifications, recorded so that nobody later mistakes them for oversights, and
so that nobody overstates what the prototype demonstrated.

### Every task is treated as a brand-new, standalone build

The prototype assumes no existing codebase to be right or wrong about. It does
not read a target repository, and it does not reason about the current state of
one.

**What this costs:** the most common real-world specification failure is not
being wrong about what is *wanted*, it is being wrong about what is currently
*true*. A tech-spec written without repository knowledge is fluent, plausible and
may be unexecutable — and that failure would surface at L3, which is outside the
prototype.

**So the claim the prototype can support is bounded:** it can show whether this
workflow elicits a complete specification for a greenfield standalone build. It
cannot show whether it does so for a change to an existing system, which is the
majority of real work. Reading the target repository is the first thing to add
after the workflow itself is proven.

Note that greenfield does not remove ticket ordering: a new build is many tickets
with real internal dependencies, and the tech-spec still has to declare their
order. Non-overlapping files do not imply semantic independence.

### There is no success benchmark

Quality rests on the model's capability plus user testing. If a run passes, good;
if it fails, fix it and run again. No scored evaluation suite, no pass threshold,
no regression set.

**What this costs:** without a benchmark, "it worked" and "it read well" are the
same observation, and a polished specification missing the one thing that mattered
scores identically to a good one. There is also no way to tell whether a prompt
change made things better or worse.

**One thing worth keeping in mind:** the first tester is likely to be someone who
already knows what the specification was supposed to say, which makes the test
easier to pass than it will be in reality. The first honest signal comes from a
requester who was not part of designing this.

### Intake is anonymous during the conversation, attributed at the end

No identity ceremony while grilling. The conversation is logged at the end, and
the finished artifact carries its owner — the person who raised the request.
Per-customer request shaping, content-hash control and the external-customer
workflow are a separate, later concern.

### No cost or turn cap

Grill as hard as necessary to reach the requester's ground thinking. Depth beats
latency at this stage.

**What this costs:** long interrogations invite fatigue-induced compliance — the
requester starts agreeing to whatever is proposed simply to finish, producing a
specification that looks deeply elicited and is substantially agent-authored. The
number to watch is therefore the ratio of human-stated to agent-drafted content in
the finished spec, not the token bill.

### Retention ends at completion

The intake box — human-spec, tech-spec, ticket id and conversation — exists from
submit until the task completes. On completion it is dropped; the **sealed
contract** is the audit record from then on.

Two consequences that follow from this and need to hold:

1. **The sealed contract must carry the human-spec and the trace map**, not only
   the tech-spec. If it does, dropping the box loses only the transcript, which is
   an acceptable trade. If it does not, dropping the box destroys the basis on
   which the work was authorised — after which "who approved this, and on what
   grounds" has no answer.
2. **A frozen ticket keeps its box.** The resume URL depends on it, so the drop
   rule is "on completion, and not frozen." Frozen tickets have no terminal state
   in the prototype; they accumulate, and eventually somebody needs a list of them.

## Reference material

`Waki_Second_Brain_UK_English_Package/` is local-only third-party course material
(see `.gitignore`) and is the source of the elicitation patterns this layer draws
on: staged gates with a stop-and-confirm at each, bounded choices instead of blank
forms, a short orientation before each transition, blind-spot panels, the
stuck-user de-escalation protocol, and the discipline of separating facts from
inference from claim.
