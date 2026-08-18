import { mkdtemp } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Engine } from '../intake/engine.ts';
import type { Session } from '../intake/session.ts';
import { createServer } from '../server/http.ts';
import { createStore } from '../server/session-store.ts';
import type { SessionView } from '../server/view.ts';

let base: string;
let close: () => Promise<void>;
let held: (() => void) | null = null;

// WHY: the engine is the one part that talks to the model. Standing in for it
// here keeps these tests about the routing, the lock and the refusals — the
// parts that must hold whether or not a model answers.
function stubEngine(): Engine {
  return {
    async turn(session: Session, requesterText: string, listener): Promise<Session> {
      listener.text('So who is chasing these invoices today?');
      if (held !== null) await new Promise<void>((resolve) => (held = resolve));
      return {
        ...session,
        messages: [
          ...session.messages,
          { role: 'user', content: requesterText },
          { role: 'assistant', content: 'So who is chasing these invoices today?' },
        ],
        turns: [...session.turns, { at: '2026-08-18T09:00:00.000Z', phase: session.phase, requesterChars: requesterText.length, agentChars: 40, eventsRecorded: 0 }],
      };
    },
  };
}

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spec-intake-'));
  const server = createServer({
    store: createStore(join(dir, 'sessions')),
    engine: stubEngine(),
    submissionsDir: join(dir, 'submitted'),
    resumeBase: 'http://localhost:4317',
    webRoot: null,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  held = null;
  await close();
});

async function newSession(): Promise<SessionView> {
  const response = await fetch(`${base}/api/session`, { method: 'POST' });
  return (await response.json()) as SessionView;
}

async function say(id: string, text: string): Promise<string> {
  const response = await fetch(`${base}/api/session/${id}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return response.text();
}

describe('the api', () => {
  it('opens a session in gathering with an empty reveal', async () => {
    const view = await newSession();

    expect(view.phase).toBe('gathering');
    expect(view.reveal.inferred.entries).toEqual([]);
    expect(view.documents).toBeNull();
  });

  it('streams a turn and ends with the saved session', async () => {
    const view = await newSession();

    const body = await say(view.id, 'I need to see which invoices are overdue.');

    expect(body).toContain('event: text');
    expect(body).toContain('event: done');
    const done = JSON.parse(/event: done\ndata: (.*)/.exec(body)![1]!) as SessionView;
    expect(done.transcript.map((turn) => turn.role)).toEqual(['requester', 'intake']);
  });

  it('resumes a session from its id, transcript intact', async () => {
    const view = await newSession();
    await say(view.id, 'I need to see which invoices are overdue.');

    const resumed = (await (await fetch(`${base}/api/session/${view.id}`)).json()) as SessionView;

    expect(resumed.transcript[0]?.text).toBe('I need to see which invoices are overdue.');
  });

  it('refuses an empty turn', async () => {
    const view = await newSession();

    const response = await fetch(`${base}/api/session/${view.id}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    });

    expect(response.status).toBe(400);
  });

  it('refuses a second turn while one is still running, rather than losing it', async () => {
    const view = await newSession();
    held = () => undefined;
    const first = say(view.id, 'I need to see which invoices are overdue.');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = await fetch(`${base}/api/session/${view.id}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'and by customer' }),
    });

    expect(second.status).toBe(409);
    held?.();
    await first;
  });

  it('reports an unknown session as missing', async () => {
    expect((await fetch(`${base}/api/session/QQEfEfd0m3Nq6Yk1zXvAAAAA`)).status).toBe(404);
  });

  it('refuses approve outside the reveal, over the wire', async () => {
    const view = await newSession();

    const response = await fetch(`${base}/api/session/${view.id}/approve`, { method: 'POST' });

    expect(response.status).toBe(409);
  });
});
