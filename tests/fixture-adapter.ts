import type Anthropic from '@anthropic-ai/sdk';
import { deepStrictEqual } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DocumentsRefused, generateDocuments } from '../intake/documents.ts';
import { checkSpecPair, traceMap, type DriftFinding } from '../intake/drift.ts';
import { sessionEvent, type SessionEvent } from '../intake/events.ts';
import { fatigueSignal } from '../intake/fatigue.ts';
import { canTransition, phase } from '../intake/phase.ts';
import { buildReveal } from '../intake/reveal.ts';
import { newSession, turnMetric, type Session } from '../intake/session.ts';
import { specPair, type SpecPair } from '../intake/spec.ts';
import { recordFromToolUse } from '../intake/tools.ts';
import { submit } from '../server/routes/submit.ts';
import { createStore, SessionCorrupt } from '../server/session-store.ts';

type JsonObject = Record<string, any>;

export interface NormalizedExpected {
  outcome: 'ALLOW' | 'PASS' | 'FAIL' | 'REFUSE' | 'BLOCK' | 'ESCALATE' | 'RECORD_ONLY';
  code: string;
  result: JsonObject;
  owner: string;
  exit_condition: string;
  invalidated_evidence: string[];
}

interface AdapterDeclaration {
  id: string;
  source_revision: string;
  source_tests: string[];
  source_rules: string[];
  verifier_rule: string;
  outcome_rule: string;
  result_rule: string;
  recovery_rule: string;
  invalidated_evidence_rule: string;
}

export interface LegacyFixture {
  fixture_version: '3.0';
  fixture_id: string;
  source_repository: 'spec-intake';
  capability: string;
  status: 'legacy_behaviour';
  given: JsonObject;
  when: JsonObject & { operation: string };
  expected: NormalizedExpected;
  invariants: string[];
  legacy_context: {
    adapter: AdapterDeclaration;
    normalization: string;
  };
}

type LegacyKind = 'admitted' | 'satisfied' | 'failed' | 'unevaluable' | 'unmet_prerequisite' | 'recorded';

const ADAPTER_ID = 'spec-intake.fixture-adapter.v3';
const VERIFIER_RULE = 'spec-intake.verify.fixture-v3';
const OUTCOME_RULE = 'spec-intake.normalize.outcome-v3';
const RESULT_RULE = 'spec-intake.normalize.result-v3';
const RECOVERY_RULE = 'spec-intake.normalize.recovery-v3';
const SOURCE_TEST_ID = 'spec-intake.test.fixture-adapter-registry';
const FIXED_AT = '2026-08-18T09:00:00.000Z';

function expected(input: {
  kind: LegacyKind;
  code: string;
  result: JsonObject;
  owner?: string;
  exitCondition?: string;
}): NormalizedExpected {
  const outcomes: Record<LegacyKind, NormalizedExpected['outcome']> = {
    admitted: 'ALLOW',
    satisfied: 'PASS',
    failed: 'FAIL',
    unevaluable: 'REFUSE',
    unmet_prerequisite: 'BLOCK',
    recorded: 'RECORD_ONLY',
  };
  return {
    outcome: outcomes[input.kind],
    code: input.code,
    result: input.result,
    owner: input.owner ?? 'none',
    exit_condition: input.exitCondition ?? 'none',
    invalidated_evidence: [],
  };
}

function inputRefused(code: string, reason: string, exitCondition: string): NormalizedExpected {
  return expected({
    kind: 'unevaluable',
    code,
    result: { refusal: reason },
    owner: 'spec-intake.fixture-author',
    exitCondition,
  });
}

function asObject(value: unknown, field: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function findingResult(findings: readonly DriftFinding[]): JsonObject {
  return {
    finding_codes: findings.map((finding) => finding.code),
    findings: findings.map(({ code, subject }) => ({ code, subject })),
  };
}

function answerRecordExpected(_given: JsonObject, when: JsonObject): NormalizedExpected {
  try {
    const event = recordFromToolUse(
      'record_answer',
      when.input,
      asString(when.at, 'when.at'),
      Number(when.turn),
    );
    return expected({
      kind: 'admitted',
      code: 'ANSWER_PROVENANCE_RECORDED',
      result: { kind: event.kind, turn: event.turn, ...event.data },
    });
  } catch {
    return inputRefused(
      'ANSWER_RECORD_REFUSED',
      'spec-intake.answer-record-invalid',
      'spec-intake.valid-answer-record-provided',
    );
  }
}

function declinedRecordExpected(_given: JsonObject, when: JsonObject): NormalizedExpected {
  try {
    const event = recordFromToolUse(
      'record_declined',
      when.input,
      asString(when.at, 'when.at'),
      Number(when.turn),
    );
    return expected({
      kind: 'admitted',
      code: 'DECLINED_ANSWER_RECORDED',
      result: { kind: event.kind, turn: event.turn, ...event.data },
    });
  } catch {
    return inputRefused(
      'DECLINED_RECORD_REFUSED',
      'spec-intake.declined-record-invalid',
      'spec-intake.valid-declined-record-provided',
    );
  }
}

function breakRecordExpected(_given: JsonObject, when: JsonObject): NormalizedExpected {
  try {
    const event = recordFromToolUse(
      'record_fork',
      when.input,
      asString(when.at, 'when.at'),
      Number(when.turn),
    );
    return expected({
      kind: 'admitted',
      code: 'BREAK_RECORD_RECORDED',
      result: { kind: event.kind, turn: event.turn, ...event.data },
    });
  } catch {
    return inputRefused(
      'BREAK_RECORD_REFUSED',
      'spec-intake.break-record-invalid',
      'spec-intake.valid-break-record-provided',
    );
  }
}

function revealExpected(given: JsonObject, _when: JsonObject): NormalizedExpected {
  try {
    const events = asArray(given.events, 'given.events').map((event) => sessionEvent.parse(event));
    const reveal = buildReveal(events);
    return expected({
      kind: 'satisfied',
      code: 'REVEAL_CORRECTION_CONTENT_EXPOSED',
      result: {
        section_order: Object.keys(reveal).filter((key) => key !== 'statedRatio'),
        inferred: reveal.inferred.entries,
        defaulted: reveal.defaulted.entries,
        assumptions: reveal.assumptions.entries,
        declined: reveal.declined.entries,
        stated_ratio: reveal.statedRatio,
      },
    });
  } catch {
    return inputRefused(
      'REVEAL_INPUT_REFUSED',
      'spec-intake.reveal-events-invalid',
      'spec-intake.valid-reveal-events-provided',
    );
  }
}

function driftExpected(given: JsonObject, _when: JsonObject): NormalizedExpected {
  try {
    const pair = asObject(given.pair, 'given.pair') as SpecPair;
    const findings = checkSpecPair(pair);
    if (findings.length === 0) {
      return expected({
        kind: 'admitted',
        code: 'SPEC_PAIR_ALIGNED',
        result: { finding_codes: [], trace: traceMap(pair), ticket_order: pair.tech.ticket_order },
      });
    }
    if (findings.some((finding) => finding.code === 'nothing_to_check')) {
      return expected({
        kind: 'unevaluable',
        code: 'SPEC_PAIR_UNEVALUABLE',
        result: findingResult(findings),
        owner: 'spec-intake.spec-author',
        exitCondition: 'spec-intake.complete-spec-pair-provided',
      });
    }
    const codes = new Set(findings.map((finding) => finding.code));
    const code = codes.has('invented_scope') || codes.has('dangling_derivation')
      ? 'INVENTED_SCOPE_BLOCKED'
      : codes.has('dropped_requirement')
        ? 'DROPPED_REQUIREMENT_BLOCKED'
        : 'DEPENDENCY_ORDER_BLOCKED';
    const exitCondition = code === 'INVENTED_SCOPE_BLOCKED'
      ? 'spec-intake.invented-scope-removed'
      : code === 'DROPPED_REQUIREMENT_BLOCKED'
        ? 'spec-intake.requirement-implementation-linked'
        : 'spec-intake.dependency-order-corrected';
    return expected({
      kind: 'unmet_prerequisite',
      code,
      result: findingResult(findings),
      owner: 'spec-intake.spec-author',
      exitCondition,
    });
  } catch {
    return inputRefused(
      'SPEC_PAIR_INPUT_REFUSED',
      'spec-intake.spec-pair-input-invalid',
      'spec-intake.evaluable-spec-pair-provided',
    );
  }
}

function fatigueExpected(given: JsonObject, _when: JsonObject): NormalizedExpected {
  try {
    const turns = asArray(given.turns, 'given.turns').map((turn) => turnMetric.parse(turn));
    const signal = fatigueSignal(turns);
    return expected({
      kind: 'recorded',
      code: signal.fired ? 'FATIGUE_SIGNAL_RECORDED' : 'FATIGUE_SIGNAL_CLEAR',
      result: { fired: signal.fired },
    });
  } catch {
    return inputRefused(
      'FATIGUE_INPUT_REFUSED',
      'spec-intake.fatigue-input-invalid',
      'spec-intake.valid-turn-metrics-provided',
    );
  }
}

interface GenerationClient {
  client: Anthropic;
  attempts(): number;
}

function deterministicGenerationClient(outputs: unknown[]): GenerationClient {
  let count = 0;
  const client = {
    messages: {
      parse: async () => {
        const output = outputs[Math.min(count, outputs.length - 1)];
        count += 1;
        return { parsed_output: structuredClone(output) };
      },
    },
  } as unknown as Anthropic;
  return { client, attempts: () => count };
}

function generationSession(): Session {
  return {
    ...newSession('fixture-session', FIXED_AT),
    messages: [{ role: 'user', content: 'Show overdue records in a read-only view.' }],
    events: [
      {
        kind: 'answer',
        at: FIXED_AT,
        turn: 0,
        data: {
          slot: 'scope',
          value: 'Read-only overdue records',
          source: 'stated',
          quote: 'read-only overdue records',
        },
      },
    ],
  };
}

async function generationExpected(given: JsonObject, _when: JsonObject): Promise<NormalizedExpected> {
  let generated: GenerationClient | undefined;
  try {
    const outputs = asArray(given.model_outputs, 'given.model_outputs');
    if (outputs.length === 0) throw new Error('given.model_outputs must not be empty');
    generated = deterministicGenerationClient(outputs);
    const pair = await generateDocuments(generated.client, generationSession());
    return expected({
      kind: 'admitted',
      code: generated.attempts() > 1 ? 'STRUCTURED_DOCUMENTS_REPAIRED' : 'STRUCTURED_DOCUMENTS_GENERATED',
      result: {
        attempts: generated.attempts(),
        statement_sources: pair.human.statements.map((statement) => ({ id: statement.id, source: statement.source })),
        trace: traceMap(pair),
        ticket_order: pair.tech.ticket_order,
      },
    });
  } catch (cause) {
    if (cause instanceof DocumentsRefused) {
      return expected({
        kind: 'unmet_prerequisite',
        code: 'GENERATED_DOCUMENTS_DRIFT_BLOCKED',
        result: { attempts: generated?.attempts() ?? 0, ...findingResult(cause.findings) },
        owner: 'spec-intake.spec-author',
        exitCondition: 'spec-intake.generated-spec-pair-aligned',
      });
    }
    return expected({
      kind: 'unevaluable',
      code: 'STRUCTURED_MODEL_OUTPUT_REFUSED',
      result: { attempts: generated?.attempts() ?? 0, refusal: 'spec-intake.structured-output-invalid' },
      owner: 'spec-intake.generator-operator',
      exitCondition: 'spec-intake.valid-structured-output-provided',
    });
  }
}

async function sessionResumeExpected(given: JsonObject, _when: JsonObject): Promise<NormalizedExpected> {
  const directory = await mkdtemp(join(tmpdir(), 'spec-intake-fixture-'));
  try {
    const id = 'fixture-session';
    const store = createStore(directory);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${id}.json`), `${JSON.stringify(given.session)}\n`, 'utf8');
    const loaded = await store.load(id);
    return expected({
      kind: 'satisfied',
      code: 'SESSION_RESUMED_INTACT',
      result: {
        phase: loaded.phase,
        message_count: loaded.messages.length,
        event_count: loaded.events.length,
        turn_count: loaded.turns.length,
        content_equal: JSON.stringify(loaded) === JSON.stringify(given.session),
      },
    });
  } catch (cause) {
    if (cause instanceof SessionCorrupt) {
      return expected({
        kind: 'unevaluable',
        code: 'MALFORMED_SESSION_REFUSED',
        result: { refusal: 'spec-intake.stored-session-invalid' },
        owner: 'spec-intake.session-operator',
        exitCondition: 'spec-intake.valid-stored-session-restored',
      });
    }
    return inputRefused(
      'SESSION_RESUME_INPUT_REFUSED',
      'spec-intake.session-resume-input-invalid',
      'spec-intake.valid-session-resume-input-provided',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function observeSubmission(given: JsonObject, when: JsonObject): Promise<JsonObject> {
  const directory = await mkdtemp(join(tmpdir(), 'spec-intake-submission-'));
  const previousLog = console.log;
  const logs: string[] = [];
  console.log = (...parts: unknown[]) => logs.push(parts.map(String).join(' '));
  try {
    const pair = specPair.parse(given.documents);
    const base = newSession('fixture-session', FIXED_AT);
    const current: Session = {
      ...base,
      phase: 'approved',
      documents: pair,
      messages: [{ role: 'user', content: 'Show overdue records.' }],
      events: [
        {
          kind: 'answer',
          at: FIXED_AT,
          turn: 0,
          data: {
            slot: 'scope',
            value: 'Read-only overdue records',
            source: 'stated',
            quote: 'read-only overdue records',
          },
        },
      ],
    };
    const store = createStore(join(directory, 'sessions'));
    await store.save(current, FIXED_AT);
    const submissionsDir = join(directory, 'submitted');
    const resumeBase = 'https://fixture.invalid/intake';
    const view = await submit(
      { store, submissionsDir, resumeBase },
      current.id,
      when.owner,
    );
    const files = await readdir(submissionsDir);
    const envelope = JSON.parse(await readFile(join(submissionsDir, files[0]!), 'utf8')) as JsonObject;
    const reloaded = await store.load(current.id);
    return {
      phase: view.phase,
      ticket_id_present: typeof view.ticketId === 'string',
      ticket_id_retained: reloaded.ticketId === view.ticketId,
      envelope_count: files.length,
      envelope_trace: envelope.trace,
      record_kinds: (envelope.record as SessionEvent[]).map((event) => event.kind),
      owner_bound: envelope.owner?.name === when.owner?.name && envelope.owner?.email === when.owner?.email,
      freeze_reason_codes: typeof view.freezeReason === 'string'
        ? view.freezeReason.split('; ').map((entry) => entry.split(':')[0])
        : [],
      resume_notice_emitted: logs.some((entry) => entry.includes(`resume: ${resumeBase}/s/${current.id}`)),
      reply_amendment_refused: logs.some((entry) => entry.includes('cannot amend the spec')),
      normal_reentry_admitted: canTransition(view.phase, 'gathering'),
    };
  } finally {
    console.log = previousLog;
    await rm(directory, { recursive: true, force: true });
  }
}

async function submissionExpected(given: JsonObject, when: JsonObject): Promise<NormalizedExpected> {
  try {
    const result = await observeSubmission(given, when);
    if (result.phase !== 'submitted') {
      return expected({
        kind: 'failed',
        code: 'ONE_WAY_SUBMISSION_FAILED',
        result,
        owner: 'spec-intake.maintainer',
        exitCondition: 'spec-intake.submission-path-restored',
      });
    }
    return expected({ kind: 'admitted', code: 'ONE_WAY_SUBMISSION_RECORDED', result });
  } catch {
    return inputRefused(
      'SUBMISSION_INPUT_REFUSED',
      'spec-intake.submission-input-invalid',
      'spec-intake.valid-submission-input-provided',
    );
  }
}

async function driftFreezeExpected(given: JsonObject, when: JsonObject): Promise<NormalizedExpected> {
  try {
    const result = await observeSubmission(given, when);
    const held = result.phase === 'frozen'
      && result.envelope_count === 1
      && result.resume_notice_emitted === true
      && result.reply_amendment_refused === true
      && result.normal_reentry_admitted === false;
    return expected({
      kind: held ? 'satisfied' : 'failed',
      code: held ? 'DRIFTING_SUBMISSION_FROZEN' : 'DRIFT_FREEZE_INVARIANT_FAILED',
      result,
      ...(held
        ? {}
        : {
            owner: 'spec-intake.maintainer',
            exitCondition: 'spec-intake.freeze-invariant-restored',
          }),
    });
  } catch {
    return inputRefused(
      'DRIFT_FREEZE_INPUT_REFUSED',
      'spec-intake.drift-freeze-input-invalid',
      'spec-intake.valid-drift-freeze-input-provided',
    );
  }
}

function submissionOneWayExpected(given: JsonObject, _when: JsonObject): NormalizedExpected {
  try {
    const from = phase.parse(given.phase);
    const states = phase.options;
    const admitted = states.filter((to) => canTransition(from, to));
    const normalReentry = admitted.filter((to) => to !== 'frozen');
    const result = { from, admitted_states: admitted, normal_reentry_states: normalReentry };
    if (from === 'submitted' && admitted.length === 1 && admitted[0] === 'frozen') {
      return expected({ kind: 'satisfied', code: 'SUBMISSION_ONE_WAY_INVARIANT_HELD', result });
    }
    return expected({
      kind: 'failed',
      code: 'SUBMISSION_ONE_WAY_INVARIANT_FAILED',
      result,
      owner: 'spec-intake.maintainer',
      exitCondition: 'spec-intake.one-way-submission-restored',
    });
  } catch {
    return inputRefused(
      'SUBMISSION_PHASE_INPUT_REFUSED',
      'spec-intake.submission-phase-invalid',
      'spec-intake.known-submission-phase-provided',
    );
  }
}

interface ExecutableSourceRule {
  operation: string;
  execute(given: JsonObject, when: JsonObject): NormalizedExpected | Promise<NormalizedExpected>;
}

export const SOURCE_RULES: Record<string, ExecutableSourceRule> = {
  'spec-intake.rule.answer-provenance': {
    operation: 'spec-intake.record.answer',
    execute: answerRecordExpected,
  },
  'spec-intake.rule.declined-answer-record': {
    operation: 'spec-intake.record.declined',
    execute: declinedRecordExpected,
  },
  'spec-intake.rule.break-record': {
    operation: 'spec-intake.record.break',
    execute: breakRecordExpected,
  },
  'spec-intake.rule.reveal-content': {
    operation: 'spec-intake.reveal.build',
    execute: revealExpected,
  },
  'spec-intake.rule.spec-pair-integrity': {
    operation: 'spec-intake.spec-pair.check',
    execute: driftExpected,
  },
  'spec-intake.rule.fatigue-signal': {
    operation: 'spec-intake.fatigue.inspect',
    execute: fatigueExpected,
  },
  'spec-intake.rule.structured-generation': {
    operation: 'spec-intake.generation.attempt',
    execute: generationExpected,
  },
  'spec-intake.rule.session-resume': {
    operation: 'spec-intake.session.resume',
    execute: sessionResumeExpected,
  },
  'spec-intake.rule.one-way-submission': {
    operation: 'spec-intake.submission.submit',
    execute: submissionExpected,
  },
  'spec-intake.rule.freeze-on-drift': {
    operation: 'spec-intake.submission.inspect-drift-freeze',
    execute: driftFreezeExpected,
  },
  'spec-intake.rule.submission-phase': {
    operation: 'spec-intake.submission.inspect-one-way',
    execute: submissionOneWayExpected,
  },
};

const alignedPair = (): SpecPair => ({
  human: {
    title: 'Overdue record view',
    problem: 'Operators rebuild a list by hand.',
    outcome: 'One read-only view shows overdue records.',
    statements: [
      { id: 'H1', kind: 'requirement', text: 'Show overdue records.', source: 'stated' },
      { id: 'H2', kind: 'requirement', text: 'Sort oldest first.', source: 'drafted_confirmed' },
      { id: 'H3', kind: 'constraint', text: 'Write nothing.', source: 'stated' },
    ],
    happy_path: ['Open the view', 'Read overdue records'],
    out_of_scope: ['Sending messages'],
    what_would_make_this_fail: ['The due-date boundary is ambiguous'],
    half_value: 'The unsorted list still has value.',
    blast_radius_ceiling: 'Read-only access to synthetic records.',
  },
  tech: {
    approach: 'One read-only query and view.',
    items: [
      {
        id: 'T1',
        title: 'Overdue query',
        detail: 'Select overdue records.',
        derived_from: ['H1'],
        depends_on: [],
        acceptance: [
          {
            given: 'an overdue record',
            when: 'the query runs',
            then: 'the record is returned',
            adjudicated_by: 'synthetic-check-one',
          },
        ],
      },
      {
        id: 'T2',
        title: 'Oldest-first view',
        detail: 'Order the query result.',
        derived_from: ['H2'],
        depends_on: ['T1'],
        acceptance: [
          {
            given: 'two overdue records',
            when: 'the view opens',
            then: 'the older record is first',
            adjudicated_by: 'synthetic-check-two',
          },
        ],
      },
    ],
    ticket_order: ['T1', 'T2'],
  },
});

function pairWithInventedScope(): SpecPair {
  const pair = structuredClone(alignedPair());
  pair.tech.items.push({
    ...structuredClone(pair.tech.items[0]!),
    id: 'T3',
    title: 'Unrequested message sender',
    derived_from: [],
  });
  pair.tech.ticket_order.push('T3');
  return pair;
}

function pairWithDroppedRequirement(): SpecPair {
  const pair = structuredClone(alignedPair());
  pair.tech.items = [pair.tech.items[0]!];
  pair.tech.ticket_order = ['T1'];
  return pair;
}

function pairWithWrongOrder(): SpecPair {
  const pair = structuredClone(alignedPair());
  pair.tech.ticket_order = ['T2', 'T1'];
  return pair;
}

function pairWithDanglingTrace(): SpecPair {
  const pair = structuredClone(alignedPair());
  pair.tech.items[0] = { ...pair.tech.items[0]!, derived_from: ['H9'] };
  return pair;
}

function turn(requesterChars: number, eventsRecorded = 1): JsonObject {
  return { at: FIXED_AT, phase: 'gathering', requesterChars, agentChars: 100, eventsRecorded };
}

const revealEvents: SessionEvent[] = [
  {
    kind: 'answer',
    at: FIXED_AT,
    turn: 1,
    data: { slot: 'audience', value: 'Operations', source: 'stated', quote: 'operations' },
  },
  {
    kind: 'answer',
    at: FIXED_AT,
    turn: 2,
    data: {
      slot: 'date_boundary',
      value: 'UTC midnight',
      source: 'drafted_confirmed',
      quote: 'yes, use UTC midnight',
    },
  },
  {
    kind: 'fork',
    at: FIXED_AT,
    turn: 3,
    data: {
      question: 'Result size',
      options: ['All records', 'Page at one hundred'],
      decision: 'Page at one hundred',
      fallback: 'Raise the page size after observing list length',
      decided_by: 'agent',
    },
  },
  {
    kind: 'assumption',
    at: FIXED_AT,
    turn: 4,
    data: { text: 'Dates are stored in UTC.', why_not_verified: 'The requester does not own storage.' },
  },
  {
    kind: 'declined',
    at: FIXED_AT,
    turn: 5,
    data: { question: 'How are disputed records shown?', why: 'The requester deferred this answer.' },
  },
];

function resumeSession(): Session {
  return {
    ...newSession('fixture-session', FIXED_AT),
    updatedAt: FIXED_AT,
    phase: 'panel',
    messages: [
      { role: 'user', content: 'Show overdue records.' },
      { role: 'assistant', content: 'Which date boundary applies?' },
    ],
    events: [revealEvents[0]!],
    turns: [turn(24) as any],
  };
}

interface ExperimentCase {
  fixtureId: string;
  capability: string;
  given: JsonObject;
  when: JsonObject & { operation: string };
  invariants: string[];
  sourceRules: string[];
  normalization: string;
  disposition: Pick<NormalizedExpected, 'outcome' | 'code'>;
}

export const EXPERIMENT_CASES: ExperimentCase[] = [
  {
    fixtureId: 'spec-intake.stated-answer-provenance',
    capability: 'intake.answer-provenance',
    given: {},
    when: {
      operation: 'spec-intake.record.answer',
      at: FIXED_AT,
      turn: 1,
      input: { slot: 'audience', value: 'Operations', source: 'stated', quote: 'operations' },
    },
    invariants: ['intake.stated-answer-remains-stated'],
    sourceRules: ['spec-intake.rule.answer-provenance'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW means only that the legacy recorder accepted and preserved the stated provenance; it grants no downstream decision authority.',
    disposition: { outcome: 'ALLOW', code: 'ANSWER_PROVENANCE_RECORDED' },
  },
  {
    fixtureId: 'spec-intake.drafted-confirmed-answer-provenance',
    capability: 'intake.answer-provenance',
    given: {},
    when: {
      operation: 'spec-intake.record.answer',
      at: FIXED_AT,
      turn: 2,
      input: {
        slot: 'date_boundary',
        value: 'UTC midnight',
        source: 'drafted_confirmed',
        quote: 'yes, use UTC midnight',
      },
    },
    invariants: ['intake.drafted-confirmed-not-relabelled-stated'],
    sourceRules: ['spec-intake.rule.answer-provenance'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW preserves drafted_confirmed as distinct from stated and does not treat requester confirmation as downstream authority.',
    disposition: { outcome: 'ALLOW', code: 'ANSWER_PROVENANCE_RECORDED' },
  },
  {
    fixtureId: 'spec-intake.malformed-answer-record-refused',
    capability: 'intake.answer-provenance',
    given: {},
    when: {
      operation: 'spec-intake.record.answer',
      at: FIXED_AT,
      turn: 3,
      input: { slot: 'date_boundary', value: 'UTC midnight', source: 'invented', quote: '' },
    },
    invariants: ['intake.malformed-record-fails-closed'],
    sourceRules: ['spec-intake.rule.answer-provenance'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: REFUSE means the legacy schema cannot evaluate an unknown provenance or empty requester quote; valid input is the named recovery.',
    disposition: { outcome: 'REFUSE', code: 'ANSWER_RECORD_REFUSED' },
  },
  {
    fixtureId: 'spec-intake.declined-answer-record',
    capability: 'intake.declined-answer-record',
    given: {},
    when: {
      operation: 'spec-intake.record.declined',
      at: FIXED_AT,
      turn: 4,
      input: { question: 'How are disputed records shown?', why: 'The requester deferred this answer.' },
    },
    invariants: ['intake.declined-answer-remains-visible'],
    sourceRules: ['spec-intake.rule.declined-answer-record'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW means the declined-answer record was accepted as authoring evidence, not that the unanswered question was decided.',
    disposition: { outcome: 'ALLOW', code: 'DECLINED_ANSWER_RECORDED' },
  },
  {
    fixtureId: 'spec-intake.break-record-with-fallback',
    capability: 'intake.break-record',
    given: {},
    when: {
      operation: 'spec-intake.record.break',
      at: FIXED_AT,
      turn: 5,
      input: {
        question: 'Result size',
        options: ['All records', 'Page at one hundred'],
        decision: 'Page at one hundred',
        fallback: 'Raise the page size after observing list length',
        decided_by: 'agent',
      },
    },
    invariants: ['intake.break-record-keeps-options-decision-fallback'],
    sourceRules: ['spec-intake.rule.break-record'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW preserves the legacy fork, defaulting actor and fallback without promoting the Agent choice into a human decision.',
    disposition: { outcome: 'ALLOW', code: 'BREAK_RECORD_RECORDED' },
  },
  {
    fixtureId: 'spec-intake.reveal-correction-content',
    capability: 'intake.reveal-content',
    given: { events: revealEvents },
    when: { operation: 'spec-intake.reveal.build' },
    invariants: ['intake.reveal-exposes-inference-default-assumption-declined'],
    sourceRules: ['spec-intake.rule.reveal-content'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: PASS checks the legacy reveal query exposes correction material in its fixed section order; it is not a Delivery seal or later human decision.',
    disposition: { outcome: 'PASS', code: 'REVEAL_CORRECTION_CONTENT_EXPOSED' },
  },
  {
    fixtureId: 'spec-intake.spec-pair-aligned',
    capability: 'intake.spec-pair-integrity',
    given: { pair: alignedPair() },
    when: { operation: 'spec-intake.spec-pair.check' },
    invariants: ['intake.bidirectional-trace-and-order-hold'],
    sourceRules: ['spec-intake.rule.spec-pair-integrity'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW means the legacy pair passed trace and ordering checks only; it does not seal a v0.10 spec or authorise downstream work.',
    disposition: { outcome: 'ALLOW', code: 'SPEC_PAIR_ALIGNED' },
  },
  {
    fixtureId: 'spec-intake.invented-scope-blocked',
    capability: 'intake.invented-scope-detection',
    given: { pair: pairWithInventedScope() },
    when: { operation: 'spec-intake.spec-pair.check' },
    invariants: ['intake.untraced-tech-item-blocked'],
    sourceRules: ['spec-intake.rule.spec-pair-integrity'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: BLOCK is the known trace prerequisite; the same executable rule admits the pair after the untraced item is removed.',
    disposition: { outcome: 'BLOCK', code: 'INVENTED_SCOPE_BLOCKED' },
  },
  {
    fixtureId: 'spec-intake.dropped-requirement-blocked',
    capability: 'intake.dropped-requirement-detection',
    given: { pair: pairWithDroppedRequirement() },
    when: { operation: 'spec-intake.spec-pair.check' },
    invariants: ['intake.unimplemented-requirement-blocked'],
    sourceRules: ['spec-intake.rule.spec-pair-integrity'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: BLOCK is the known implementation-link prerequisite; the aligned-pair case proves the executable exit condition.',
    disposition: { outcome: 'BLOCK', code: 'DROPPED_REQUIREMENT_BLOCKED' },
  },
  {
    fixtureId: 'spec-intake.dependency-order-blocked',
    capability: 'intake.dependency-ordering',
    given: { pair: pairWithWrongOrder() },
    when: { operation: 'spec-intake.spec-pair.check' },
    invariants: ['intake.dependency-precedes-dependent'],
    sourceRules: ['spec-intake.rule.spec-pair-integrity'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: BLOCK names the correctable ordering prerequisite; the aligned-pair case executes the corrected order and returns ALLOW.',
    disposition: { outcome: 'BLOCK', code: 'DEPENDENCY_ORDER_BLOCKED' },
  },
  {
    fixtureId: 'spec-intake.fatigue-signal-recorded',
    capability: 'intake.fatigue-signal',
    given: { turns: [turn(70, 0), turn(65, 0), turn(60, 0)] },
    when: { operation: 'spec-intake.fatigue.inspect' },
    invariants: ['intake.fatigue-observation-recorded-without-invented-gate'],
    sourceRules: ['spec-intake.rule.fatigue-signal'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: RECORD_ONLY preserves the executable fatigue observation without turning an unvalidated threshold into target blocking authority.',
    disposition: { outcome: 'RECORD_ONLY', code: 'FATIGUE_SIGNAL_RECORDED' },
  },
  {
    fixtureId: 'spec-intake.fatigue-signal-clear',
    capability: 'intake.fatigue-signal',
    given: { turns: [turn(70), turn(20), turn(65)] },
    when: { operation: 'spec-intake.fatigue.inspect' },
    invariants: ['intake.fatigue-rule-not-always-on'],
    sourceRules: ['spec-intake.rule.fatigue-signal'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: RECORD_ONLY records that the legacy fatigue rule stayed quiet; it is an observation and not a governance decision.',
    disposition: { outcome: 'RECORD_ONLY', code: 'FATIGUE_SIGNAL_CLEAR' },
  },
  {
    fixtureId: 'spec-intake.structured-generation-success',
    capability: 'intake.structured-generation',
    given: { model_outputs: [alignedPair()] },
    when: { operation: 'spec-intake.generation.attempt' },
    invariants: ['intake.structured-generation-schema-and-drift-checked'],
    sourceRules: ['spec-intake.rule.structured-generation'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW means the deterministic client drove the production generation parser and drift check successfully; it grants no authority beyond authoring.',
    disposition: { outcome: 'ALLOW', code: 'STRUCTURED_DOCUMENTS_GENERATED' },
  },
  {
    fixtureId: 'spec-intake.structured-generation-repaired',
    capability: 'intake.structured-generation-repair',
    given: { model_outputs: [pairWithDanglingTrace(), alignedPair()] },
    when: { operation: 'spec-intake.generation.attempt' },
    invariants: ['intake.generated-drift-retried-before-reveal'],
    sourceRules: ['spec-intake.rule.structured-generation'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW is derived only after production generation rejects the first drifting pair and a second structured output aligns.',
    disposition: { outcome: 'ALLOW', code: 'STRUCTURED_DOCUMENTS_REPAIRED' },
  },
  {
    fixtureId: 'spec-intake.structured-generation-drift-blocked',
    capability: 'intake.structured-generation-repair-ceiling',
    given: { model_outputs: [pairWithDanglingTrace()] },
    when: { operation: 'spec-intake.generation.attempt' },
    invariants: ['intake.generated-drift-blocks-after-retry-ceiling'],
    sourceRules: ['spec-intake.rule.structured-generation'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: BLOCK follows three executable drifted attempts; the successful generation case proves the named aligned-pair exit condition.',
    disposition: { outcome: 'BLOCK', code: 'GENERATED_DOCUMENTS_DRIFT_BLOCKED' },
  },
  {
    fixtureId: 'spec-intake.malformed-structured-output-refused',
    capability: 'intake.malformed-output-refusal',
    given: { model_outputs: [{ human: {}, tech: {} }] },
    when: { operation: 'spec-intake.generation.attempt' },
    invariants: ['intake.malformed-structured-output-fails-closed'],
    sourceRules: ['spec-intake.rule.structured-generation'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: REFUSE means the production structured parser could not form an evaluable pair; the valid generation case proves recovery.',
    disposition: { outcome: 'REFUSE', code: 'STRUCTURED_MODEL_OUTPUT_REFUSED' },
  },
  {
    fixtureId: 'spec-intake.session-resume-intact',
    capability: 'intake.session-resume',
    given: { session: resumeSession() },
    when: { operation: 'spec-intake.session.resume' },
    invariants: ['intake.resumed-session-preserves-conversation'],
    sourceRules: ['spec-intake.rule.session-resume'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: PASS compares the production store round-trip and proves the legacy session content resumes intact.',
    disposition: { outcome: 'PASS', code: 'SESSION_RESUMED_INTACT' },
  },
  {
    fixtureId: 'spec-intake.malformed-stored-session-refused',
    capability: 'intake.session-resume',
    given: { session: { ...resumeSession(), phase: 'almost_done' } },
    when: { operation: 'spec-intake.session.resume' },
    invariants: ['intake.corrupt-session-never-becomes-empty-session'],
    sourceRules: ['spec-intake.rule.session-resume'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: REFUSE preserves fail-closed loading of an invalid stored session; the intact resume case proves the valid-input recovery.',
    disposition: { outcome: 'REFUSE', code: 'MALFORMED_SESSION_REFUSED' },
  },
  {
    fixtureId: 'spec-intake.one-way-submission-recorded',
    capability: 'intake.one-way-submission',
    given: { documents: alignedPair() },
    when: {
      operation: 'spec-intake.submission.submit',
      owner: { name: 'Fixture Operator', email: 'fixture@example.invalid' },
    },
    invariants: ['intake.approved-submission-writes-one-envelope'],
    sourceRules: ['spec-intake.rule.one-way-submission'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: ALLOW means the legacy approved submission wrote and retained one envelope; it is not a v0.10 seal, merge or downstream decision.',
    disposition: { outcome: 'ALLOW', code: 'ONE_WAY_SUBMISSION_RECORDED' },
  },
  {
    fixtureId: 'spec-intake.drifting-submission-frozen',
    capability: 'intake.freeze-on-submit-drift',
    given: { documents: pairWithDanglingTrace() },
    when: {
      operation: 'spec-intake.submission.inspect-drift-freeze',
      owner: { name: 'Fixture Operator', email: 'fixture@example.invalid' },
    },
    invariants: ['intake.drifting-submission-freezes-and-retains-envelope'],
    sourceRules: ['spec-intake.rule.freeze-on-drift'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: PASS verifies the legacy freeze record, envelope retention and emitted resume notice; it explicitly does not claim the frozen correction transition is implemented.',
    disposition: { outcome: 'PASS', code: 'DRIFTING_SUBMISSION_FROZEN' },
  },
  {
    fixtureId: 'spec-intake.submitted-state-one-way',
    capability: 'intake.one-way-submission',
    given: { phase: 'submitted' },
    when: { operation: 'spec-intake.submission.inspect-one-way' },
    invariants: ['intake.submitted-has-no-normal-reentry'],
    sourceRules: ['spec-intake.rule.submission-phase'],
    normalization: 'Adapter-derived shared outcome and recovery metadata: PASS inspects the production phase table: submitted admits only failure-freeze and has no normal authoring re-entry; this is legacy behaviour, not target ownership.',
    disposition: { outcome: 'PASS', code: 'SUBMISSION_ONE_WAY_INVARIANT_HELD' },
  },
];

const RULE_BY_OPERATION = Object.fromEntries(
  Object.values(SOURCE_RULES).map((rule) => [rule.operation, rule]),
) as Record<string, ExecutableSourceRule>;

export async function executeFixtureCase(givenRaw: unknown, whenRaw: unknown): Promise<NormalizedExpected> {
  try {
    const given = asObject(givenRaw, 'given');
    const when = asObject(whenRaw, 'when');
    const operation = when.operation;
    if (typeof operation !== 'string' || RULE_BY_OPERATION[operation] === undefined) {
      return inputRefused(
        'FIXTURE_INPUT_REFUSED',
        'spec-intake.fixture-operation-unknown',
        'spec-intake.known-fixture-operation-provided',
      );
    }
    return await RULE_BY_OPERATION[operation]!.execute(given, when);
  } catch {
    return inputRefused(
      'FIXTURE_INPUT_REFUSED',
      'spec-intake.fixture-input-unevaluable',
      'spec-intake.evaluable-fixture-input-provided',
    );
  }
}

async function assertSourceRuleCases(): Promise<void> {
  for (const testCase of EXPERIMENT_CASES) {
    const actual = await executeFixtureCase(testCase.given, testCase.when);
    deepStrictEqual({ outcome: actual.outcome, code: actual.code }, testCase.disposition);
  }

  const corrected = await executeFixtureCase(
    { pair: alignedPair() },
    { operation: 'spec-intake.spec-pair.check' },
  );
  deepStrictEqual({ outcome: corrected.outcome, code: corrected.code }, { outcome: 'ALLOW', code: 'SPEC_PAIR_ALIGNED' });

  const validRecord = await executeFixtureCase(
    {},
    {
      operation: 'spec-intake.record.answer',
      at: FIXED_AT,
      turn: 1,
      input: { slot: 'audience', value: 'Operations', source: 'stated', quote: 'operations' },
    },
  );
  deepStrictEqual({ outcome: validRecord.outcome, code: validRecord.code }, { outcome: 'ALLOW', code: 'ANSWER_PROVENANCE_RECORDED' });
}

export const SOURCE_TESTS = {
  [SOURCE_TEST_ID]: async () => {
    const operations = Object.values(SOURCE_RULES).map((rule) => rule.operation);
    deepStrictEqual(new Set(operations).size, operations.length);
    deepStrictEqual(
      await executeFixtureCase({}, { operation: 'spec-intake.unknown' }),
      inputRefused(
        'FIXTURE_INPUT_REFUSED',
        'spec-intake.fixture-operation-unknown',
        'spec-intake.known-fixture-operation-provided',
      ),
    );
    await assertSourceRuleCases();
  },
} as const;

export const ADAPTER_REGISTRY: Record<
  string,
  (given: unknown, when: unknown) => Promise<NormalizedExpected>
> = {
  [ADAPTER_ID]: executeFixtureCase,
};

export const NORMALIZATION_RULES = {
  [OUTCOME_RULE]: (value: NormalizedExpected) => ({ outcome: value.outcome, code: value.code }),
  [RESULT_RULE]: (value: NormalizedExpected) => value.result,
  [RECOVERY_RULE]: (value: NormalizedExpected) => ({
    owner: value.owner,
    exit_condition: value.exit_condition,
    invalidated_evidence: value.invalidated_evidence,
  }),
} as const;

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
}

function assertPinnedExecutableRevision(sourceRevision: string): void {
  git(['rev-parse', '--verify', `${sourceRevision}^{commit}`]);
  git(['merge-base', '--is-ancestor', sourceRevision, 'HEAD']);
  const pinnedBlob = git(['rev-parse', `${sourceRevision}:tests/fixture-adapter.ts`]);
  const headBlob = git(['rev-parse', 'HEAD:tests/fixture-adapter.ts']);
  if (pinnedBlob !== headBlob) throw new Error('fixture adapter blob differs from its pinned executable revision');

  const changed = git(['diff', '--name-only', `${sourceRevision}..HEAD`])
    .split('\n')
    .filter(Boolean)
    .filter(
      (path) => !(
        path.startsWith('fixtures/experiment/')
        || path.startsWith('gaps/experiment/')
        || path === 'CURRENT-DIRECTION.md'
        || path === 'docs/EXPERIMENT-FIXTURE-EXPORT.md'
      ),
    );
  if (changed.length > 0) {
    throw new Error(`executable provenance changed after pinned revision: ${changed.join(', ')}`);
  }

  const trackedFixtures = git(['ls-tree', '-r', '--name-only', 'HEAD', 'fixtures/experiment']);
  if (trackedFixtures && sourceRevision === git(['rev-parse', 'HEAD'])) {
    throw new Error('tracked fixtures must follow their executable provenance revision');
  }
}

function requireAdapter(fixture: LegacyFixture): AdapterDeclaration {
  const adapter = fixture.legacy_context.adapter;
  if (adapter === undefined) throw new Error('legacy fixture has no adapter declaration');
  return adapter;
}

function requireStringList(value: string[] | undefined, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`fixture has no ${field}`);
  return value;
}

async function verifyFixtureV3(fixture: LegacyFixture): Promise<void> {
  if (fixture.fixture_version !== '3.0') throw new Error('fixture contract version must be 3.0');
  if (fixture.source_repository !== 'spec-intake') throw new Error('fixture source repository must be spec-intake');
  const adapter = requireAdapter(fixture);
  const adapterExecutor = ADAPTER_REGISTRY[adapter.id];
  if (adapterExecutor === undefined) throw new Error('fixture names an unresolved adapter');
  if (adapter.verifier_rule !== VERIFIER_RULE) throw new Error('fixture names an unresolved verifier rule');
  if (adapter.invalidated_evidence_rule !== 'none') {
    throw new Error('spec-intake exports no evidence-invalidation adapter rule');
  }
  const outcomeNormalizer = NORMALIZATION_RULES[adapter.outcome_rule as keyof typeof NORMALIZATION_RULES];
  const resultNormalizer = NORMALIZATION_RULES[adapter.result_rule as keyof typeof NORMALIZATION_RULES];
  const recoveryNormalizer = NORMALIZATION_RULES[adapter.recovery_rule as keyof typeof NORMALIZATION_RULES];
  if (outcomeNormalizer === undefined || resultNormalizer === undefined || recoveryNormalizer === undefined) {
    throw new Error('fixture names an unresolved normalization rule');
  }
  const sourceTests = requireStringList(adapter.source_tests, 'source tests');
  const sourceRules = requireStringList(adapter.source_rules, 'source rules');
  for (const id of sourceTests) {
    if (SOURCE_TESTS[id as keyof typeof SOURCE_TESTS] === undefined) throw new Error(`unknown source test: ${id}`);
  }
  for (const id of sourceRules) {
    const rule = SOURCE_RULES[id];
    if (rule === undefined) throw new Error(`unknown source rule: ${id}`);
    if (rule.operation !== fixture.when.operation) throw new Error(`${id} does not own ${fixture.when.operation}`);
  }
  assertPinnedExecutableRevision(adapter.source_revision);
  for (const id of sourceTests) await SOURCE_TESTS[id as keyof typeof SOURCE_TESTS]();

  const actual = await adapterExecutor(fixture.given, fixture.when);
  deepStrictEqual(actual.invalidated_evidence, []);
  for (const id of sourceRules) {
    deepStrictEqual(await SOURCE_RULES[id]!.execute(fixture.given, fixture.when), actual);
  }
  deepStrictEqual(outcomeNormalizer(actual) as unknown, { outcome: actual.outcome, code: actual.code });
  deepStrictEqual(resultNormalizer(actual) as unknown, actual.result);
  deepStrictEqual(recoveryNormalizer(actual) as unknown, {
    owner: actual.owner,
    exit_condition: actual.exit_condition,
    invalidated_evidence: actual.invalidated_evidence,
  });
  deepStrictEqual(actual, fixture.expected);
}

export const VERIFIER_REGISTRY: Record<string, (fixture: LegacyFixture) => Promise<void>> = {
  [VERIFIER_RULE]: verifyFixtureV3,
};

export async function verifyFixture(fixture: LegacyFixture): Promise<void> {
  const verifier = VERIFIER_REGISTRY[fixture.legacy_context.adapter.verifier_rule];
  if (verifier === undefined) throw new Error('fixture names an unresolved or non-executable verifier');
  await verifier(fixture);
}

export function loadFixture(path: string): LegacyFixture {
  return JSON.parse(readFileSync(path, 'utf8')) as LegacyFixture;
}

export async function exportFixtureDocuments(sourceRevision: string): Promise<LegacyFixture[]> {
  const documents: LegacyFixture[] = [];
  for (const testCase of EXPERIMENT_CASES) {
    documents.push({
      fixture_version: '3.0',
      fixture_id: testCase.fixtureId,
      source_repository: 'spec-intake',
      capability: testCase.capability,
      status: 'legacy_behaviour',
      given: testCase.given,
      when: testCase.when,
      expected: await executeFixtureCase(testCase.given, testCase.when),
      invariants: testCase.invariants,
      legacy_context: {
        adapter: {
          id: ADAPTER_ID,
          source_revision: sourceRevision,
          source_tests: [SOURCE_TEST_ID],
          source_rules: testCase.sourceRules,
          verifier_rule: VERIFIER_RULE,
          outcome_rule: OUTCOME_RULE,
          result_rule: RESULT_RULE,
          recovery_rule: RECOVERY_RULE,
          invalidated_evidence_rule: 'none',
        },
        normalization: testCase.normalization,
      },
    });
  }
  return documents;
}
