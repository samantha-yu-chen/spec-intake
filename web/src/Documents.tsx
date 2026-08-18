import type { SessionView } from './api.ts';

// WHY: the human-spec is open and the tech-spec is folded. The requester
// authorises the first and may choose never to read the second — the trace map
// is what makes that choice safe, so it sits between them.
export function Documents({ view }: { view: SessionView }) {
  if (view.documents === null) return null;
  const { human, tech } = view.documents;

  return (
    <section className="documents">
      <h2>Your specification</h2>
      <h3>{human.title}</h3>
      <Field label="The problem" value={human.problem} />
      <Field label="What done looks like" value={human.outcome} />
      <List label="The happy path" items={human.happy_path} ordered />
      <List label="Requirements" items={human.statements.map((s) => `${s.id}. ${s.text} (${s.source.replace('_', ' ')})`)} />
      <List label="Out of scope" items={human.out_of_scope} />
      <List label="What would make this fail" items={human.what_would_make_this_fail} />
      <Field label="If only half of it ships" value={human.half_value} />
      <Field label="How far this may reach" value={human.blast_radius_ceiling} />

      <h3>What implements what</h3>
      <table>
        <tbody>
          {view.trace.map((row) => (
            <tr key={row.statement}>
              <td>{row.statement}</td>
              <td>{row.text}</td>
              <td>{row.implemented_by.length === 0 ? `— (${row.kind})` : row.implemented_by.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details>
        <summary>The technical specification — {tech.items.length} tickets, in order</summary>
        <Field label="Approach" value={tech.approach} />
        <p className="quiet">Build order: {tech.ticket_order.join(' → ')}</p>
        {tech.items.map((item) => (
          <article key={item.id} className="ticket">
            <h4>
              {item.id}. {item.title}
            </h4>
            <p>{item.detail}</p>
            <p className="quiet">
              From {item.derived_from.join(', ')}
              {item.depends_on.length > 0 && ` · after ${item.depends_on.join(', ')}`}
            </p>
            <ul>
              {item.acceptance.map((criterion, index) => (
                <li key={index}>
                  Given {criterion.given}, when {criterion.when}, then {criterion.then}.
                  <span className="quiet"> Decided by {criterion.adjudicated_by}.</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </details>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="label">{label}</span>
      {value}
    </p>
  );
}

function List({ label, items, ordered = false }: { label: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const entries = items.map((item, index) => <li key={index}>{item}</li>);
  return (
    <div>
      <span className="label">{label}</span>
      {ordered ? <ol>{entries}</ol> : <ul>{entries}</ul>}
    </div>
  );
}
