import { z } from 'zod';

// WHY: the two documents are generated under these schemas rather than checked
// against them afterwards. `derived_from` and `depends_on` exist so the drift
// check and the ticket order are set operations over ids — mechanical, not a
// second model asked whether the first one drifted.

export const humanStatement = z.object({
  id: z.string().regex(/^H\d+$/).describe('H1, H2, … Stable for the life of the spec.'),
  kind: z
    .enum(['requirement', 'constraint', 'context', 'non_goal'])
    .describe('Only "requirement" statements must be implemented by a tech-spec item.'),
  text: z.string().min(1),
  source: z
    .enum(['stated', 'drafted_confirmed'])
    .describe('Where this came from. Must match how it was recorded during the conversation.'),
});

export const humanSpec = z.object({
  title: z.string().min(1),
  problem: z.string().min(1).describe('What is wrong now, and why it is worth doing now.'),
  outcome: z.string().min(1).describe('What is different once this is done, in the requester\'s terms.'),
  statements: z.array(humanStatement).min(1),
  happy_path: z.array(z.string().min(1)).min(1).describe('The end-to-end path, step by step, as the requester would walk it.'),
  out_of_scope: z.array(z.string().min(1)),
  what_would_make_this_fail: z.array(z.string().min(1)).min(1),
  half_value: z
    .string()
    .min(1)
    .describe('If only half of this ships: is half useful, or is half worse than nothing?'),
  blast_radius_ceiling: z
    .string()
    .min(1)
    .describe('The furthest this change is permitted to reach, and what it may never touch.'),
});

export const acceptanceCriterion = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1).describe('The observable result. Adjudicable by a machine — no "works well", no "is fast".'),
  adjudicated_by: z
    .string()
    .min(1)
    .describe('The named check that decides this: a test, a command, a query. Pre-commit the judgement, not the judge.'),
});

export const techSpecItem = z.object({
  id: z.string().regex(/^T\d+$/).describe('T1, T2, … One item is one ticket.'),
  title: z.string().min(1),
  detail: z.string().min(1).describe('Enough that an implementer who was not in the conversation needs to ask nothing.'),
  derived_from: z
    .array(z.string().regex(/^H\d+$/))
    .min(1)
    .describe('Human-spec statement ids this implements. An item deriving from nothing is invented scope.'),
  depends_on: z
    .array(z.string().regex(/^T\d+$/))
    .describe('Items that must be done first. Non-overlapping files do not imply independence.'),
  acceptance: z.array(acceptanceCriterion).min(1),
});

export const techSpec = z.object({
  approach: z.string().min(1).describe('The shape of the build, and why this shape over the alternatives.'),
  items: z.array(techSpecItem).min(1),
  ticket_order: z
    .array(z.string().regex(/^T\d+$/))
    .min(1)
    .describe('Every item id, in an order that satisfies every depends_on.'),
});

export type HumanStatement = z.infer<typeof humanStatement>;
export type HumanSpec = z.infer<typeof humanSpec>;
export type TechSpecItem = z.infer<typeof techSpecItem>;
export type TechSpec = z.infer<typeof techSpec>;

export const specPair = z.object({ human: humanSpec, tech: techSpec });
export type SpecPair = z.infer<typeof specPair>;
