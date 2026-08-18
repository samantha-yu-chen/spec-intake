import { useEffect, useState } from 'react';
import { approveSession, loadSession, sendTurn, startSession, submitSession, type SessionView } from './api.ts';
import { Chat } from './Chat.tsx';
import { Documents } from './Documents.tsx';
import { Reveal } from './Reveal.tsx';
import { OwnerForm, Submitted } from './Submitted.tsx';

export function App() {
  const [view, setView] = useState<SessionView | null>(null);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    open().then(setView, (cause: Error) => setFailure(cause.message));
  }, []);

  if (failure !== '' && view === null) return <p className="failure">{failure}</p>;
  if (view === null) return <p className="quiet">Opening…</p>;

  async function act(work: Promise<SessionView>): Promise<void> {
    setBusy(true);
    setFailure('');
    try {
      setView(await work);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function say(text: string): Promise<void> {
    setBusy(true);
    setFailure('');
    setStreaming('');
    await sendTurn(view!.id, text, {
      onText: (delta) => setStreaming((sofar) => sofar + delta),
      onDone: (next) => {
        setStreaming('');
        setView(next);
      },
      onFailed: setFailure,
    });
    setBusy(false);
  }

  const closed = view.phase === 'submitted' || view.phase === 'frozen';

  return (
    <main className={`phase-${view.phase}`}>
      {failure !== '' && <p className="failure">{failure}</p>}

      {closed && <Submitted view={view} />}

      {view.phase === 'reveal' && <Reveal view={view} busy={busy} onApprove={() => act(approveSession(view.id))} />}
      {(view.phase === 'reveal' || view.phase === 'approved') && <Documents view={view} />}
      {view.phase === 'approved' && <OwnerForm busy={busy} onSubmit={(owner) => act(submitSession(view.id, owner))} />}

      {!closed && view.phase !== 'approved' && <Chat view={view} streaming={streaming} busy={busy} onSend={say} />}
    </main>
  );
}

// WHY: the resume link is the one return path, so the session id lives in the
// URL from the first turn. A reload, or a link out of an email days later,
// lands on the same conversation.
async function open(): Promise<SessionView> {
  const existing = /^\/s\/([A-Za-z0-9_-]+)$/.exec(window.location.pathname)?.[1];
  if (existing !== undefined) return loadSession(existing);
  const created = await startSession();
  window.history.replaceState(null, '', `/s/${created.id}`);
  return created;
}
