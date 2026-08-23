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

Add a language-neutral fixture export covering the complete migration-asset
list above. Keep the current schemas unchanged in that P3 slice; the purpose is
to preserve legacy evidence for P4 classification before a future Python
contract is designed. Do not derive v0.10 invariants or encode downstream
decision authority here; P5 derives conformance from the complete v0.10 SSOT in
the operating-model repository.
