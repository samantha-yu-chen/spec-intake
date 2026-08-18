import { useState } from 'react';
import type { SessionView } from './api.ts';

interface OwnerFormProps {
  busy: boolean;
  onSubmit(owner: { name: string; email: string }): void;
}

// WHY: attribution is taken at the end, not the start. The conversation is
// anonymous while it runs; the finished spec has an author, and the one return
// path needs somewhere to arrive.
export function OwnerForm({ busy, onSubmit }: OwnerFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const ready = name.trim() !== '' && email.includes('@');

  return (
    <section className="owner">
      <h2>Last thing — who is asking?</h2>
      <p>
        This goes on the ticket. If the request cannot be sealed, one email arrives here with a link back to the exact
        conflict. Nothing else comes to you.
      </p>
      <input value={name} placeholder="Your name" onChange={(event) => setName(event.target.value)} />
      <input value={email} placeholder="you@example.com" onChange={(event) => setEmail(event.target.value)} />
      <button type="button" disabled={busy || !ready} onClick={() => onSubmit({ name: name.trim(), email: email.trim() })}>
        Submit — this is one-way
      </button>
    </section>
  );
}

export function Submitted({ view }: { view: SessionView }) {
  const frozen = view.phase === 'frozen';
  return (
    <section className="submitted">
      <h1>{frozen ? 'Frozen before sealing' : 'Submitted'}</h1>
      <p className="ticket-id">{view.ticketId}</p>
      {frozen ? (
        <>
          <p>This ticket stopped at a conflict and is waiting where it stopped:</p>
          <p className="quiet">{view.freezeReason}</p>
          <p>An email is on its way with a link that brings you back to exactly that point. Replying to it changes nothing — the link is the only way back in.</p>
        </>
      ) : (
        <p>
          The specification, the record of how it was built and the conversation itself have gone downstream together.
          Nothing further is needed from you, and nobody will come back with questions.
        </p>
      )}
    </section>
  );
}
