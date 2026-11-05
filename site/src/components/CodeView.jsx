import { tokens } from "@/lib/site";

// Moth, coloured
export function Highlighted({ code }) {
  return tokens(code).map(([kind, text], i) => (kind ? <span key={i} className={kind}>{text}</span> : text));
}

// A window of code: its file's name, the code, and what it says, if it's known
export default function CodeView({ name = "program.moth", code, said, className = "", lang = "moth" }) {
  return (
    <figure className={`codeview ${className}`}>
      <div className="bar"><i /><i /><i /><span>{name}</span></div>
      <pre><code>{lang === "moth" ? <Highlighted code={code} /> : code}</code></pre>
      {said ? <pre className="said"><code>{said}</code></pre> : null}
    </figure>
  );
}
