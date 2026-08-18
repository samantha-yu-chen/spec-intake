import { useEffect, useRef, useState } from 'react';
import type { SessionView } from './api.ts';

interface ChatProps {
  view: SessionView;
  streaming: string;
  busy: boolean;
  onSend(text: string): void;
}

const OPENING = 'Tell me what you need built. Start anywhere — the shape of it, or just what is going wrong today.';

export function Chat({ view, streaming, busy, onSend }: ChatProps) {
  const [text, setText] = useState('');
  const foot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' });
  }, [view.transcript.length, streaming]);

  function submit(): void {
    if (busy || text.trim() === '') return;
    onSend(text.trim());
    setText('');
  }

  return (
    <div className="chat">
      <div className="transcript">
        {view.transcript.length === 0 && <p className="opening">{OPENING}</p>}
        {view.transcript.map((turn, index) => (
          <p key={index} className={`turn ${turn.role}`}>
            {turn.text}
          </p>
        ))}
        {streaming !== '' && <p className="turn intake">{streaming}</p>}
        <div ref={foot} />
      </div>

      <div className="composer">
        <textarea
          value={text}
          rows={3}
          placeholder={busy ? 'Thinking…' : 'Your answer'}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
          }}
        />
        <button type="button" onClick={submit} disabled={busy || text.trim() === ''}>
          {busy ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
