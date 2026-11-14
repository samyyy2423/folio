"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import FolioMark from "@/components/FolioMark";
import { Highlighted } from "@/components/CodeView";
import Footer from "@/components/Footer";
import { BASE, RELEASES, playgroundLink, tokens } from "@/lib/site";
import { gsap, ScrollTrigger, SplitText, motionReady, afterVeil } from "@/lib/motion";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import Exhibition from "./exhibition";
import Statement from "./statement";
import Ways from "./ways";
import Drawing from "@/components/Drawing";
import Head from "@/components/Head";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollSmoother);

const pad = (n) => String(n).padStart(2, "0");

// The line the first screen types, and what each says (each run on Folio's JIT to check)
const LIVE = [
  ['say "Hello, world"', "Hello, world"],
  ['say "a week has " 7 * 24 " hours"', "a week has 168 hours"],
  ["say 0.1 + 0.2", "0.3"],
  ["say 5 km + 300 m", "5.3 km"],
  ['say uppercase of "folio"', "FOLIO"],
  ["say 2 to the power of 10", "1024"],
];

// English, and the Folio it becomes: each line of the program comes from a phrase (it says "We won!")
const ENGLISH = ["Take the scores 70, 90 and 55.", "Add them all up,", "and if the total is at least 200,", "say we won."];
const WRITTEN = ["set scores to list of 70, 90, 55", "set total to 0", "for each score in scores", "    add score to total", "end", "if total is at least 200", '    say "We won!"', "end"];
const FROM = [0, 1, 1, 1, 1, 2, 3, 2];
const STEPS = ENGLISH.length + 1; // each phrase, then what it says

// The reel: Folio, a thing at a time, and what each program says
const REEL = [
  { name: "Say", code: 'say "Hello, world!"\nsay "2 + 3 is " 2 + 3', said: ["Hello, world!", "2 + 3 is 5"], about: "Words in quotes, sums without. Pieces side by side are joined as written." },
  { name: "Remember", code: 'set name to "Ada"\nset age to 36\nadd 1 to age\nsay "{name} is now {age}"', said: ["Ada is now 37"], about: "set gives a value a name. Braces put it in text." },
  { name: "Decide", code: 'set age to 17\nif age is at least 18\n    say "Come in"\nelse\n    say "Not yet"\nend', said: ["Not yet"], about: "is at least, not >=. Every comparison is words." },
  { name: "Repeat", code: 'repeat 3 times\n    say "Hip, hip"\nend\nsay "Hooray!"', said: ["Hip, hip", "Hip, hip", "Hip, hip", "Hooray!"], about: "Blocks end with end. Indents are for people." },
  { name: "Lists", code: 'set fruits to list of "kiwi", "apple", "fig"\nadd "pear" to fruits\nsay fruits in order\nsay length of fruits', said: ['["apple", "fig", "kiwi", "pear"]', "4"], about: "A list of things, written the way you'd say it." },
  { name: "Loops", code: "set total to 0\nfor each n from 1 to 100\n    add n to total\nend\nsay total", said: ["5050"], about: "for each, over a range or a list." },
  { name: "Functions", code: "to area with width, height\n    return width * height\nend\nsay area(3, 4)", said: ["12"], about: "to name with inputs: a function, in a sentence." },
  { name: "Records", code: 'set cat to record with name "Tom", age 3\nsay name of cat " is " age of cat', said: ["Tom is 3"], about: "Named fields, read with of." },
  { name: "Dictionaries", code: 'set ages to dictionary where "Ada" is 36, "Alan" is 41\nsay item "Alan" of ages', said: ["41"], about: "Keys and values, in the order they were set." },
  { name: "Units", code: "say 5 km + 300 m", said: ["5.3 km"], about: "Amounts carry their units, and convert." },
  { name: "Mistakes", code: "set total to 10\nsay totl", said: ["line 2: 'totl' has no value yet. Did you mean 'total'?"], bad: true, about: "Mistakes in a sentence, at the spot, with a guess." },
];

// Where one program goes, and how: the departures board
const BOARD = [
  ["THE PLAYGROUND", "YOUR BROWSER", "WEBASSEMBLY"],
  ["FOLIO BUILD", "WINDOWS", "MACHINE CODE"],
  ["FOLIO BUILD", "LINUX", "MACHINE CODE"],
  ["FOLIO BUILD --TARGET WASM", "A .WASM FILE", "WEBASSEMBLY"],
  ["FOLIO DEBUG", "THE DEBUGGER", "STEP BY STEP"],
];
const WIDTHS = [25, 12, 12];
const FLAPS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-";

// The parts of the front page, for the rail at its side: what each is called, and where it starts
const RAIL = [
  ["Folio", ".hero"], ["In a few sentences", ".statement"], ["English into Folio", ".translate"], ["Count the symbols", ".symbols"],
  ["A thing at a time", ".reel"], ["In numbers", ".numbers"], ["Where it runs", ".departures"], ["Made with Folio", ".works"], ["Where next", ".ways"],
];

// The first visit's curtain: a count to 100 while the page fetches Folio's compiler for the playground (so it's
// ready there), then up it goes. Not again in the same tab, and not when motion is turned down.
function Curtain({ onDone }) {
  const [count, setCount] = useState(0);
  const curtain = useRef(null);
  useEffect(() => {
    let shown = 0;
    let target = 0;
    let finished = false;
    const started = performance.now();
    const tick = () => {
      if (finished) return;
      target = Math.max(target, Math.min(100, ((performance.now() - started) / 1600) * 100)); // never slower than this
      shown = Math.min(target, 100, shown + (target - shown) * 0.12 + 0.2);
      setCount(Math.floor(shown));
      if (shown >= 100) {
        finished = true;
        gsap.timeline({ onComplete: onDone })
          .to(curtain.current.querySelectorAll(".count, .what"), { yPercent: -110, duration: 0.6, ease: "power3.in" })
          .to(curtain.current, { yPercent: -100, duration: 0.9, ease: "expo.inOut" }, "-=0.15");
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    fetch(`${BASE}/folio.wasm`).then(async (response) => {
      const total = Number(response.headers.get("content-length")) || 1_700_000;
      const reader = response.body?.getReader();
      if (!reader) return void (target = 100);
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        target = Math.max(target, Math.min(100, (100 * got) / total));
      }
      target = 100;
    }).catch(() => { target = 100; });
    return () => { finished = true; };
  }, [onDone]);
  return (
    <div className="curtain" ref={curtain} aria-hidden="true">
      <Drawing name="rosette" when="enter" duration={1.7} className="curtain-art" />
      <p className="what"><FolioMark />Loading Folio&apos;s compiler, written in Folio</p>
      <p className="count">{String(count).padStart(3, "0")}</p>
    </div>
  );
}

// A line of Folio to type in, run as it's typed (on Folio's JIT, in a worker), with what it says beside it. Until
// it's clicked it types examples of its own, with what they say.
function LiveLine() {
  const [code, setCode] = useState(LIVE[0][0]);
  const [said, setSaid] = useState({ lines: [LIVE[0][1]], bad: false, note: "" });
  const [mine, setMine] = useState(false);
  const box = useRef(null);
  const field = useRef(null);
  const open = useRef(null);
  const worker = useRef(null);

  useEffect(() => {
    if (mine || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    let timer = null;
    let visible = true;
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    seen.observe(box.current);
    const wait = (ms) => new Promise((done) => { timer = setTimeout(done, ms); });
    (async () => {
      let k = 0;
      await wait(3200);
      while (alive) {
        while (alive && !visible) await wait(400);
        let text = LIVE[k][0];
        while (alive && text.length) { text = text.slice(0, -1); setCode(text); await wait(16); }
        if (!alive) break;
        setSaid({ lines: [], bad: false, note: "" });
        k = (k + 1) % LIVE.length;
        const [next, out] = LIVE[k];
        for (let i = 1; alive && i <= next.length; i++) { setCode(next.slice(0, i)); await wait(34 + Math.random() * 46); }
        await wait(240);
        if (!alive) break;
        setSaid({ lines: [out], bad: false, note: "" });
        await wait(2600);
      }
    })();
    return () => { alive = false; clearTimeout(timer); seen.disconnect(); };
  }, [mine]);

  useEffect(() => {
    if (!mine) return;
    const later = setTimeout(() => run(code), 260);
    return () => clearTimeout(later);
  }, [code, mine]);
  useEffect(() => () => worker.current?.terminate(), []);

  function run(source) {
    worker.current?.terminate();
    worker.current = null;
    if (!source.trim()) return setSaid({ lines: [], bad: false, note: "" });
    const w = (worker.current = new Worker(`${BASE}/worker.js`, { type: "module" }));
    const lines = [];
    const finish = (result) => {
      clearTimeout(limit);
      w.terminate();
      if (worker.current !== w) return;
      worker.current = null;
      setSaid(result);
    };
    const limit = setTimeout(() => finish({ lines: ["stopped after 2 seconds: does it loop for ever?"], bad: true, note: "" }), 2000);
    w.onmessage = ({ data }) => {
      for (const line of data.lines ?? []) lines.push(typeof line === "string" ? [line, false] : [line.error, true]);
      if (data.question !== undefined) return finish({ lines: ["it asks a question: press Enter to answer it in the playground"], bad: false, note: "" });
      if (data.error) return finish({ lines: [data.error.replace(/^Error: /, "").split("\n")[0]], bad: true, note: "Folio found a mistake" });
      if (data.done) {
        const ms = data.ms < 10 ? data.ms.toFixed(1) : Math.round(data.ms);
        finish({ lines: lines.length ? lines.map(([text]) => text) : ["(it says nothing)"], bad: lines.some(([, bad]) => bad), note: `ran in ${ms} ms, in this tab` });
      }
    };
    w.postMessage({ source, engine: "jit", answers: [], files: {}, seed: Math.floor(Math.random() * 2 ** 32), disk: {} });
  }

  return (
    <div className="live" ref={box} data-reveal>
      <div className="live-row">
        <label className="prompt" htmlFor="live-code"><span>Try it</span>›</label>
        <div className={`live-field${mine ? " mine" : ""}`}>
          <pre aria-hidden="true"><Highlighted code={code} /><i className="caret" /></pre>
          <input id="live-code" ref={field} value={code} maxLength={90} spellCheck={false} autoComplete="off" autoCapitalize="off"
            aria-describedby="live-said" data-cursor="Type"
            onFocus={() => { if (!mine) { setMine(true); requestAnimationFrame(() => field.current?.select()); } }}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open.current?.click(); } if (e.key === "Escape") field.current?.blur(); }} />
        </div>
        <div className={`live-said${said.bad ? " bad" : ""}`} id="live-said" aria-live="polite">
          {said.lines.slice(0, 3).map((line, k) => <p key={`${line}-${k}`}>{line}</p>)}
        </div>
      </div>
      <div className="live-foot">
        <span>{said.note || (mine ? "" : "An example. Click the line to write your own.")}</span>
        <a ref={open} href={playgroundLink(code)}>Enter opens it in the playground ↗</a>
      </div>
    </div>
  );
}

// The departures board: each cell a row of flaps, which turn over when the board comes into view, and a row at a
// time now and then after that
function Board() {
  const board = useRef(null);
  const [time, setTime] = useState("");
  useEffect(() => {
    const clock = () => setTime(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    clock();
    const every = setInterval(clock, 20000);
    const root = board.current;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => clearInterval(every);
    const turning = new Map();
    let frame = 0;
    let last = 0;
    let visible = false;
    const tick = (now) => {
      if (now - last > 55 && turning.size) {
        last = now;
        for (const [tile, left] of turning) {
          if (left <= 0) {
            tile.textContent = tile.dataset.c;
            tile.classList.remove("turning");
            turning.delete(tile);
          } else {
            tile.textContent = FLAPS[Math.floor(Math.random() * FLAPS.length)];
            turning.set(tile, left - 1);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const rows = [...root.querySelectorAll(".board-row")];
    const turn = (row) => row.querySelectorAll(".tile").forEach((tile, i) => {
      if (tile.dataset.c === " ") return;
      turning.set(tile, 3 + Math.floor(i * 0.3) + Math.floor(Math.random() * 4));
      tile.classList.add("turning");
    });
    const watch = ScrollTrigger.create({
      trigger: root, start: "top 80%", end: "bottom top",
      onToggle: (self) => { visible = self.isActive; },
      onEnter: () => rows.forEach((row, k) => setTimeout(() => turn(row), k * 200)),
    });
    const now_and_then = setInterval(() => { if (visible && !document.hidden) turn(rows[Math.floor(Math.random() * rows.length)]); }, 4200);
    return () => { cancelAnimationFrame(frame); clearInterval(every); clearInterval(now_and_then); watch.kill(); };
  }, []);
  const tiles = (text, width) => text.padEnd(width).split("").map((c, i) => {
    const shown = c === " " ? " " : c;
    return <span className="tile" data-c={shown} key={i}>{shown}</span>;
  });
  return (
    <div className="board" ref={board}>
      <div className="board-top"><span><FolioMark />hello.folio · departures</span><span suppressHydrationWarning>{time}</span></div>
      <div className="board-scroll">
        <div className="board-grid" role="table" aria-label="Where hello.folio runs, and how">
          <div className="board-head" role="row"><span role="columnheader">Via</span><span role="columnheader">To</span><span role="columnheader">As</span></div>
          {BOARD.map((row, k) => (
            <div className="board-row" role="row" key={k} aria-label={row.join(", ").toLowerCase()}>
              {row.map((cell, c) => <span className="cell" role="cell" key={c} aria-hidden="true">{tiles(cell, WIDTHS[c])}</span>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A word as the page matches it with another: lower case, letters and digits only ("We" and `"We` are one word)
const norm = (word) => word.toLowerCase().replace(/[^a-z0-9]/g, "");

// A line of Folio, coloured, each word in a span of its own that says which word it is, for a word of English
// to fly into
function CodeWords({ code }) {
  return tokens(code).flatMap(([kind, text], i) => text.split(/(\s+)/).map((part, j) => {
    if (!part) return null;
    if (/^\s+$/.test(part)) return part;
    return <span key={`${i}-${j}`} className={kind || undefined} data-w={norm(part)}>{part}</span>;
  }));
}

// English into Folio, as it happens: the words a phrase of English shares with the lines of Folio it becomes
// leave the phrase, one after another, and fly to their places in those lines, which they come to be
function flyWords(section, k) {
  const phrase = section.querySelectorAll(".phrase")[k];
  if (!phrase) return;
  const sources = [...phrase.querySelectorAll("[data-w]")];
  const used = new Set();
  const at = section.getBoundingClientRect(); // the ghosts go in the section, and move with it as the page does
  let n = 0;
  [...section.querySelectorAll(".ln")].forEach((line, i) => {
    if (FROM[i] !== k) return;
    for (const target of line.querySelectorAll("[data-w]")) {
      const source = sources.find((s) => !used.has(s) && s.dataset.w && s.dataset.w === target.dataset.w);
      if (!source) continue;
      used.add(source);
      const a = source.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const from = getComputedStyle(source);
      const to = getComputedStyle(target);
      const ghost = document.createElement("span");
      ghost.className = "ghost-word";
      ghost.textContent = source.textContent;
      Object.assign(ghost.style, { left: `${a.left - at.left}px`, top: `${a.top - at.top}px`, font: from.font, letterSpacing: from.letterSpacing, color: from.color });
      section.append(ghost);
      gsap.set(target, { opacity: 0 });
      gsap.timeline({ delay: n++ * 0.08, onComplete: () => ghost.remove() })
        .to(ghost, { x: b.left - a.left, y: b.top - a.top, scale: parseFloat(to.fontSize) / parseFloat(from.fontSize), color: to.color, duration: 1, ease: "expo.inOut" })
        .to(target, { opacity: 1, duration: 0.2, ease: "none" }, 0.85)
        .to(ghost, { autoAlpha: 0, duration: 0.2, ease: "none" }, 0.85);
    }
  });
}

// Count the symbols: the symbols fall out of the code, one after another, into a heap at the foot of the card,
// bigger, turned every which way, and each is counted as it lands (added to the card's timeline, after they light)
function heap(card, syms, tl, count) {
  if (!syms.length) return;
  const box = card.getBoundingClientRect();
  const size = parseFloat(getComputedStyle(syms[0]).fontSize);
  const grow = 2.3;
  const w = size * 0.6 * grow; // a symbol's room in the heap
  const h = size * grow;
  const bottomRow = Math.max(3, Math.min(7, Math.floor((box.width * 0.34) / w)));
  const centre = box.right - 30 - (bottomRow * w) / 2;
  const floor = box.bottom - 18;
  const TURNS = [-38, 24, -12, 41, -27, 9, 33, -45, 17, -6, 28, -19, 44, -33, 12, -24, 36, -9, 21];
  const start = syms.length * 0.07 + 0.4;
  let landed = 0;
  let row = 0;
  let col = 0;
  syms.forEach((sym, k) => {
    const room = Math.max(1, bottomRow - row);
    const r = sym.getBoundingClientRect();
    const x = centre + (col - (room - 1) / 2) * w + ((k * 7) % 5 - 2) * 2;
    const y = floor - h / 2 - row * h * 0.68;
    const at = start + k * 0.085;
    tl.to(sym, { x: x - (r.left + r.width / 2), duration: 0.85, ease: "power1.out" }, at);
    tl.to(sym, { y: y - (r.top + r.height / 2), duration: 0.85, ease: "bounce.out" }, at);
    tl.to(sym, { rotation: TURNS[k % TURNS.length], scale: grow, duration: 0.85, ease: "power2.out" }, at);
    tl.call(() => count(++landed), null, at + 0.42);
    if (++col >= room) { col = 0; row++; }
  });
}

// A number as an odometer's wheels: each digit a strip of 0 to 9, three times over, turned to its place, which home's
// effect rolls up from 0 (the last digit twice round, the one before once); what isn't a digit, as it is
const CELLS = [..."012345678901234567890123456789"];
function Odometer({ n }) {
  const text = n.toLocaleString("en");
  const digits = [...text].filter((c) => /\d/.test(c)).length;
  let seen = 0;
  return (
    <span className="odo" aria-label={text}>
      {[...text].map((c, i) => {
        if (!/\d/.test(c)) return <span key={i} className="odo-sep" aria-hidden="true">{c}</span>;
        const turns = Math.max(0, 2 - (digits - 1 - seen));
        seen++;
        const to = turns * 10 + Number(c);
        return (
          <span key={i} className="odo-wheel" aria-hidden="true">
            <span className="odo-strip" data-to={to} data-turns={turns} data-k={seen} style={{ "--roll": to }}>
              {CELLS.map((d, j) => <span key={j}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

// The same program twice, to count the symbols in: every character that isn't a letter, a digit or a space
const SAME_FOLIO = "set scores to list of 70, 90, 55\nset total to 0\nfor each score in scores\n    add score to total\nend\nsay total";
const SAME_JS = "const scores = [70, 90, 55];\nlet total = 0;\nfor (const s of scores) {\n  total += s;\n}\nconsole.log(total);";
const isSymbol = (c) => /[^A-Za-z0-9\s]/.test(c);
const symbolsIn = (code) => [...code].filter(isSymbol).length;
const Marked = ({ code }) => [...code].map((c, i) => (isSymbol(c) ? <i key={i} className="sym">{c}</i> : c));

export default function Home({ lessons, gallery, art, version, year, index }) {
  const scope = useRef(null);
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const [curtain, setCurtain] = useState(false);
  const [ready, setReady] = useState(false);
  const [part, setPart] = useState(0);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let first = false;
    try { first = !sessionStorage.getItem("folio-curtain"); sessionStorage.setItem("folio-curtain", "1"); } catch {}
    if (first && !reduced) setCurtain(true);
    else setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = scope.current;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const smoother = ScrollSmoother.create({ wrapper: "#smooth-wrapper", content: "#smooth-content", smooth: 1.1, effects: true });
      motionReady();

      // The first screen is drawn. A pen goes round the letters of Folio's name, huge behind everything; the
      // headline's lines come up out of their own; the name fills with colour from the foot up; a pen underlines
      // what's said; and the notes and the rest arrive. As the veil between pages lifts, if it's there.
      const hero = root.querySelector(".hero");
      const giant = root.querySelector(".giant");
      const outline = giant.querySelector(".giant-line");
      const outlines = [...outline.querySelectorAll("tspan")];
      const flood = giant.querySelector("#giant-flood rect");
      const split = SplitText.create(root.querySelectorAll(".hero h1 .line:not(.said)"), { type: "words,chars", wordsClass: "word", charsClass: "char" });
      const chars = split.chars;
      const said = root.querySelector(".hero h1 .said em");
      const underline = root.querySelector(".hero h1 .pen path");
      const reveals = root.querySelectorAll(".hero [data-reveal]");
      const size = parseFloat(getComputedStyle(giant).fontSize);
      const round = size * 3.6; // longer than the way round any of the letters
      const [foot, head] = [size * 0.31, size * -0.5]; // just below the name's foot, and above its head
      gsap.set(outlines, { strokeDasharray: round, strokeDashoffset: round });
      gsap.set(flood, { attr: { y: foot, height: 0 } });
      gsap.set(chars, { yPercent: 108 });
      gsap.set(said, { yPercent: 108 });
      gsap.set(reveals, { autoAlpha: 0, y: 20 });
      const intro = gsap.timeline({
        paused: true,
        // drawn and filled: the outline and the flood have done their work, and would be wrong at another size
        onComplete: () => { gsap.set(outline, { autoAlpha: 0 }); gsap.set(flood, { attr: { y: -10000, height: 20000 } }); },
      })
        .to(outlines, { strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut", stagger: 0.07 }, 0)
        .to(chars, { yPercent: 0, duration: 1.05, ease: "expo.out", stagger: 0.014 }, 0.2)
        .to(said, { yPercent: 0, duration: 1.05, ease: "expo.out" }, 0.5)
        .to(flood, { attr: { y: head, height: foot - head }, duration: 1.05, ease: "expo.inOut" }, 0.85)
        .to(reveals, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.06, ease: "expo.out" }, 1.05)
        .to(underline, { strokeDashoffset: 0, duration: 0.75, ease: "power2.inOut" }, 1.35)
        .fromTo(hero.querySelector(".badge"), { scale: 0, rotation: -120, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 1.1, ease: "back.out(1.5)" }, 1.25);
      const stopWaiting = afterVeil(() => intro.play());
      // the name drifts: up a little slower than the page, and a little away from the pointer
      const drift = gsap.to(giant, { yPercent: 14, ease: "none", scrollTrigger: { trigger: root.querySelector(".hero"), start: "top top", end: "bottom top", scrub: true } });
      const awayX = gsap.quickTo(giant, "x", { duration: 1.2, ease: "power3" });
      const away = (e) => awayX((0.5 - e.clientX / innerWidth) * 46);
      addEventListener("pointermove", away, { passive: true });

      // then heavier near the pointer, smoothly: each letter keeps the width it has at its heaviest, so a heavier
      // one never pushes the others along, and where the letters are is worked out once, not as the pointer moves.
      // Each letter's weight eases toward where the pointer wants it, in steps of 10, and a letter is only drawn
      // again when its step changes: a frame redraws the few letters that moved, not all of them.
      const headline = root.querySelector(".hero h1");
      const REST = 500;
      const STEP = 10;
      let centres = [];
      const goal = chars.map(() => REST);
      const weight = chars.map(() => REST);
      const drawn = chars.map(() => REST);
      const measure = () => {
        chars.forEach((char) => { char.style.width = ""; char.style.fontWeight = "740"; });
        centres = chars.map((char) => {
          let x = char.offsetLeft + char.offsetWidth / 2;
          let y = char.offsetTop + char.offsetHeight / 2;
          for (let at = char.offsetParent; at && at !== hero; at = at.offsetParent) { x += at.offsetLeft; y += at.offsetTop; }
          return [x, y, char.offsetWidth];
        });
        chars.forEach((char, k) => { char.style.width = `${centres[k][2]}px`; char.style.fontWeight = String(drawn[k]); });
      };
      measure();
      document.fonts?.ready.then(measure);
      let resizing = null;
      const resized = () => { clearTimeout(resizing); resizing = setTimeout(measure, 150); };
      addEventListener("resize", resized);
      let pointer = null;
      let moved = false;
      let settling = false;
      const follow = (e) => { pointer = [e.clientX, e.clientY]; moved = true; };
      const lighter = () => { pointer = null; goal.fill(REST); settling = true; };
      const frame = (time, deltaTime) => {
        if (moved && pointer) {
          moved = false;
          settling = true;
          const box = hero.getBoundingClientRect(); // first thing in the frame, before anything's written
          const x = pointer[0] - box.left;
          const y = pointer[1] - box.top;
          centres.forEach(([cx, cy], k) => {
            const t = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / 520);
            goal[k] = 420 + 320 * t * t * (3 - 2 * t); // light far off, heaviest under the pointer, eased between
          });
        }
        if (!settling) return;
        const ease = 1 - Math.exp(-Math.min(deltaTime, 50) / 260); // the same pace at any frame rate
        let still = true;
        chars.forEach((char, k) => {
          weight[k] += (goal[k] - weight[k]) * ease;
          if (Math.abs(goal[k] - weight[k]) < STEP / 4) weight[k] = goal[k];
          else still = false;
          const step = Math.round(weight[k] / STEP) * STEP;
          if (step !== drawn[k]) { drawn[k] = step; char.style.fontWeight = String(step); }
        });
        if (still) settling = false;
      };
      gsap.ticker.add(frame, false, true);
      headline.addEventListener("pointermove", follow);
      headline.addEventListener("pointerleave", lighter);

      // Count the symbols: each lights as it's reached, and is counted. On a wide screen they then fall out of the
      // code, one after another, into a heap at the foot of the card: JavaScript's 19, and Folio's two commas.
      const wide = matchMedia("(min-width: 900px)").matches;
      const tallies = [...root.querySelectorAll(".count-card")].map((card) => {
        const syms = [...card.querySelectorAll(".sym")];
        const number = card.querySelector(".tally b");
        number.textContent = "0";
        const count = (n) => { number.textContent = String(n); };
        const tl = gsap.timeline({ paused: true });
        tl.from(syms, { opacity: 0.18, duration: 0.2, stagger: 0.07, ease: "none" });
        if (!wide) {
          const n = { v: 0 };
          tl.to(n, { v: syms.length, duration: syms.length * 0.07, ease: "none", onUpdate: () => count(Math.round(n.v)) }, 0);
        }
        const trigger = ScrollTrigger.create({
          trigger: card, start: "top 70%", once: true,
          onEnter: () => {
            if (wide) heap(card, syms, tl, count);
            tl.play();
          },
        });
        return { tl, trigger };
      });
      // and the numbers roll up, as an odometer's do: the last digit round twice, the one before it once
      const counted = [...root.querySelectorAll(".numbers .odo-strip")].map((strip) => gsap.fromTo(strip, { "--roll": 0 }, {
        "--roll": Number(strip.dataset.to), duration: 2.2 + Number(strip.dataset.turns) * 0.35, ease: "expo.inOut", delay: Number(strip.dataset.k) * 0.06,
        scrollTrigger: { trigger: strip.closest("dd"), start: "top 90%" },
      }));

      // what comes up as it's reached
      for (const group of root.querySelectorAll("[data-reveal-group]")) {
        gsap.fromTo(group.querySelectorAll("[data-reveal]"), { autoAlpha: 0, yPercent: 30 }, { autoAlpha: 1, yPercent: 0, duration: 1.1, stagger: 0.07, ease: "expo.out", scrollTrigger: { trigger: group, start: "top 80%" } });
      }
      const headings = [...root.querySelectorAll("h2.split")].map((heading) => {
        const lines = SplitText.create(heading, { type: "lines", mask: "lines", linesClass: "h-line" });
        gsap.from(lines.lines, { yPercent: 105, duration: 1.2, stagger: 0.08, ease: "expo.out", scrollTrigger: { trigger: heading, start: "top 85%" } });
        return lines;
      });
      // the exhibition's works come up as they're reached (the link inside, so its speed stays the frame's own)
      const hung = [...root.querySelectorAll(".piece")].map((piece) => gsap.timeline({ scrollTrigger: { trigger: piece, start: "top 90%" } })
        .fromTo(piece.querySelector(".frame"), { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: "expo.inOut" }, 0)
        .from(piece.querySelector(".mount > *"), { scale: 1.3, duration: 1.6, ease: "expo.out" }, 0.1)
        .from(piece.querySelectorAll(".plaque > *"), { autoAlpha: 0, y: 14, duration: 0.8, stagger: 0.06, ease: "power3.out" }, 0.55));
      // The sentences after the first screen are lit a word at a time as they're scrolled through: each symbol is
      // struck out by a pen as it's reached, and goes grey; what's said is underlined at the end
      const saying = root.querySelector(".saying");
      const lit = [...saying.querySelectorAll(".lit")];
      gsap.set(lit, { opacity: 0.14 });
      const told = gsap.timeline({ scrollTrigger: { trigger: saying, start: "top 76%", end: "bottom 48%", scrub: 0.6 } });
      lit.forEach((piece, k) => {
        told.to(piece, { opacity: 1, duration: 1, ease: "none" }, k);
        const strike = piece.querySelector("path");
        if (strike) told.to(strike, { strokeDashoffset: 0, duration: 1.4, ease: "none" }, k + 0.5).to(piece, { color: "#8d8a80", duration: 1, ease: "none" }, k + 1.2);
      });
      told.to(saying.querySelector(".said-words path"), { strokeDashoffset: 0, duration: 4, ease: "none" }, lit.length - 3.5);

      // the fields of colour open out to the page's width as they come up: the numbers' orange, the exhibition's white
      const opened = [...root.querySelectorAll(".numbers, .works")].map((field) => gsap.fromTo(field, { clipPath: "inset(0% 7% 0% 7%)" }, {
        clipPath: "inset(0% 0% 0% 0%)", ease: "none", scrollTrigger: { trigger: field, start: "top 96%", end: "top 30%", scrub: true },
      }));

      // which part of the page it's in, for the rail at its side
      const parts = RAIL.map(([, part], k) => ScrollTrigger.create({
        trigger: root.querySelector(part), start: "top 55%", end: "bottom 55%", onToggle: (self) => { if (self.isActive) setPart(k); },
      }));

      // the rules between the ways on draw themselves, left to right, as they're reached; and the ways come up
      const ways = root.querySelectorAll(".way");
      const ruled = gsap.timeline({ scrollTrigger: { trigger: root.querySelector(".ways"), start: "top 82%" } })
        .fromTo(ways, { "--line": 0 }, { "--line": 1, duration: 1.4, ease: "expo.inOut", stagger: 0.1 }, 0)
        .from(root.querySelectorAll(".way .t-row:first-child .ch"), { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.012, clearProps: "transform" }, 0.15)
        .from(root.querySelectorAll(".way .s, .way .arrow, .way > .no"), { autoAlpha: 0, duration: 0.9, stagger: 0.04 }, 0.5);

      // the first screen's buttons lean toward the pointer, and spring back
      const magnets = [...root.querySelectorAll(".hero .cta .btn")].map((button) => {
        const x = gsap.quickTo(button, "x", { duration: 0.5, ease: "power3" });
        const y = gsap.quickTo(button, "y", { duration: 0.5, ease: "power3" });
        const pull = (e) => {
          const box = button.getBoundingClientRect();
          x((e.clientX - (box.left + box.width / 2)) * 0.3);
          y((e.clientY - (box.top + box.height / 2)) * 0.45);
        };
        const free = () => gsap.to(button, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.4)", overwrite: true });
        button.addEventListener("pointermove", pull);
        button.addEventListener("pointerleave", free);
        return () => { button.removeEventListener("pointermove", pull); button.removeEventListener("pointerleave", free); gsap.set(button, { clearProps: "transform" }); };
      });

      // The first screen stays where it is while the page comes up over it, and stands back as it does: a little
      // smaller, and darker. Its badge turns, and faster while the page is scrolled.
      const turning = gsap.to(hero.querySelector(".badge svg"), { rotation: 360, duration: 22, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
      const leaving = gsap.timeline({
        scrollTrigger: {
          trigger: hero, start: "top top", end: "bottom top", pin: true, pinSpacing: false, scrub: true,
          onUpdate: (self) => {
            turning.timeScale(1 + Math.min(12, Math.abs(self.getVelocity()) / 160));
            gsap.to(turning, { timeScale: 1, duration: 1.2, ease: "power2.out", overwrite: true });
          },
        },
      })
        .to(hero.querySelector(".wrap"), { scale: 0.93, ease: "none", transformOrigin: "50% 62%" }, 0)
        .to(hero, { "--shade": 0.62, ease: "none" }, 0);

      // every section's header: its rule draws itself across, and its words come up
      const heads = [...root.querySelectorAll(".head")].map((head) => gsap.timeline({ scrollTrigger: { trigger: head, start: "top 92%" } })
        .fromTo(head, { "--rule": 0 }, { "--rule": 1, duration: 1.4, ease: "expo.inOut" }, 0)
        .from(head.querySelectorAll("span"), { autoAlpha: 0, y: 10, duration: 0.8, stagger: 0.07, ease: "power3.out" }, 0.1));

      // cards lean to the pointer, as if picked up: the sheet of Folio, the two programs, the board, the framed works
      const tilts = [...root.querySelectorAll(".write .sheet, .count-card, .board, .piece .frame")].map((card) => {
        const most = card.matches(".board") ? 1.8 : card.matches(".frame") ? 7 : 3.5;
        gsap.set(card, { transformPerspective: 900 });
        const overX = gsap.quickTo(card, "rotationX", { duration: 0.6, ease: "power3" });
        const overY = gsap.quickTo(card, "rotationY", { duration: 0.6, ease: "power3" });
        const lean = (e) => {
          const box = card.getBoundingClientRect();
          overY(((e.clientX - box.left) / box.width - 0.5) * 2 * most);
          overX((0.5 - (e.clientY - box.top) / box.height) * 2 * most);
        };
        const rest = () => { overX(0); overY(0); };
        card.addEventListener("pointermove", lean);
        card.addEventListener("pointerleave", rest);
        return () => { card.removeEventListener("pointermove", lean); card.removeEventListener("pointerleave", rest); gsap.set(card, { clearProps: "transform" }); };
      });

      // the name, at the very end, letter by letter
      gsap.from(".foot .wordmark span", { yPercent: 100, duration: 1.4, stagger: 0.06, ease: "expo.out", scrollTrigger: { trigger: ".foot", start: "top 70%" } });

      return () => {
        stopWaiting();
        intro.kill();
        gsap.set([...chars, said, ...reveals, ...outlines, outline], { clearProps: "all" });
        gsap.set(flood, { attr: { y: -10000, height: 20000 } });
        hung.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
        [leaving, ...heads].forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
        turning.kill();
        tilts.forEach((undo) => undo());
        gsap.set([hero, hero.querySelector(".wrap"), hero.querySelector(".badge"), hero.querySelector(".badge svg"), ...root.querySelectorAll(".head, .head span, .piece .frame, .piece .mount > *, .piece .plaque > *")], { clearProps: "all" });
        [told, ruled, ...opened].forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
        parts.forEach((t) => t.kill());
        magnets.forEach((undo) => undo());
        gsap.set([...lit, ...root.querySelectorAll(".numbers, .works, .way, .way .ch, .way .s, .way .arrow, .way > .no")], { clearProps: "all" });
        tallies.forEach(({ tl, trigger }) => { trigger.kill(); tl.kill(); });
        root.querySelectorAll(".count-card .sym").forEach((sym) => gsap.set(sym, { clearProps: "all" }));
        counted.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
        drift.scrollTrigger?.kill();
        drift.kill();
        removeEventListener("pointermove", away);
        gsap.set(giant, { clearProps: "transform" });
        gsap.ticker.remove(frame);
        removeEventListener("resize", resized);
        headline.removeEventListener("pointermove", follow);
        headline.removeEventListener("pointerleave", lighter);
        headings.forEach((lines) => lines.revert());
        split.revert();
        smoother.kill();
      };
    });

    media.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      // English into Folio: the page stops while each phrase lights the lines it becomes, its words flying into
      // them as it does (going forward), then what they say
      const english = root.querySelector(".translate");
      let shown = -1;
      const reach = (s) => {
        if (s > shown) for (let k = shown + 1; k <= s; k++) flyWords(english, k);
        shown = s;
        setStep(s);
      };
      const translate = ScrollTrigger.create({
        trigger: english, start: "top top", end: () => `+=${window.innerHeight * 2.4}`, pin: true, scrub: true,
        snap: { snapTo: (v) => Math.min(STEPS - 0.5, Math.floor(v * STEPS) + 0.5) / STEPS, duration: { min: 0.2, max: 0.5 }, ease: "power2.inOut", delay: 0.05 },
        onUpdate: (self) => reach(Math.min(STEPS - 1, Math.floor(self.progress * STEPS))),
      });
      const toward = ScrollTrigger.create({ trigger: english, start: "top 45%", onEnter: () => { if (shown < 0) reach(0); } });

      // the reel: the programs go up through the lens, one at a time
      const section = root.querySelector(".reel");
      const track = section.querySelector(".track");
      const cards = [...track.children];
      const gap = () => cards[1].offsetTop - cards[0].offsetTop;
      const place = (p) => {
        gsap.set(track, { y: -p * gap() });
        cards.forEach((card, k) => {
          const d = Math.min(1, Math.abs(k - p));
          gsap.set(card, { opacity: 1 - 0.72 * d, scale: 1 - 0.1 * d, filter: `grayscale(${d})` });
        });
      };
      place(0);
      const reel = ScrollTrigger.create({
        trigger: section, start: "top top", end: () => `+=${(REEL.length - 1) * window.innerHeight * 0.5}`, pin: true, scrub: true,
        snap: { snapTo: 1 / (REEL.length - 1), duration: { min: 0.2, max: 0.6 }, ease: "power2.inOut", delay: 0.05 },
        onUpdate: (self) => {
          const p = self.progress * (REEL.length - 1);
          place(p);
          setActive(Math.round(p));
        },
      });
      return () => {
        translate.kill();
        toward.kill();
        reel.kill();
        document.querySelectorAll(".ghost-word").forEach((ghost) => ghost.remove());
        gsap.set([track, ...cards, ...english.querySelectorAll(".ln [data-w]")], { clearProps: "all" });
        setStep(0);
      };
    });
    media.add("(max-width: 899px), (prefers-reduced-motion: reduce)", () => {
      setStep(STEPS - 1); // no scrolling through it: all of it lit
      motionReady();
    });
    return () => media.revert();
  }, [ready]);

  const now = REEL[active];
  return (
    <>
      {curtain && <Curtain onDone={() => { setCurtain(false); setReady(true); }} />}
      <nav className="rail" aria-label="The parts of this page">
        {RAIL.map(([name, to], k) => (
          <button key={to} type="button" className={k === part ? "on" : ""} aria-current={k === part ? "true" : undefined}
            onClick={() => (ScrollSmoother.get() ? ScrollSmoother.get().scrollTo(to, true, "top top") : document.querySelector(to)?.scrollIntoView())}>
            <span>{name}</span><i />
          </button>
        ))}
      </nav>
      <div id="smooth-wrapper">
        <div id="smooth-content">
          <main ref={scope} className="home">
            <section className="hero">
              <svg className="giant" aria-hidden="true">
                <defs><clipPath id="giant-flood"><rect x="-400" y="-10000" width="20000" height="20000" /></clipPath></defs>
                <text className="giant-fill" y="0.294em" clipPath="url(#giant-flood)">{"folio".split("").map((c, i) => <tspan key={i}>{c}</tspan>)}</text>
                <text className="giant-line" y="0.294em">{"folio".split("").map((c, i) => <tspan key={i}>{c}</tspan>)}</text>
              </svg>
              <div className="wrap">
                <div className="notes">
                  <p className="note" data-reveal><span className="no">(1)</span>Folio® is a programming language with no symbols to learn. You write what you mean in plain English words, and it runs.</p>
                  <p className="note" data-reveal><span className="no">(2)</span>It runs here, in your browser, and builds into a program of its own for Windows or Linux: one file, with nothing to install.</p>
                  <p className="meta" data-reveal><span>/v{version}</span><span>({year})</span></p>
                </div>
                <h1 aria-label="Write code the way you'd say it.">
                  <span className="line" aria-hidden="true">Write code the way</span>
                  <span className="row" aria-hidden="true"><span className="line">you&apos;d</span><span className="line said"><em>say it.</em><svg className="pen" viewBox="0 0 200 14" preserveAspectRatio="none"><path d="M3 9 C 24 2, 44 13, 70 7 S 118 2, 144 8 S 182 11, 197 4" pathLength="1" /></svg></span>
                    <a className="badge" href="#statement" tabIndex={-1} data-cursor="Scroll"
                      onClick={(e) => { if (ScrollSmoother.get()) { e.preventDefault(); ScrollSmoother.get().scrollTo("#statement", true, "top top"); } }}>
                      <svg viewBox="0 0 200 200">
                        <defs><path id="badge-ring" d="M100 100 m-80 0 a80 80 0 1 1 160 0 a80 80 0 1 1 -160 0" /></defs>
                        <text><textPath href="#badge-ring" textLength="497" lengthAdjust="spacing">No symbols to learn · Runs in your browser · </textPath></text>
                      </svg>
                      <i>↓</i>
                    </a>
                  </span>
                </h1>
                <LiveLine />
                <div className="hero-foot" data-reveal>
                  <ol className="contents" aria-label="What's here">
                    {index.map(([n, name, href]) => (
                      <li key={name}><Link href={href}><span className="no">({n.toLocaleString("en")})</span>{name}</Link></li>
                    ))}
                    <li><Link href="/why"><span className="no">(?)</span>Why Folio</Link></li>
                    <li><Link href="/writing"><span className="no">(→)</span>Writing Folio</Link></li>
                  </ol>
                  <div className="cta">
                    <a className="btn primary" href={`${BASE}/playground`} data-cursor="Write"><span>Open the playground</span></a>
                    <Link className="btn" href="/learn" data-cursor="Learn"><span>{lessons} lessons</span></Link>
                  </div>
                </div>
              </div>
            </section>

            <Statement />

            <section className="translate" aria-label="English into Folio">
              <div className="translate-stage wrap">
                <Head n={1} name="English into Folio" />
                <div className="say">
                  <h2>You say</h2>
                  <p className="english">
                    <span className="quote">“</span>
                    {ENGLISH.map((phrase, k) => (
                      <span key={k} className={`phrase${k < step ? " was" : ""}${k === step ? " now" : ""}`}>
                        {phrase.split(" ").map((word, i) => <Fragment key={i}>{i ? " " : ""}<span data-w={norm(word)}>{word}</span></Fragment>)}
                        {k < ENGLISH.length - 1 ? " " : ""}
                      </span>
                    ))}
                    <span className="quote">”</span>
                  </p>
                </div>
                <div className="write">
                  <h2>You write</h2>
                  <div className="sheet">
                    <div className="sheet-head"><span>scores.folio</span><span>{Math.min(step + 1, STEPS)}/{STEPS}</span></div>
                    <pre>{WRITTEN.map((line, k) => (
                      <span key={k} className={`ln${FROM[k] < step ? " was" : ""}${FROM[k] === step ? " now" : ""}`}><CodeWords code={line} /></span>
                    ))}</pre>
                    <p className={`result${step >= STEPS - 1 ? " on" : ""}`}><span>→ says</span>We won!</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="symbols wrap" aria-label="The same program, in JavaScript and in Folio">
              <Head n={2} name="The same program, twice" />
              <div className="symbols-head" data-reveal-group>
                <div><h2 className="split">Count the symbols.</h2></div>
                <p data-reveal>Both add up three scores and say the total. Every character that isn&apos;t a letter, a number or a space is lit, and counted.</p>
              </div>
              <div className="symbols-pair">
                <figure className="count-card js">
                  <figcaption><span>total.js</span><span>JavaScript</span></figcaption>
                  <pre><Marked code={SAME_JS} /></pre>
                  <p className="tally"><b>{symbolsIn(SAME_JS)}</b><span>symbols</span></p>
                </figure>
                <figure className="count-card fo">
                  <figcaption><span>total.folio</span><span>Folio</span></figcaption>
                  <pre><Marked code={SAME_FOLIO} /></pre>
                  <p className="tally"><b>{symbolsIn(SAME_FOLIO)}</b><span>symbols: two commas</span></p>
                </figure>
              </div>
            </section>

            <section className="reel" aria-label="Folio, a thing at a time">
              <div className="reel-stage wrap">
                <Head n={3} name="A thing at a time" />
                <div className="reel-list">
                  <ol>{REEL.map((r, k) => <li key={r.name} className={k === active ? "on" : ""}><span>{pad(k + 1)}</span>{r.name}</li>)}</ol>
                </div>
                <div className="reel-lens">
                  <div className="brackets" aria-hidden="true"><i /><i /></div>
                  <ol className="track">
                    {REEL.map((r) => (
                      <li key={r.name} className="reel-card">
                        <div className="card-head"><span>{r.name.toLowerCase()}.folio</span><span>run ↗</span></div>
                        <pre><code><Highlighted code={r.code} /></code></pre>
                        <a className="cover" href={playgroundLink(r.code)} data-cursor="Run" aria-label={`Run the ${r.name} program in the playground`} />
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="reel-said" aria-live="polite">
                  <p className="index"><b>{pad(active + 1)}</b>/{pad(REEL.length)}</p>
                  <p className="about">{now.about}</p>
                  <div className={`said-box${now.bad ? " bad" : ""}`} key={active}>
                    <p className="label">{now.bad ? "Folio says, and stops" : "→ says"}</p>
                    {now.said.map((line, k) => <p key={k} className="said-line" style={{ animationDelay: `${0.08 * k}s` }}>{line}</p>)}
                  </div>
                </div>
              </div>
            </section>

            <section className="numbers" aria-label="Folio in numbers">
              <div className="wrap">
                <Head n={4} name="Folio, in numbers" />
                <dl>
                  {[
                    [(index.find(([, name]) => name === "Libraries") ?? [0])[0], "libraries", "Built into folio: JSON, web servers, databases, charts, encryption."],
                    [(index.find(([, name]) => name === "Functions") ?? [0])[0], "functions", "Each with what it takes, what it gives, and an example."],
                    [4, "engines", "Every one says exactly the same things: the tests hold all four to it."],
                    [lessons, "lessons", "Each a short program to run, change and break. One evening."],
                  ].map(([n, name, note]) => (
                    <div key={name}><dd><Odometer n={n} /></dd><dt>{name}</dt><p>{note}</p></div>
                  ))}
                </dl>
              </div>
            </section>

            <section className="departures wrap" data-reveal-group>
              <Head n={5} name="Where it runs" />
              <div className="departures-head">
                <div><h2 className="split">One program. Every machine.</h2></div>
                <p data-reveal>The same <code>hello.folio</code> runs in a browser tab, builds into a program for Windows or Linux, or goes through the debugger a step at a time, backwards too. Every engine says exactly the same things: the tests hold all four to it.</p>
              </div>
              <Board />
            </section>

            <Exhibition art={art} gallery={gallery} year={year} />

            <Ways lessons={lessons} />
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
}
