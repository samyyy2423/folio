// A section's header on the front page, the same for every one: its number, its name, a rule that draws itself
// across as the section is reached (home.jsx), and which of the eight it is (or, with no `last`, only the first three).
const two = (n) => String(n).padStart(2, "0");

export default function Head({ n, name, last = 7 }) {
  return (
    <p className="head">
      <span className="no">({n})</span>
      <span className="name">{name}</span>
      <i className="rule" aria-hidden="true" />
      {last === null ? null : <span className="of" aria-hidden="true">{two(n)} / {two(last)}</span>}
    </p>
  );
}
