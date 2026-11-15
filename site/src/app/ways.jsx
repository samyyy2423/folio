"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import Drawing from "@/components/Drawing";
import Head from "@/components/Head";
import { gsap, ScrollTrigger } from "@/lib/motion";
import { BASE, RELEASES } from "@/lib/site";

// Where to go next: rows, each the whole width; the front page's four, or the ones a page names (`to`). Pointed at, a row's name rolls over a letter at a time (it's
// there twice, one under the other), the orange comes up through it, the others stand back, and a drawing of its
// own, framed as the exhibition's are, comes out beside the pointer and is drawn there, following the pointer and
// leaning the way it goes. On a touch screen, a narrow one, or with motion turned down, they're rows of links.
const Name = ({ text }) => (
  <span className="t">
    {[0, 1].map((row) => (
      <span className="t-row" key={row} aria-hidden="true">
        {[...text].map((c, i) => <span className="ch" key={i} style={{ "--i": i }}>{c === " " ? " " : c}</span>)}
      </span>
    ))}
  </span>
);

// Every way on there is: its name, a line about it, where it goes, what the pointer says over it, and its drawing
// and what that's mounted on
const TO = {
  playground: { name: "Write some Folio", note: "The playground runs it in this tab. Nothing to install.", href: `${BASE}/playground`, plain: true, cursor: "Write", drawing: "vortex", mount: "pop" },
  learn: { name: "Learn it tonight", note: "Eleven lessons, each a program to run and change.", href: "/learn", cursor: "Learn", drawing: "hilbert", mount: "paper" },
  why: { name: "Why Folio", note: "Who it's for, what it isn't, and how fast it runs.", href: "/why", cursor: "Read", drawing: "rosette", mount: "ink" },
  get: { name: "Get Folio", note: "For Windows and Linux. One program, nothing beside it.", href: RELEASES, plain: true, cursor: "Get it", drawing: "sunburst", mount: "ink" },
  benchmarks: { name: "The benchmarks", note: "The same programs in C, Rust, JavaScript and Python, timed.", href: "/benchmarks", cursor: "Read", drawing: "hexagons", mount: "paper" },
  writing: { name: "How to write it", note: "Logic in plain words, and programs that stay small.", href: "/writing", cursor: "Read", drawing: "dragon", mount: "paper" },
  docs: { name: "Standard library", note: "Every library and every function, with an example each.", href: "/docs", cursor: "Read", drawing: "bloom", mount: "stone" },
};

// `moves`: it brings itself in as it's reached (the front page does that for its own, with the rest of its motion)
export default function Ways({ lessons, to = ["playground", "learn", "why", "get"], n = 7, name = "Where next", last = 7, moves = false }) {
  const nav = useRef(null);
  const ways = to.map((key) => (key === "learn" && lessons ? { ...TO.learn, note: `${lessons} lessons, each a program to run and change.` } : TO[key]));

  useEffect(() => {
    const root = nav.current;
    if (!matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const peek = root.querySelector(".way-peek");
    const cards = [...peek.children];
    const rows = [...root.querySelectorAll(".way")];
    const toX = gsap.quickTo(peek, "x", { duration: 0.6, ease: "power3" });
    const toY = gsap.quickTo(peek, "y", { duration: 0.6, ease: "power3" });
    const lean = gsap.quickTo(peek, "rotation", { duration: 0.8, ease: "power3" });
    let shown = -1;
    let lastX = null;
    let upright = null;
    // above the pointer and to its right (to its left where there's no room), so the name pointed at stays in view
    const where = (e) => {
      const box = root.getBoundingClientRect();
      const x = e.clientX - box.left;
      const wide = peek.offsetWidth;
      return [x + 30 + wide > box.width ? x - 30 - wide : x + 30, e.clientY - box.top - peek.offsetHeight - 22];
    };
    const move = (e) => {
      const [x, y] = where(e);
      toX(x);
      toY(y);
      if (lastX !== null) lean(gsap.utils.clamp(-10, 10, (e.clientX - lastX) * 0.5));
      lastX = e.clientX;
      clearTimeout(upright);
      upright = setTimeout(() => lean(0), 140);
    };
    const show = (k, e) => {
      if (k === shown) return;
      if (shown < 0 && e) { // it comes out where the pointer is, not from where it was last
        const [x, y] = where(e);
        gsap.set(peek, { x, y, rotation: 0 });
        toX(x);
        toY(y);
        lastX = e.clientX;
      }
      shown = k;
      cards.forEach((card, i) => card.classList.toggle("on", i === k));
      peek.classList.toggle("on", k >= 0);
      if (k >= 0) cards[k].querySelector(".drawing-box")?.dispatchEvent(new Event("redraw"));
    };
    const enters = rows.map((row, k) => (e) => show(k, e));
    const leave = () => show(-1);
    rows.forEach((row, k) => row.addEventListener("pointerenter", enters[k]));
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    return () => {
      clearTimeout(upright);
      rows.forEach((row, k) => row.removeEventListener("pointerenter", enters[k]));
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      gsap.set(peek, { clearProps: "all" });
    };
  }, []);

  useEffect(() => {
    if (!moves || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = nav.current;
    const head = root.querySelector(".head");
    const coming = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 84%" } })
      .fromTo(head, { "--rule": 0 }, { "--rule": 1, duration: 1.4, ease: "expo.inOut" }, 0)
      .fromTo(root.querySelectorAll(".way"), { "--line": 0 }, { "--line": 1, duration: 1.4, ease: "expo.inOut", stagger: 0.1 }, 0.1)
      .from(root.querySelectorAll(".way .t-row:first-child .ch"), { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.012, clearProps: "transform" }, 0.25)
      .from(root.querySelectorAll(".head span, .way .s, .way .arrow, .way > .no"), { autoAlpha: 0, duration: 0.9, stagger: 0.04 }, 0.5);
    return () => { coming.scrollTrigger?.kill(); coming.kill(); ScrollTrigger.refresh(); };
  }, [moves]);

  return (
    <nav className="ways wrap" aria-label="Where to go next" ref={nav}>
      <Head n={n} name={name} last={last} />
      {ways.map((way, k) => {
        const inside = (
          <>
            <span className="no">({String(k + 1).padStart(2, "0")})</span>
            <Name text={way.name} />
            <span className="s">{way.note}</span>
            <span className="arrow" aria-hidden="true">→</span>
          </>
        );
        const about = { className: "way", "data-cursor": way.cursor, "aria-label": `${way.name}. ${way.note}` };
        return way.plain ? <a key={way.name} href={way.href} {...about}>{inside}</a> : <Link key={way.name} href={way.href} {...about}>{inside}</Link>;
      })}
      <div className="way-peek" aria-hidden="true">
        {ways.map((way) => (
          <span className={`peek on-${way.mount}`} key={way.name}><span className="mount"><Drawing name={way.drawing} when="asked" duration={1.5} /></span></span>
        ))}
      </div>
    </nav>
  );
}
