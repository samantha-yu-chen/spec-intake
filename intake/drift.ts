import type { HumanSpec, SpecPair, TechSpec } from './spec.ts';

// WHY: CLAUDE.md § 2 requires the check in both directions, and both directions
// are set differences once ids exist. No model is asked whether it drifted.

export type DriftCode =
  | 'nothing_to_check'
  | 'invented_scope'
  | 'dropped_requirement'
  | 'dangling_derivation'
  | 'missing_from_order'
  | 'unknown_in_order'
  | 'duplicated_in_order'
  | 'self_dependency'
  | 'unknown_dependency'
  | 'dependency_after_dependent';

export interface DriftFinding {
  code: DriftCode;
  subject: string;
  detail: string;
}

export function checkSpecPair(pair: SpecPair): DriftFinding[] {
  return [...checkTrace(pair.human, pair.tech), ...checkOrder(pair.tech)];
}

export interface TraceRow {
  statement: string;
  kind: HumanSpec['statements'][number]['kind'];
  text: string;
  implemented_by: string[];
}

// WHY: the trace map travels with the sealed contract. It is what lets an
// auditor tell an authorised requirement from an item the agent added, without
// reading the conversation.
export function traceMap(pair: SpecPair): TraceRow[] {
  return pair.human.statements.map((statement) => ({
    statement: statement.id,
    kind: statement.kind,
    text: statement.text,
    implemented_by: pair.tech.items.filter((item) => item.derived_from.includes(statement.id)).map((item) => item.id),
  }));
}

export function checkTrace(human: HumanSpec, tech: TechSpec): DriftFinding[] {
  const empty = refuseEmpty(human, tech);
  if (empty.length > 0) return empty;
  return [...inventedScope(human, tech), ...droppedRequirements(human, tech)];
}

// WHY: a check that cannot evaluate its condition refuses. An empty side would
// otherwise produce zero findings and read as "no drift".
function refuseEmpty(human: HumanSpec, tech: TechSpec): DriftFinding[] {
  const findings: DriftFinding[] = [];
  if (human.statements.length === 0) {
    findings.push({ code: 'nothing_to_check', subject: 'human-spec', detail: 'no statements to trace against' });
  }
  if (tech.items.length === 0) {
    findings.push({ code: 'nothing_to_check', subject: 'tech-spec', detail: 'no items to trace' });
  }
  return findings;
}

function inventedScope(human: HumanSpec, tech: TechSpec): DriftFinding[] {
  const known = new Set(human.statements.map((statement) => statement.id));
  return tech.items.flatMap((item): DriftFinding[] => {
    if (item.derived_from.length === 0) {
      return [{ code: 'invented_scope', subject: item.id, detail: `${item.id} derives from no human-spec statement` }];
    }
    return item.derived_from
      .filter((id) => !known.has(id))
      .map((id) => ({ code: 'dangling_derivation', subject: item.id, detail: `${item.id} derives from ${id}, which is not in the human-spec` }));
  });
}

function droppedRequirements(human: HumanSpec, tech: TechSpec): DriftFinding[] {
  const implemented = new Set(tech.items.flatMap((item) => item.derived_from));
  return human.statements
    .filter((statement) => statement.kind === 'requirement' && !implemented.has(statement.id))
    .map((statement) => ({
      code: 'dropped_requirement' as const,
      subject: statement.id,
      detail: `${statement.id} is a requirement no tech-spec item implements: ${statement.text}`,
    }));
}

export function checkOrder(tech: TechSpec): DriftFinding[] {
  if (tech.items.length === 0) {
    return [{ code: 'nothing_to_check', subject: 'tech-spec', detail: 'no items to order' }];
  }
  return [...coversEveryItem(tech), ...dependenciesComeFirst(tech)];
}

function coversEveryItem(tech: TechSpec): DriftFinding[] {
  const ids = new Set(tech.items.map((item) => item.id));
  const seen = new Set<string>();
  const findings: DriftFinding[] = [];
  for (const id of tech.ticket_order) {
    if (!ids.has(id)) findings.push({ code: 'unknown_in_order', subject: id, detail: `${id} is ordered but is not an item` });
    else if (seen.has(id)) findings.push({ code: 'duplicated_in_order', subject: id, detail: `${id} appears twice in the ticket order` });
    seen.add(id);
  }
  for (const id of ids) {
    if (!seen.has(id)) findings.push({ code: 'missing_from_order', subject: id, detail: `${id} has no place in the ticket order` });
  }
  return findings;
}

function dependenciesComeFirst(tech: TechSpec): DriftFinding[] {
  const ids = new Set(tech.items.map((item) => item.id));
  const positionOf = new Map(tech.ticket_order.map((id, index) => [id, index] as const));
  return tech.items.flatMap((item) => item.depends_on.flatMap((need) => dependencyFindings(item.id, need, ids, positionOf)));
}

function dependencyFindings(
  id: string,
  need: string,
  ids: ReadonlySet<string>,
  positionOf: ReadonlyMap<string, number>,
): DriftFinding[] {
  if (need === id) return [{ code: 'self_dependency', subject: id, detail: `${id} depends on itself` }];
  if (!ids.has(need)) return [{ code: 'unknown_dependency', subject: id, detail: `${id} depends on ${need}, which is not an item` }];
  const here = positionOf.get(id);
  const there = positionOf.get(need);
  if (here === undefined || there === undefined || there < here) return [];
  return [{ code: 'dependency_after_dependent', subject: id, detail: `${id} is ordered before ${need}, which it depends on` }];
}
