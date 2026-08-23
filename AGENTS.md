# Working on spec-intake

## Current role

This repository is an executable TypeScript experiment for model-backed
Discovery/Intent authoring. It is not the target implementation and is not the
only human touchpoint in the current operating model.

The complete and final operating-model SSOT is
`../prod-eng-govrn-op-model/docs/v0/greenfield-ai-first-operating-model-v0.10.md`.
Diagram 1 v0.8 is its unchanged Delivery companion view; Diagrams 2 and 3 v0.10
are companion views. Per v0.10 §9.17, diagrams and this implementation do not
define authority. Read
`../prod-eng-govrn-op-model/docs/current-repository-direction.md` for this
experiment's disposition, and do not reconstruct the former hybrid v0.8/v0.10
precedence.

## Preserve

- stated versus drafted-confirmed provenance;
- reveal contents that make correction and rejection easy;
- invented-scope and dropped-requirement detection;
- dependency ordering;
- fatigue signals;
- freeze/resume behaviour;
- malformed structured-model output and fail-closed parsing;
- declined-answer and break records;
- structured generation;
- session resume and one-way submission behaviour as experiment evidence.

Retain this complete P3 evidence list until P4 classifies each fixture as
required in Python, historical only, or superseded with a reason.

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
boundary are allowed. P3 only extracts the legacy evidence listed above. It
does not derive or implement v0.10 invariants; P5 does that independently in
the operating-model repository. Do not deepen the retired Layer 1a assumptions
or add downstream decision authority.

Do not translate files one by one to Python here. Preserve fixtures and contracts
for a later Python implementation in a manually created repository.

## Verification

Run `npm run check`. Preserve the existing failure cases. A test that guards a
boundary is changed only with a written replacement invariant.
