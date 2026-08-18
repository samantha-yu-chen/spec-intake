import type { SessionView } from './api.ts';

interface RevealProps {
  view: SessionView;
  busy: boolean;
  onApprove(): void;
}

// WHY: the order on this screen is the gate. What the agent inferred, then the
// forks it decided alone, then its assumptions, then the questions left
// unanswered — and only after all four, the documents. Anything that puts the
// finished documents first is a screen built to be approved rather than read.
export function Reveal({ view, busy, onApprove }: RevealProps) {
  const { inferred, defaulted, assumptions, declined, statedRatio } = view.reveal;
  return (
    <section className="reveal">
      <header>
        <h1>Before you approve</h1>
        <p>
          Everything after this runs with nobody in it. Nothing below can be asked again, so read it as though you were
          the one who has to build from it.
        </p>
        <p className="ratio">
          {statedRatio.stated} answers in your words, {statedRatio.drafted} drafted by me and confirmed by you.
        </p>
      </header>

      <Section heading={inferred.heading} invitation={inferred.invitation} count={inferred.entries.length}>
        {inferred.entries.map((entry) => (
          <article key={entry.slot}>
            <h3>{entry.slot.replace(/_/g, ' ')}</h3>
            <p>{entry.value}</p>
            <p className="quiet">You confirmed this with: “{entry.confirmedWith}”</p>
          </article>
        ))}
      </Section>

      <Section heading={defaulted.heading} invitation={defaulted.invitation} count={defaulted.entries.length}>
        {defaulted.entries.map((fork) => (
          <article key={fork.question}>
            <h3>{fork.question}</h3>
            <p>
              I chose <strong>{fork.decision}</strong> from {fork.options.join(' / ')}.
            </p>
            <p className="quiet">If that turns out wrong: {fork.fallback}</p>
          </article>
        ))}
      </Section>

      <Section heading={assumptions.heading} invitation={assumptions.invitation} count={assumptions.entries.length}>
        {assumptions.entries.map((entry) => (
          <article key={entry.text}>
            <p>{entry.text}</p>
            <p className="quiet">Not verified because: {entry.why_not_verified}</p>
          </article>
        ))}
      </Section>

      <Section heading={declined.heading} invitation={declined.invitation} count={declined.entries.length}>
        {declined.entries.map((entry) => (
          <article key={entry.question}>
            <h3>{entry.question}</h3>
            <p className="quiet">{entry.why}</p>
          </article>
        ))}
      </Section>

      <footer>
        <button type="button" onClick={onApprove} disabled={busy}>
          These are right — approve
        </button>
        <p className="quiet">
          Anything wrong? Say so below instead. Typing reopens the conversation and the documents are rebuilt from
          scratch.
        </p>
      </footer>
    </section>
  );
}

interface SectionProps {
  heading: string;
  invitation: string;
  count: number;
  children: React.ReactNode;
}

function Section({ heading, invitation, count, children }: SectionProps) {
  return (
    <div className="reveal-section">
      <h2>
        {heading} <span className="count">{count}</span>
      </h2>
      <p className="invitation">{invitation}</p>
      {count === 0 ? <p className="quiet">Nothing here.</p> : children}
    </div>
  );
}
