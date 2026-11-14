// Folio, in a few sentences, set as big as the page allows, straight after the first screen. Scrolling lights it a
// word at a time (home.jsx); each of the symbols it names is struck out by a pen as it's reached, and what's said
// is in italics, and underlined at the end. Without the motion, all of it is simply there.
//
// Each piece: its words, and what it is: plain, a symbol, or what's said.
import Head from "@/components/Head";

const SAYING = [
  ["Code grew up on symbols:", "plain"], ["{", "symbol"], ["}", "symbol"], [";", "symbol"], ["=>", "symbol"], ["!=", "symbol"], ["&&", "symbol"],
  ["You learn to read them before you learn to program.", "plain"], ["Folio leaves them out.", "plain"], ["You write", "plain"],
  ["the words you'd say,", "said"], ["and it runs.", "plain"],
];
const words = (text) => text.split(" ").flatMap((word, i) => [<span className="lit" key={i}>{word}</span>, " "]);

export default function Statement() {
  return (
    <section className="statement" id="statement" aria-label="Folio, in a few sentences">
      <div className="wrap">
      <Head n={0} name="In a few sentences" />
      <p className="saying">
        <span className="sr-only">{SAYING.map(([text]) => text).join(" ")}</span>
        <span aria-hidden="true">
          {SAYING.map(([text, kind], k) => {
            if (kind === "symbol") {
              return (
                <span key={k}>
                  <span className="lit symbol">{text}<svg viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M3 13 C 30 7, 64 15, 97 6" pathLength="1" /></svg></span>{" "}
                </span>
              );
            }
            if (kind === "said") {
              return (
                <span key={k}>
                  <em className="said-words">{words(text)}<svg viewBox="0 0 300 14" preserveAspectRatio="none"><path d="M3 9 C 40 2, 78 13, 120 7 S 196 2, 236 8 S 280 11, 297 4" pathLength="1" /></svg></em>{" "}
                </span>
              );
            }
            return <span key={k}>{words(text)}</span>;
          })}
        </span>
      </p>
      </div>
    </section>
  );
}
