export interface TranscriptTurn {
  role: 'requester' | 'intake';
  text: string;
}

export interface RevealSection<T> {
  heading: string;
  invitation: string;
  entries: T[];
}

export interface Fork {
  question: string;
  options: string[];
  decision: string;
  fallback: string;
  decided_by: 'requester' | 'agent';
}

export interface SessionView {
  id: string;
  phase: 'gathering' | 'panel' | 'reveal' | 'approved' | 'submitted' | 'frozen';
  transcript: TranscriptTurn[];
  reveal: {
    inferred: RevealSection<{ slot: string; value: string; confirmedWith: string }>;
    defaulted: RevealSection<Fork>;
    assumptions: RevealSection<{ text: string; why_not_verified: string }>;
    declined: RevealSection<{ question: string; why: string }>;
    statedRatio: { stated: number; drafted: number; ratio: number };
  };
  documents: SpecPair | null;
  trace: { statement: string; kind: string; text: string; implemented_by: string[] }[];
  ticketId: string | null;
  freezeReason: string | null;
}

export interface SpecPair {
  human: {
    title: string;
    problem: string;
    outcome: string;
    statements: { id: string; kind: string; text: string; source: string }[];
    happy_path: string[];
    out_of_scope: string[];
    what_would_make_this_fail: string[];
    half_value: string;
    blast_radius_ceiling: string;
  };
  tech: {
    approach: string;
    items: {
      id: string;
      title: string;
      detail: string;
      derived_from: string[];
      depends_on: string[];
      acceptance: { given: string; when: string; then: string; adjudicated_by: string }[];
    }[];
    ticket_order: string[];
  };
}

export interface TurnHandlers {
  onText(delta: string): void;
  onDone(view: SessionView): void;
  onFailed(message: string): void;
}

export async function startSession(): Promise<SessionView> {
  return send('/api/session', 'POST');
}

export async function loadSession(id: string): Promise<SessionView> {
  return send(`/api/session/${id}`, 'GET');
}

export async function approveSession(id: string): Promise<SessionView> {
  return send(`/api/session/${id}/approve`, 'POST');
}

export async function submitSession(id: string, owner: { name: string; email: string }): Promise<SessionView> {
  return send(`/api/session/${id}/submit`, 'POST', { owner });
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message ?? `request failed (${response.status})`);
  return payload;
}

// WHY: the turn is a POST, so EventSource cannot carry it. Read the body as it
// arrives and cut it on the blank line between SSE frames — the deltas have to
// land while the agent is still writing.
export async function sendTurn(id: string, text: string, handlers: TurnHandlers): Promise<void> {
  const response = await fetch(`/api/session/${id}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok || response.body === null) {
    handlers.onFailed(await failureOf(response));
    return;
  }
  await readFrames(response.body, handlers);
}

async function failureOf(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  return payload.message ?? `the turn failed (${response.status})`;
}

async function readFrames(body: ReadableStream<Uint8Array>, handlers: TurnHandlers): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) dispatch(frame, handlers);
  }
}

function dispatch(frame: string, handlers: TurnHandlers): void {
  const event = /^event: (.*)$/m.exec(frame)?.[1];
  const data = /^data: (.*)$/m.exec(frame)?.[1];
  if (event === undefined || data === undefined) return;
  if (event === 'text') handlers.onText((JSON.parse(data) as { delta: string }).delta);
  if (event === 'done') handlers.onDone(JSON.parse(data) as SessionView);
  if (event === 'failed') handlers.onFailed((JSON.parse(data) as { message: string }).message);
}
