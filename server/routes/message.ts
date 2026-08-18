import type { ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import type { Engine } from '../../intake/engine.ts';
import { PhaseError } from '../../intake/phase.ts';
import type { SessionStore } from '../session-store.ts';
import { viewOf } from '../view.ts';

export interface MessageDeps {
  store: SessionStore;
  engine: Engine;
}

// WHY: the deltas have to reach the browser unbuffered. A grilling that arrives
// in one lump at the end reads as a form being processed, not a conversation.
export async function handleMessage(deps: MessageDeps, id: string, text: string, res: ServerResponse): Promise<void> {
  const send = openStream(res);
  try {
    const session = await deps.store.load(id);
    const next = await deps.engine.turn(session, text, {
      text: (delta) => send('text', { delta }),
      recorded: (event) => send('record', event),
      moved: (phase) => send('phase', { phase }),
    });
    send('done', viewOf(await deps.store.save(next)));
  } catch (cause) {
    send('failed', { message: explain(cause) });
  } finally {
    res.end();
  }
}

function openStream(res: ServerResponse): (event: string, data: unknown) => void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  return (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

// WHY: typed errors only. What the requester is told differs by whether the
// work is lost — a rate limit means say it again, a refused phase means the
// conversation has already closed and saying it again will not help.
function explain(cause: unknown): string {
  if (cause instanceof PhaseError) return cause.message;
  if (cause instanceof Anthropic.RateLimitError) return 'The model is rate limited. Nothing was lost — send that again in a moment.';
  if (cause instanceof Anthropic.APIConnectionError) return 'Lost the connection to the model. Nothing was lost — send that again.';
  if (cause instanceof Anthropic.APIError) return `The model refused this turn (${cause.status ?? 'no status'}). Your session is saved.`;
  return cause instanceof Error ? cause.message : String(cause);
}
