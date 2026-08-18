import { describe, expect, it } from 'vitest';
import { InvalidToolInput, recordFromToolUse, recordTools, UnknownTool } from '../intake/tools.ts';

const at = '2026-08-18T09:00:00.000Z';

const answer = { slot: 'overdue_clock', value: 'UTC midnight', source: 'stated', quote: 'midnight, UTC' };

describe('record tools', () => {
  it('exposes one strict tool per kind of record', () => {
    expect(recordTools.map((tool) => tool.name)).toEqual([
      'record_answer',
      'record_fork',
      'record_assumption',
      'record_declined',
    ]);
    for (const tool of recordTools) expect(tool.strict).toBe(true);
  });

  it('sends a schema the strict path accepts: closed object, everything required, no local-only constraints', () => {
    const schema = recordTools[0]!.input_schema as Record<string, unknown>;

    expect(schema['additionalProperties']).toBe(false);
    expect(schema['required']).toEqual(['slot', 'value', 'source', 'quote']);
    expect(JSON.stringify(schema)).not.toContain('minLength');
    expect(JSON.stringify(schema)).not.toContain('$schema');
  });

  it('keeps the descriptions that tell the model what honest recording means', () => {
    const schema = JSON.stringify(recordTools[0]!.input_schema);

    expect(schema).toContain('drafted_confirmed');
    expect(recordTools[1]!.description).toContain('decided_by');
  });

  it('turns a valid call into a stored event', () => {
    expect(recordFromToolUse('record_answer', answer, at, 3)).toEqual({ kind: 'answer', at, turn: 3, data: answer });
  });

  it('refuses a call with a source it does not recognise', () => {
    expect(() => recordFromToolUse('record_answer', { ...answer, source: 'obvious' }, at, 3)).toThrow(InvalidToolInput);
  });

  it('refuses a call missing the requester\'s own words', () => {
    expect(() => recordFromToolUse('record_answer', { ...answer, quote: '' }, at, 3)).toThrow(InvalidToolInput);
  });

  it('refuses a fork offered with only one option', () => {
    const fork = { question: 'Where it lives', options: ['In the billing app'], decision: 'In the billing app', fallback: 'Split it out', decided_by: 'agent' };

    expect(() => recordFromToolUse('record_fork', fork, at, 4)).toThrow(InvalidToolInput);
  });

  it('refuses a tool it does not know rather than dropping the call', () => {
    expect(() => recordFromToolUse('record_everything', answer, at, 3)).toThrow(UnknownTool);
  });
});
