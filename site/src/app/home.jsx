"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FolioMark from "@/components/FolioMark";
import { Highlighted } from "@/components/CodeView";
import Footer from "@/components/Footer";
import { BASE, RELEASES, playgroundLink } from "@/lib/site";
import { gsap, ScrollTrigger, SplitText, motionReady, afterVeil } from "@/lib/motion";
import { ScrollSmoother } from "gsap/ScrollSmoother";

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

export default function Home({ lessons, gallery }) {
  const scope = useRef(null);
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const [curtain, setCurtain] = useState(false);
  const [ready, setReady] = useState(false);
  const preview = useRef(null);
  const [hovered, setHovered] = useState(null);

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

      // the headline: each letter up into place, as the veil between pages lifts if it's there
      const split = SplitText.create(root.querySelectorAll(".hero h1 .line:not(.said)"), { type: "chars", charsClass: "char" });
      const chars = split.chars;
      const said = root.querySelector(".hero h1 .said em");
      const intro = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } })
        .from(chars, { yPercent: 105, duration: 1.3, stagger: 0.025 })
        .from(said, { yPercent: 105, rotate: 4, duration: 1.3 }, "-=1.05")
        .fromTo(root.querySelectorAll(".hero [data-reveal]"), { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.1 }, "-=0.95");
      const stopWaiting = afterVeil(() => intro.play());

      // then heavier near the pointer, smoothly: each letter keeps the width it has a little past its usual weight,
      // so a heavier one never pushes the others along, and where the letters are is worked out once, not as the
      // pointer moves; the pointer is read as it moves, and the letters change once a frame
      const hero = root.querySelector(".hero");
      const headline = root.querySelector(".hero h1");
      let centres = [];
      const measure = () => {
        chars.forEach((char) => { char.style.width = ""; });
        gsap.set(chars, { fontWeight: 800 });
        centres = chars.map((char) => {
          let x = char.offsetLeft + char.offsetWidth / 2;
          let y = char.offsetTop + char.offsetHeight / 2;
          for (let at = char.offsetParent; at && at !== hero; at = at.offsetParent) { x += at.offsetLeft; y += at.offsetTop; }
          return [x, y, char.offsetWidth];
        });
        chars.forEach((char, k) => { char.style.width = `${centres[k][2]}px`; });
        gsap.set(chars, { fontWeight: 700 });
      };
      measure();
      document.fonts?.ready.then(measure);
      let resizing = null;
      const resized = () => { clearTimeout(resizing); resizing = setTimeout(measure, 150); };
      addEventListener("resize", resized);
      const weights = chars.map((char) => gsap.quickTo(char, "fontWeight", { duration: 0.9, ease: "power2.out" }));
      let pointer = null;
      let moved = false;
      const follow = (e) => { pointer = [e.clientX, e.clientY]; moved = true; };
      const lighter = () => { pointer = null; weights.forEach((w) => w(700)); };
      const frame = () => {
        if (!moved || !pointer) return;
        moved = false;
        const box = hero.getBoundingClientRect();
        const x = pointer[0] - box.left;
        const y = pointer[1] - box.top;
        centres.forEach(([cx, cy], k) => {
          const t = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / 600);
          weights[k](560 + 340 * t * t * (3 - 2 * t)); // light far off, heaviest under the pointer, eased between
        });
      };
      gsap.ticker.add(frame);
      headline.addEventListener("pointermove", follow);
      headline.addEventListener("pointerleave", lighter);

      // what comes up as it's reached
      for (const group of root.querySelectorAll("[data-reveal-group]")) {
        gsap.fromTo(group.querySelectorAll("[data-reveal]"), { autoAlpha: 0, yPercent: 30 }, { autoAlpha: 1, yPercent: 0, duration: 1.1, stagger: 0.07, ease: "expo.out", scrollTrigger: { trigger: group, start: "top 80%" } });
      }
      const headings = [...root.querySelectorAll("h2.split")].map((heading) => {
        const lines = SplitText.create(heading, { type: "lines", mask: "lines" });
        gsap.from(lines.lines, { yPercent: 105, duration: 1.2, stagger: 0.08, ease: "expo.out", scrollTrigger: { trigger: heading, start: "top 85%" } });
        return lines;
      });
      // the name, at the very end, letter by letter
      gsap.from(".foot .wordmark span", { yPercent: 100, duration: 1.4, stagger: 0.06, ease: "expo.out", scrollTrigger: { trigger: ".foot", start: "top 70%" } });

      return () => {
        stopWaiting();
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
      // English into Folio: the page stops while each phrase lights the lines it becomes, then what they say
      const translate = ScrollTrigger.create({
        trigger: root.querySelector(".translate"), start: "top top", end: () => `+=${window.innerHeight * 2.4}`, pin: true, scrub: true,
        snap: { snapTo: (v) => Math.min(STEPS - 0.5, Math.floor(v * STEPS) + 0.5) / STEPS, duration: { min: 0.2, max: 0.5 }, ease: "power2.inOut", delay: 0.05 },
        onUpdate: (self) => setStep(Math.min(STEPS - 1, Math.floor(self.progress * STEPS))),
      });

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
      return () => { translate.kill(); reel.kill(); gsap.set([track, ...cards], { clearProps: "all" }); setStep(0); };
    });
    media.add("(max-width: 899px), (prefers-reduced-motion: reduce)", () => {
      setStep(STEPS - 1); // no scrolling through it: all of it lit
      motionReady();
    });
    return () => media.revert();
  }, [ready]);

  // the picture of the program the pointer's over, following it
  useEffect(() => {
    if (!ready || !preview.current) return;
    const x = gsap.quickTo(preview.current, "x", { duration: 0.5, ease: "power3" });
    const y = gsap.quickTo(preview.current, "y", { duration: 0.5, ease: "power3" });
    const list = scope.current.querySelector(".works");
    const move = (e) => { x(e.clientX); y(e.clientY); };
    list.addEventListener("pointermove", move);
    return () => list.removeEventListener("pointermove", move);
  }, [ready]);

  const now = REEL[active];
  return (
    <>
      {curtain && <Curtain onDone={() => { setCurtain(false); setReady(true); }} />}
      <div id="smooth-wrapper">
        <div id="smooth-content">
          <main ref={scope} className="home">
            <section className="hero">
              <div className="wrap">
                <h1 aria-label="Write code the way you'd say it.">
                  <span className="line" aria-hidden="true">Write code</span>
                  <span className="line" aria-hidden="true">the way you&apos;d</span>
                  <span className="line said" aria-hidden="true"><em>say it.</em></span>
                </h1>
                <LiveLine />
                <div className="hero-foot" data-reveal>
                  <p className="intro">Folio is a programming language with no symbols to learn. Run it here in your browser, then build it into a program of its own for Windows or Linux.</p>
                  <div className="cta">
                    <a className="btn primary" href={`${BASE}/playground`} data-cursor="Write"><span>Open the playground</span></a>
                    <Link className="btn ghost" href="/learn" data-cursor="Learn"><span>{lessons} lessons</span></Link>
                  </div>
                </div>
              </div>
            </section>

            <section className="translate" aria-label="English into Folio">
              <div className="translate-stage wrap">
                <div className="say">
                  <h2>You say</h2>
                  <p className="english">
                    <span className="quote">“</span>
                    {ENGLISH.map((phrase, k) => (
                      <span key={k} className={`phrase${k < step ? " was" : ""}${k === step ? " now" : ""}`}>{phrase}{k < ENGLISH.length - 1 ? " " : ""}</span>
                    ))}
                    <span className="quote">”</span>
                  </p>
                </div>
                <div className="write">
                  <h2>You write</h2>
                  <div className="sheet">
                    <div className="sheet-head"><span>scores.folio</span><span>{Math.min(step + 1, STEPS)}/{STEPS}</span></div>
                    <pre>{WRITTEN.map((line, k) => (
                      <span key={k} className={`ln${FROM[k] < step ? " was" : ""}${FROM[k] === step ? " now" : ""}`}><Highlighted code={line} /></span>
                    ))}</pre>
                    <p className={`result${step >= STEPS - 1 ? " on" : ""}`}><span>→ says</span>We won!</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="reel" aria-label="Folio, a thing at a time">
              <div className="reel-stage wrap">
                <div className="reel-list">
                  <p className="label">A thing at a time</p>
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

            <section className="departures wrap" data-reveal-group>
              <div className="departures-head">
                <h2 className="split">One program. Every machine.</h2>
                <p data-reveal>The same <code>hello.folio</code> runs in a browser tab, builds into a program for Windows or Linux, or goes through the debugger a step at a time, backwards too. Every engine says exactly the same things: the tests hold all four to it.</p>
              </div>
              <Board />
            </section>

            <section className="works wrap" onPointerLeave={() => setHovered(null)}>
              <div className="works-head">
                <h2 className="split">Made with Folio</h2>
                <p>Games, drawings, a neural network that learns. Each opens in the playground, ready to run and change.</p>
              </div>
              <ol data-reveal-group>
                {gallery.map((g, k) => (
                  <li key={g.name} data-reveal onPointerEnter={() => setHovered(k)}>
                    <a href={playgroundLink(g.code)} data-cursor="Open">
                      <span className="n">{pad(k + 1)}</span>
                      <span className="name">{g.name}</span>
                      <span className="about">{g.about}</span>
                      <span className="go">Open ↗</span>
                    </a>
                  </li>
                ))}
              </ol>
              <div className={`preview${hovered !== null ? " on" : ""}`} ref={preview} aria-hidden="true">
                {gallery.map((g, k) => <img key={g.name} src={`${BASE}/docs/${g.picture}`} alt="" className={k === hovered ? "on" : ""} />)}
              </div>
            </section>

            <nav className="ways wrap" aria-label="Where to go next" data-reveal-group>
              <a className="way" href={`${BASE}/playground`} data-reveal data-cursor="Write"><span className="t">Write some Folio</span><span className="s">The playground runs it in this tab. Nothing to install.</span><span className="arrow">→</span></a>
              <Link className="way" href="/learn" data-reveal data-cursor="Learn"><span className="t">Learn it tonight</span><span className="s">{lessons} lessons, each a program to run and change.</span><span className="arrow">→</span></Link>
              <a className="way" href={RELEASES} data-reveal data-cursor="Get it"><span className="t">Get Folio</span><span className="s">For Windows and Linux. One program, nothing beside it.</span><span className="arrow">→</span></a>
            </nav>
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
}
