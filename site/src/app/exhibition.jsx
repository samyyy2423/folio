"use client";
import Drawing from "@/components/Drawing";
import Head from "@/components/Head";
import { BASE, playgroundLink } from "@/lib/site";

// Made with Folio, as an exhibition: a white wall, and on it the site's drawings (scripts/art.mjs), each made by a
// few lines of Folio and drawn again as it's reached, the way the pen drew it, beside the programs that are more
// than drawings (a game, a paint program, two networks). Each is framed and mounted on a colour of its own, and has
// a label as a gallery's do: its name, what it's made of (Folio, and how many lines), and a line about it. Pointing
// at a drawing draws it again; a click opens its program in the playground. They hang on twelve columns, some
// lower than others, and go by at slightly different speeds as the page is scrolled (ScrollSmoother's data-speed).
//
// Each: what it is (a drawing's name, or a program's from the gallery), the column it starts at, how many it
// takes, how far it's dropped (in hundredths of the window's width), what it's mounted on, and its speed.
const HANG = [
  ["rosette", 1, 6, 0, "ink", 1],
  ["vortex", 8, 5, 13, "pop", 0.94],
  ["Snake", 1, 3, 2, "ink", 1.05],
  ["dragon", 5, 5, 7, "paper", 0.97],
  ["sunburst", 10, 3, 0, "ink", 1.06],
  ["hilbert", 2, 5, 3, "lamp", 0.95],
  ["tree", 8, 4, 11, "paper", 1.04],
  ["Neural network", 1, 4, 5, "ink", 1.03],
  ["hexagons", 5, 4, 0, "paper", 0.96],
  ["Paint", 9, 4, 9, "ink", 1.05],
  ["bloom", 2, 4, 2, "stone", 0.97],
  ["Handwriting", 6, 3, 8, "ink", 1.06],
  ["snowflake", 9, 4, 0, "ink", 0.95],
];
const two = (n) => String(n).padStart(2, "0");

export default function Exhibition({ art, gallery, year }) {
  const works = HANG.map(([what, column, span, drop, mount, speed]) => {
    const drawing = art.find((a) => a.name === what);
    const program = gallery.find((g) => g.name === what);
    if (!drawing && !program) return null;
    return drawing
      ? { key: what, title: drawing.title, about: drawing.about, lines: drawing.lines, code: drawing.code, drawing: what, column, span, drop, mount, speed }
      : { key: what, title: program.name, about: program.about, lines: program.code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length, code: program.code, picture: program.picture, column, span, drop, mount, speed };
  }).filter(Boolean);
  return (
    <section className="works" aria-label="Made with Folio">
      <div className="wrap"><Head n={6} name="The exhibition" /></div>
      <div className="works-head wrap" data-reveal-group>
        <div>
          <h2 className="split">Made with Folio</h2>
        </div>
        <p data-reveal>{works.length} works, {year}. Every drawing on this wall was made by a few lines of Folio, and is drawn again in front of you, the way the pen drew it. Point at one to watch it once more; click it, and its program opens in the playground, ready to change.</p>
      </div>
      <ol className="wall wrap">
        {works.map((w, k) => (
          <li key={w.key} className={`piece on-${w.mount}`} style={{ "--column": w.column, "--span": w.span, "--drop": w.drop }} data-speed={w.speed}>
            <a href={playgroundLink(w.code)} data-cursor="Run" data-redraw aria-label={`${w.title}: ${w.about}. Open its program in the playground`}>
              <span className="frame">
                <span className="mount">
                  {w.drawing ? <Drawing name={w.drawing} duration={3.4} /> : <img src={`${BASE}/docs/${w.picture}`} alt="" loading="lazy" draggable={false} />}
                </span>
              </span>
              <span className="plaque">
                <span className="no">{two(k + 1)}</span>
                <b>{w.title}</b>
                <i>Folio, {w.lines} lines</i>
                <span className="about">{w.about}</span>
                <span className="run">Run it ↗</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
