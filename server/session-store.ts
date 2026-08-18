import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { newSession, session, type Session } from '../intake/session.ts';

export class SessionNotFound extends Error {}
export class SessionCorrupt extends Error {}

// WHY: intake is anonymous and the resume link arrives by email, so the id is
// the only thing standing between a stranger and someone else's conversation.
export function newSessionId(): string {
  return randomBytes(18).toString('base64url');
}

export interface SessionStore {
  create(now?: string): Promise<Session>;
  load(id: string): Promise<Session>;
  save(next: Session, now?: string): Promise<Session>;
}

export function createStore(dir: string): SessionStore {
  return {
    create: (now = new Date().toISOString()) => saveTo(dir, newSession(newSessionId(), now), now),
    load: (id) => loadFrom(dir, id),
    save: (next, now = new Date().toISOString()) => saveTo(dir, next, now),
  };
}

async function loadFrom(dir: string, id: string): Promise<Session> {
  const raw = await readFile(pathFor(dir, id), 'utf8').catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === 'ENOENT') throw new SessionNotFound(`no session ${id}`);
    throw cause;
  });
  return parseOrRefuse(id, raw);
}

// WHY: a session that will not parse is not an empty session. Returning a fresh
// one here would silently discard a conversation and re-grill the requester.
function parseOrRefuse(id: string, raw: string): Session {
  const parsed = session.safeParse(tryJson(id, raw));
  if (!parsed.success) throw new SessionCorrupt(`session ${id} does not match the schema: ${parsed.error.message}`);
  return parsed.data;
}

function tryJson(id: string, raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new SessionCorrupt(`session ${id} is not JSON: ${String(cause)}`);
  }
}

async function saveTo(dir: string, next: Session, now: string): Promise<Session> {
  const stamped: Session = { ...next, updatedAt: now };
  await mkdir(dir, { recursive: true });
  await writeAtomic(pathFor(dir, stamped.id), `${JSON.stringify(stamped, null, 2)}\n`);
  return stamped;
}

// WHY: a crash mid-write must leave the previous session readable, not a
// half-file. Write beside it, flush, then rename — rename is atomic on POSIX.
async function writeAtomic(path: string, body: string): Promise<void> {
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temp, 'wx');
  try {
    await handle.writeFile(body, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path).catch(async (cause: unknown) => {
    await unlink(temp).catch(() => undefined);
    throw cause;
  });
}

function pathFor(dir: string, id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new SessionNotFound(`refusing session id ${JSON.stringify(id)}`);
  return join(dir, `${id}.json`);
}
