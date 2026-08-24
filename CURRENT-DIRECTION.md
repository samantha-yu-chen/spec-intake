# Current Direction

## Boundary

`spec-intake` explores how a Human and an Agent turn an initial signal into a
reviewable intent package. Its strongest outputs are provenance, exposed
assumptions, explicit forks, break analysis, and traceability between human
claims and proposed technical work.

Its retained boundary is authoring and reveal behaviour, including provenance,
trace, ordering, fatigue, freeze/resume, structured generation, malformed-output
refusal, declined-answer records, break records, and one-way submission. It is
executable design research, not the target control plane or Outcome Case SSOT.

It does not own:

- the authoritative Delivery seal;
- authority resolution;
- consequence classification;
- future human decisions at boundary, release or activation time;
- execution, evidence adjudication, merge, artifact promotion, or Outcome
  measurement.

## Current-code status

The TypeScript code is a tested prototype. The current `humanSpec` and
`techSpec` schemas are legacy experiment contracts, not v0.10 canonical
case-pack records. In particular, an `outcome` sentence is not a
persistent `OutcomeCase`, and it is not a sealed metric contract.

## Migration assets

Before replacement, retain JSON fixtures for:

- stated versus drafted-confirmed provenance;
- reveal contents;
- invented-scope and dropped-requirement detection;
- dependency ordering;
- fatigue signals;
- freeze/resume behaviour;
- malformed structured-model output and fail-closed refusal;
- declined-answer and break records;
- structured generation;
- session resume and one-way submission behaviour.

P4, not P3, classifies each fixture as required in Python, historical only, or
superseded with a reason.

The later Python implementation may use different schemas and UX. Parity is
required for retained behaviours, not for TypeScript file layout.

## Next safe coding task

P3.3 extraction is complete on `migration/p33-spec-intake-fixtures-v3`. It
exports 21 executable legacy fixtures covering the complete migration-asset
list above under fixture contract v3.0. The export preserves the actual frozen
session boundary: a resume notice is emitted, but the current phase table has no
normal authoring re-entry from `frozen`. See
`docs/EXPERIMENT-FIXTURE-EXPORT.md`.

The next safe task is independent review and P4 catalogue adjudication. Keep the
current schemas unchanged until that classification is complete. Do not derive
v0.10 invariants or encode downstream decision authority here; P5 derives
conformance from the complete v0.10 SSOT in the operating-model repository.
