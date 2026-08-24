# Experiment Fixture Export

## Status and provenance

This repository exports 21 `legacy_behaviour` documents under experiment
fixture contract v3.0. They preserve executable TypeScript design research for
P4 classification; they do not define the future Python schema or runtime
owner.

The mandatory provenance boundary is:

- executable Commit A:
  `c7491451c0cf89f50c7f603c93227292e59eb0dd`;
- fixture Commit B: the later commit that adds `fixtures/experiment/` and this
  document.

Every fixture pins the full Commit A SHA. Commit A contains the adapter
registry, named executable source test and rules, full-result verifier,
normalizers and deterministic exporter. Commit B contains no executable
changes. Do not squash these commits.

The local verifier resolves every declared ID, verifies that Commit A is an
ancestor, verifies that the adapter blob and other executable provenance did
not change after A, executes the source test and source rule from `given` and
`when`, and compares the complete normalized `expected` object for structural
equality.

## Coverage

| Retained family | Executable observation |
| --- | --- |
| Stated versus drafted-confirmed provenance | Production record-tool validation preserves `stated` and `drafted_confirmed` as distinct values and refuses malformed provenance |
| Reveal contents | The event-log query exposes inferred answers, Agent-defaulted forks, assumptions and declined questions in correction-first order with the stated/drafted ratio |
| Invented scope and dropped requirements | Bidirectional trace checks block untraced technical work and requirements with no implementing item; an aligned pair proves recovery |
| Dependency ordering | The production ordering check blocks a dependent ticket placed before its prerequisite and admits the corrected order |
| Fatigue | Both fired and quiet observations execute the current three-turn rule and export as `RECORD_ONLY`, not as new target blocking authority |
| Declined answers and break records | Strict production record tools preserve the unanswered question, fork options, decision actor and fallback |
| Structured generation | A deterministic client drives the production generation parser, drift retry and three-attempt ceiling without a model/API key |
| Malformed fail-closed paths | Invalid answer provenance, malformed structured output and invalid stored sessions all produce `REFUSE` with executable valid-input counterparts |
| Session resume | The production store round-trips the full conversation, event and turn state without replacing invalid state with an empty session |
| Freeze behaviour | A drifting submitted pair writes one retained envelope, freezes, emits the resume notice and has no normal authoring re-entry |
| One-way submission | A valid approved package writes one envelope and retains its ticket identity; the phase table admits no normal transition out of `submitted` |

No structured gap-evidence document is submitted: every requested P3.3 family
has an executable current behaviour. This does not mean every historical design
promise is complete. In particular, the emitted resume URL does not make a
frozen session editable: the executable phase table currently keeps `frozen`
terminal. The freeze fixtures preserve that actual boundary rather than
claiming a correction transition that does not exist. P4 decides whether the
behaviour is retained, historical only, or superseded.

## Semantic boundary

Every fixture states that shared outcomes and recovery fields are
adapter-derived. `ALLOW` means only that a legacy authoring action was admitted;
`PASS` means only that the named legacy criterion held. Neither means a v0.10
spec is sealed, a Human accepted a downstream consequence, or a Change is
`MERGED`.

Known trace and ordering prerequisites map to `BLOCK` and have executable
corrected-pair cases. Unknown, malformed or unevaluable input maps to `REFUSE`.
Fatigue remains `RECORD_ONLY`; the current threshold is not promoted into target
governance. This export claims no `ESCALATE` path and no evidence invalidation.

The legacy `humanSpec`, `techSpec`, risk, blast-radius and owner values occur
only as source inputs or source observations. They do not become v0.10 target
fields, authority resolution, consequence classification, Outcome Case state,
release, activation or exception decisions.

## Verification

From this repository:

```bash
npm run check
```

From `prod-eng-govrn-op-model`:

```bash
python3 scripts/validate_experiment_fixtures.py \
  ../spec-intake/fixtures/experiment

python3 -m unittest discover -s tests -v
```
