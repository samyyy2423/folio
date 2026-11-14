"use client";
import { useEffect, useRef } from "react";
import Drawing from "./Drawing";

// The drawing each page opens with (scripts/art.mjs), in ink, behind its words; a page with none named here gets
// one by its name
const OPENS_WITH = { learn: "hilbert", docs: "hexagons", why: "rosette", writing: "dragon", benchmarks: "vortex", cookbook: "bloom", examples: "sunburst" };
const OTHERS = ["snowflake", "rosette", "vortex", "hexagons", "bloom", "tree", "sunburst", "hilbert", "dragon"];
const drawingFor = (word) => OPENS_WITH[word] ?? OTHERS[[...word].reduce((n, c) => n + c.charCodeAt(0), 0) % OTHERS.length];

// A page's name, huge behind its opening: all of it, as wide as the page allows (never so tall that the opening cuts
// it off), its last letter yellow and the rest orange (openings.css). How wide the word is, in ems, is measured
// once the type has loaded, so the size is worked out by the browser and follows the window. The letters come up
// one at a time with the page's first words (motion.js's entrance).
export default function Letters({ word }) {
  const box = useRef(null);
  const text = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  useEffect(() => {
    const el = box.current;
    const fit = () => {
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size) el.style.setProperty("--em", (el.offsetWidth / size).toFixed(3));
    };
    fit();
    document.fonts?.ready.then(fit);
  }, [text]);
  return (
    <>
      <div className="letters" ref={box} aria-hidden="true" style={{ "--em": (text.length * 0.54).toFixed(2) }}>
        {[...text].map((c, i) => <span key={i}>{c}</span>)}
      </div>
      <Drawing name={drawingFor(text)} className="opening-art mono" when="enter" duration={3.2} delay={0.45} spin={50} />
    </>
  );
}
