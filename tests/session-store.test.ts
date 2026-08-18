import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStore, SessionCorrupt, SessionNotFound, type SessionStore } from '../server/session-store.ts';
import type { Session } from '../intake/session.ts';

let dir: string;
let store: SessionStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'spec-intake-'));
  store = createStore(dir);
});

function conversation(base: Session): Session {
  return {
    ...base,
    phase: 'panel',
    messages: [
      { role: 'user', content: 'I need a way to see which invoices are overdue.' },
      { role: 'assistant', content: [{ type: 'text', text: 'Overdue by whose clock?' }] },
    ],
    events: [
      {
        kind: 'answer',
        at: '2026-08-18T09:00:00.000Z',
        turn: 1,
        data: { slot: 'overdue_definition', value: 'Past the due date on the invoice', source: 'stated', quote: 'past the due date' },
      },
      {
        kind: 'fork',
        at: '2026-08-18T09:01:00.000Z',
        turn: 2,
        data: {
          question: 'Timezone for the due-date boundary',
          options: ['Customer timezone', 'UTC'],
          decision: 'UTC',
          fallback: 'Recompute per customer if a customer disputes a boundary day',
          decided_by: 'agent',
        },
      },
    ],
    turns: [{ at: '2026-08-18T09:00:00.000Z', phase: 'gathering', requesterChars: 48, agentChars: 22, eventsRecorded: 1 }],
  };
}

describe('session store', () => {
  it('round-trips a conversation byte-for-byte so a resumed session replays identically', async () => {
    const created = await store.create();
    const saved = await store.save(conversation(created));

    const reloaded = await store.load(created.id);

    expect(reloaded).toEqual(saved);
    expect(reloaded.messages).toEqual(saved.messages);
  });

  it('refuses a session that does not parse rather than returning an empty one', async () => {
    const created = await store.create();
    await writeFile(join(dir, `${created.id}.json`), '{ "id": ', 'utf8');

    await expect(store.load(created.id)).rejects.toBeInstanceOf(SessionCorrupt);
  });

  it('refuses a session whose contents no longer match the schema', async () => {
    const created = await store.create();
    await writeFile(join(dir, `${created.id}.json`), JSON.stringify({ ...created, phase: 'nearly_done' }), 'utf8');

    await expect(store.load(created.id)).rejects.toBeInstanceOf(SessionCorrupt);
  });

  it('refuses an id that could escape the session directory', async () => {
    await expect(store.load('../../etc/passwd')).rejects.toBeInstanceOf(SessionNotFound);
  });

  it('reports a missing session as missing', async () => {
    await expect(store.load('QQEfEfd0m3Nq6Yk1zXvA')).rejects.toBeInstanceOf(SessionNotFound);
  });

  it('leaves the previous session readable when a save fails part-way', async () => {
    const created = await store.create();
    const good = await store.save(conversation(created));
    const circular: Record<string, unknown> = { role: 'user' };
    circular['content'] = circular;

    await expect(store.save({ ...good, messages: [circular as never] })).rejects.toBeTruthy();

    expect(await store.load(created.id)).toEqual(good);
  });

  it('leaves no temporary files behind on a successful save', async () => {
    const created = await store.create();
    await store.save(conversation(created));

    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('writes a session a human can read while tuning the elicitation', async () => {
    const created = await store.create();

    const onDisk = await readFile(join(dir, `${created.id}.json`), 'utf8');

    expect(onDisk).toContain('\n  "phase": "gathering"');
  });

  it('gives every session an id long enough not to be guessed', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i += 1) ids.add((await store.create()).id);

    expect(ids.size).toBe(5);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(24);
  });
});
