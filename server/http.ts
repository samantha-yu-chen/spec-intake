import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { Engine } from '../intake/engine.ts';
import { PhaseError } from '../intake/phase.ts';
import { SessionCorrupt, SessionNotFound, type SessionStore } from './session-store.ts';
import { handleMessage } from './routes/message.ts';
import { approve, submit, SubmissionRefused } from './routes/submit.ts';
import { viewOf } from './view.ts';

export interface ServerDeps {
  store: SessionStore;
  engine: Engine;
  submissionsDir: string;
  resumeBase: string;
  webRoot: string | null;
}

// WHY: one turn at a time per session. Two concurrent turns would each build on
// the same messages[] and the second save would silently discard the first.
const busy = new Set<string>();

export function createServer(deps: ServerDeps): Server {
  return createNodeServer((req, res) => {
    route(deps, req, res).catch((cause: unknown) => fail(res, cause));
  });
}

async function route(deps: ServerDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://intake');
  if (url.pathname.startsWith('/api/')) return api(deps, req, res, url.pathname);
  return statics(deps, res, url.pathname);
}

async function api(deps: ServerDeps, req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (req.method === 'POST' && path === '/api/session') return json(res, 201, viewOf(await deps.store.create()));

  const [, , , id, action] = path.split('/');
  if (id === undefined || id === '') return json(res, 404, { message: 'no such route' });
  if (req.method === 'GET' && action === undefined) return json(res, 200, viewOf(await deps.store.load(id)));
  if (req.method !== 'POST') return json(res, 405, { message: 'method not allowed' });
  if (action === 'approve') return json(res, 200, await approve(deps.store, id));
  if (action === 'submit') return json(res, 200, await submit(deps, id, (await body(req))['owner']));
  if (action === 'message') return turn(deps, req, res, id);
  return json(res, 404, { message: 'no such route' });
}

async function turn(deps: ServerDeps, req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const text = String((await body(req))['text'] ?? '').trim();
  if (text === '') return json(res, 400, { message: 'an empty turn is not a turn' });
  if (busy.has(id)) return json(res, 409, { message: 'this session is already mid-turn' });
  busy.add(id);
  try {
    await handleMessage(deps, id, text, res);
  } finally {
    busy.delete(id);
  }
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim() === '') return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) throw new SyntaxError('body is not an object');
  return parsed as Record<string, unknown>;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// WHY: in dev the UI is served by Vite and this returns 404 rather than
// pretending to be a web server. A built UI is only served when one exists.
async function statics(deps: ServerDeps, res: ServerResponse, path: string): Promise<void> {
  const root = deps.webRoot;
  if (root === null) return json(res, 404, { message: 'the UI is served by the Vite dev server' });
  const file = await readFile(safeJoin(root, path)).catch(() => readFile(join(root, 'index.html')));
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/html; charset=utf-8' });
  res.end(file);
}

class PathRefused extends Error {}

function safeJoin(root: string, path: string): string {
  const resolved = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!resolved.startsWith(root)) throw new PathRefused('refusing a path outside the web root');
  return resolved;
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

// WHY: an unrecognised failure is a 500 with its message, never a 200 with an
// empty body. A route that cannot tell what went wrong says so.
function fail(res: ServerResponse, cause: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (cause instanceof SessionNotFound) return json(res, 404, { message: cause.message });
  if (cause instanceof SessionCorrupt) return json(res, 500, { message: cause.message });
  if (cause instanceof PhaseError) return json(res, 409, { message: cause.message });
  if (cause instanceof SubmissionRefused) return json(res, 400, { message: cause.message });
  if (cause instanceof PathRefused) return json(res, 403, { message: cause.message });
  if (cause instanceof SyntaxError) return json(res, 400, { message: 'body is not JSON' });
  return json(res, 500, { message: cause instanceof Error ? cause.message : String(cause) });
}
