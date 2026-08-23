# Working on spec-intake

## Current role

This repository is an executable TypeScript experiment for model-backed
Discovery/Intent authoring. It is not the target implementation and is not the
only human touchpoint in the current operating model.

The cross-repository authority is
`../prod-eng-govrn-op-model/docs/current-repository-direction.md`. The hybrid
SSOT uses the v0.8 narrative and Delivery diagram with v0.10 Diagrams 2 and 3.

## Preserve

- stated versus inferred/drafted provenance;
- reveal-first approval that makes rejection easy;
- fork, assumption, declined-answer and break records;
- fatigue detection and pause/resume;
- human-spec to technical-spec trace checks;
- structured generation and fail-closed parsing;
- session resumption and one-way submission behaviour as experiment evidence.

## Do not extend

- the claim that this is the only place a human participates;
- a pipeline that pre-answers consequence, release, activation or exception
  decisions before their evidence exists;
- a second authoritative seal or authority resolver;
- the current TypeScript document shape as the future canonical schema;
- full portfolio Investment or Outcome governance inside the intake UI.

## Allowed work before Python replacement

Safety and correctness fixes, documentation, contract extraction,
language-neutral fixtures, and changes that isolate the retained authoring
boundary are allowed. Major new features require an explicit mapping to the
hybrid SSOT and must not deepen the retired Layer 1a assumptions.

Do not translate files one by one to Python here. Preserve fixtures and contracts
for a later Python implementation in a manually created repository.

## Verification

Run `npm run check`. Preserve the existing failure cases. A test that guards a
boundary is changed only with a written replacement invariant.
