import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MODEL = 'claude-opus-5';
export const MAX_TOKENS = 64000;

// WHY: this is the one place the request shape is cast. The installed SDK types
// (0.72.x) predate adaptive thinking, response effort and mid-conversation
// system messages, all three of which this layer wants: grilling is the whole
// job, so effort is high and thinking is on, and an operator nudge has to reach
// the model without disturbing the cached prefix. Casting here rather than at
// each call site keeps the drift in one readable place.
export function conversationRequest(
  system: Anthropic.TextBlockParam[],
  messages: readonly unknown[],
  tools: Anthropic.Tool[],
): BetaMessageStreamParams {
  const request = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'high' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages,
    tools,
  };
  return request as unknown as BetaMessageStreamParams;
}

// WHY: instructions.md and panel.md are the largest, most stable thing in every
// request, and nothing volatile — no session id, no timestamp — goes near them.
// That keeps the cache prefix byte-identical across a long grilling.
export function systemBlocks(): Anthropic.TextBlockParam[] {
  return [
    { type: 'text', text: read('instructions.md') },
    { type: 'text', text: read('panel.md'), cache_control: { type: 'ephemeral' } },
  ];
}

// WHY: an operator instruction carries more weight than a user turn and must
// not be mistaken for the requester speaking. Opus 5 takes a system message
// mid-conversation; it has to follow a user turn and come last.
export function operatorMessage(text: string): unknown {
  return { role: 'system', content: text };
}

export function isTransient(error: unknown): boolean {
  return error instanceof Anthropic.RateLimitError || error instanceof Anthropic.APIConnectionError;
}

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}
