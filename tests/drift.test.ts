import { describe, expect, it } from 'vitest';
import { checkOrder, checkSpecPair, checkTrace, type DriftCode } from '../intake/drift.ts';
import type { HumanSpec, SpecPair, TechSpec } from '../intake/spec.ts';

function human(overrides: Partial<HumanSpec> = {}): HumanSpec {
  return {
    title: 'Overdue invoice view',
    problem: 'Collections chases invoices from a spreadsheet rebuilt by hand each morning.',
    outcome: 'Collections opens one page and sees what is overdue today.',
    statements: [
      { id: 'H1', kind: 'requirement', text: 'Show every invoice past its due date.', source: 'stated' },
      { id: 'H2', kind: 'requirement', text: 'Sort by how many days overdue.', source: 'stated' },
      { id: 'H3', kind: 'constraint', text: 'Read-only; nobody edits an invoice here.', source: 'drafted_confirmed' },
    ],
    happy_path: ['Open the page', 'See overdue invoices, most overdue first'],
    out_of_scope: ['Sending reminder emails'],
    what_would_make_this_fail: ['The due date is stored per customer timezone and the boundary day is wrong'],
    half_value: 'Half is useful: the list without the sort still beats the spreadsheet.',
    blast_radius_ceiling: 'Reads the invoices table. Writes nothing, touches no billing job.',
    ...overrides,
  };
}

function tech(overrides: Partial<TechSpec> = {}): TechSpec {
  return {
    approach: 'One read-only query behind one page.',
    items: [
      {
        id: 'T1',
        title: 'Overdue query',
        detail: 'Select invoices where due_date < today and paid_at is null.',
        derived_from: ['H1'],
        depends_on: [],
        acceptance: [
          { given: 'an invoice due yesterday and unpaid', when: 'the query runs', then: 'the invoice is in the result', adjudicated_by: 'tests/overdue-query.test.ts' },
        ],
      },
      {
        id: 'T2',
        title: 'Sort by days overdue',
        detail: 'Order the result by due_date ascending.',
        derived_from: ['H2'],
        depends_on: ['T1'],
        acceptance: [
          { given: 'invoices 2 and 40 days overdue', when: 'the page renders', then: 'the 40-day invoice is first', adjudicated_by: 'tests/overdue-page.test.ts' },
        ],
      },
    ],
    ticket_order: ['T1', 'T2'],
    ...overrides,
  };
}

function codes(findings: { code: DriftCode }[]): DriftCode[] {
  return findings.map((finding) => finding.code);
}

describe('drift, tech-spec to human-spec', () => {
  it('passes a pair where every item traces and every requirement is implemented', () => {
    expect(checkSpecPair({ human: human(), tech: tech() })).toEqual([]);
  });

  it('flags an item that derives from nothing as invented scope', () => {
    const invented = tech();
    invented.items = [...invented.items, { ...invented.items[0]!, id: 'T3', title: 'Audit log', derived_from: [], depends_on: [] }];
    invented.ticket_order = ['T1', 'T2', 'T3'];

    expect(codes(checkTrace(human(), invented))).toContain('invented_scope');
  });

  it('flags an item deriving from a statement that is not in the human-spec', () => {
    const invented = tech();
    invented.items[1] = { ...invented.items[1]!, derived_from: ['H9'] };

    expect(codes(checkTrace(human(), invented))).toContain('dangling_derivation');
  });
});

describe('drift, human-spec to tech-spec', () => {
  it('flags a requirement no item implements', () => {
    const dropped = tech();
    dropped.items = [dropped.items[0]!];
    dropped.ticket_order = ['T1'];

    const findings = checkTrace(human(), dropped);

    expect(codes(findings)).toContain('dropped_requirement');
    expect(findings.find((finding) => finding.code === 'dropped_requirement')?.subject).toBe('H2');
  });

  it('does not demand an implementing item for context, constraints or non-goals', () => {
    expect(codes(checkTrace(human(), tech()))).not.toContain('dropped_requirement');
  });
});

describe('drift refuses what it cannot evaluate', () => {
  it('reports an empty human-spec rather than finding no drift', () => {
    expect(codes(checkTrace(human({ statements: [] }), tech()))).toContain('nothing_to_check');
  });

  it('reports an empty tech-spec rather than finding no drift', () => {
    expect(codes(checkTrace(human(), tech({ items: [], ticket_order: [] })))).toContain('nothing_to_check');
  });
});

describe('ticket order', () => {
  it('flags an item with no place in the order', () => {
    expect(codes(checkOrder(tech({ ticket_order: ['T1'] })))).toContain('missing_from_order');
  });

  it('flags an ordered id that is not an item, and one ordered twice', () => {
    expect(codes(checkOrder(tech({ ticket_order: ['T1', 'T2', 'T7'] })))).toContain('unknown_in_order');
    expect(codes(checkOrder(tech({ ticket_order: ['T1', 'T1', 'T2'] })))).toContain('duplicated_in_order');
  });

  it('flags an item ordered before something it depends on', () => {
    expect(codes(checkOrder(tech({ ticket_order: ['T2', 'T1'] })))).toContain('dependency_after_dependent');
  });

  it('flags a dependency on an item that does not exist, and on itself', () => {
    const broken = tech();
    broken.items[1] = { ...broken.items[1]!, depends_on: ['T9', 'T2'] };

    expect(codes(checkOrder(broken))).toEqual(expect.arrayContaining(['unknown_dependency', 'self_dependency']));
  });

  it('checks both trace and order from the pair', () => {
    const pair: SpecPair = { human: human(), tech: tech({ ticket_order: ['T2', 'T1'] }) };

    expect(codes(checkSpecPair(pair))).toContain('dependency_after_dependent');
  });
});
