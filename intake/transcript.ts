import type Anthropic from '@anthropic-ai/sdk';

export interface TranscriptTurn {
  role: 'requester' | 'intake';
  text: string;
}

// WHY: the requester reviews the conversation as well as the spec, and the
// document pass is given the same view. Tool calls are deliberately not here —
// they are the event log, which is shown separately and not as dialogue.
export function transcriptOf(messages: readonly unknown[]): TranscriptTurn[] {
  return messages
    .filter(isDialogue)
    .map((message) => ({
      role: message.role === 'user' ? ('requester' as const) : ('intake' as const),
      text: textOf(message.content),
    }))
    .filter((turn) => turn.text.length > 0);
}

export function renderTranscript(messages: readonly unknown[]): string {
  return transcriptOf(messages)
    .map((turn) => `**${turn.role === 'requester' ? 'Requester' : 'Intake'}:** ${turn.text}`)
    .join('\n\n');
}

function isDialogue(message: unknown): message is Anthropic.MessageParam {
  if (typeof message !== 'object' || message === null) return false;
  const role = (message as { role?: unknown }).role;
  return role === 'user' || role === 'assistant';
}

function textOf(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block): block is Anthropic.TextBlockParam => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
