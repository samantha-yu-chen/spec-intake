# Current Direction

## Boundary

`spec-intake` explores how a Human and an Agent turn an initial signal into a
reviewable intent package. Its strongest outputs are provenance, exposed
assumptions, explicit forks, break analysis, and traceability between human
claims and proposed technical work.

It does not own:

- the authoritative Delivery seal;
- authority resolution;
- consequence classification;
- future human decisions at boundary, release or activation time;
- execution, evidence adjudication, merge, artifact promotion, or Outcome
  measurement.

## Current-code status

The TypeScript code is a tested prototype. The current `humanSpec` and
`techSpec` schemas are legacy experiment contracts, not the hybrid SSOT's
canonical case-pack records. In particular, an `outcome` sentence is not a
persistent `OutcomeCase`, and it is not a sealed metric contract.

## Migration assets

Before replacement, retain JSON fixtures for:

- stated and drafted-confirmed answers;
- invented-scope and dropped-requirement drift;
- dependency ordering;
- reveal contents;
- fatigue signals;
- frozen/resumed sessions;
- invalid structured model output.

The later Python implementation may use different schemas and UX. Parity is
required for retained behaviours, not for TypeScript file layout.

## Next safe coding task

Add a language-neutral fixture export covering reveal, provenance, drift,
ordering, fatigue and freeze/resume cases. Keep the current schemas unchanged in
that slice; the purpose is to preserve behaviour before a future Python contract
is designed.
