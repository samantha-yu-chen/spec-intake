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
superseded with a reason. **Superseded by outcome:** that classification is now
complete and accepted — see "P4 outcome (accepted)" below.

The later Python implementation may use different schemas and UX. Parity is
required for retained behaviours, not for TypeScript file layout.

## P4 outcome (accepted)

The root operating-model repository has catalogued and adjudicated this
repository's export. The accepted snapshot is this repository's `main` at
`524a3d3` (`merge: export spec-intake legacy fixtures v3`); each catalogued
fixture pins its executable Commit A `13e7303`, not that merge commit. The
adjudication of record is `docs/p4-fixture-catalogue-adjudication.md` in
`prod-eng-govrn-op-model`, with the machine record in
`catalogue/experiment-fixture-catalogue.json` there. No merge SHA is quoted for
the P4 record itself; cite the document.

All 21 exported fixtures were classified, with no gap evidence outstanding.

| Disposition | Count | Meaning |
|---|---:|---|
| `required_in_python` | 18 | An approved target boundary that consumes this capability must reproduce the implementation-neutral observation, in addition to the applicable v0.10 rules. |
| `superseded_with_reason` | 1 | The exact expected behaviour conflicts with v0.10, or would restore a concept v0.10 replaced. |
| `historical_only` | 2 | Reproducible design research retained for comparison, not a target parity or gate requirement. |

Neither `superseded_with_reason` nor `historical_only` means the fixture was
wrong, and neither authorises deleting it. All 21 fixtures stay in this
repository and keep executing under `npm run check`.

- `spec-intake.drifting-submission-frozen` — `superseded_with_reason`. The
  freeze record and retained envelope remain useful evidence, but the observed
  frozen topology has no executable normal correction or re-entry, so it cannot
  become a target recovery contract: v0.10 requires every blocked recovery state
  to name a real owner and exit condition.
- `spec-intake.fatigue-signal-recorded` and `spec-intake.fatigue-signal-clear` —
  `historical_only`. The record-only fatigue heuristic is retained as
  instrumentation research, not as a Python gate or an unvalidated threshold.

The other 18 are `required_in_python` for one recorded reason: they retain
source attribution, reveal fidelity, dependency ordering, scope and requirement
drift detection, resumability, repair and malformed-input refusal before a
contract can become authoritative, and they grant no downstream decision
authority.

P4 also narrowed the other submission fixtures explicitly: they preserve
immutable hand-off and do not claim seal or decision authority.

### Frozen topology, as adjudicated

This is the most consequential P4 result for this repository, and the easiest
to state backwards.

- The frozen resume notice **is** executable historical behaviour: a drifting
  submitted pair writes one retained envelope, freezes and emits the notice.
- The current `frozen` phase **has no normal authoring re-entry**. That is the
  actual boundary, and the export preserved it faithfully.
- P4 **did not invent** the missing recovery path.
- P5 must **not** manufacture one as a positive Python recovery requirement.
  The envelope-retention observation stays historical evidence; the terminal
  topology does not become a target recovery contract.

"Add a resume path" is therefore not a local backlog item here, and must not be
filed as one.

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
