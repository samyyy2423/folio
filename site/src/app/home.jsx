"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MothMark from "@/components/MothMark";
import { Highlighted } from "@/components/CodeView";
import Footer from "@/components/Footer";
import { BASE, RELEASES, playgroundLink } from "@/lib/site";
import { gsap, ScrollTrigger, SplitText, motionReady } from "@/lib/motion";
import { ScrollSmoother } from "gsap/ScrollSmoother";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollSmoother);

// The reel: Moth, a thing at a time, and what each program says (each run on Moth's JIT to check)
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

const ENGINES = [
  ["JIT", "JavaScript, in your browser", "The playground's default: Moth compiled to JavaScript, which the browser compiles to machine code."],
  ["VM", "Bytecode you can step backwards", "Every step recorded: the debugger goes forward and back through a run."],
  ["WebAssembly", "Compiled by Moth itself", "moth.wasm is Moth's compiler, written in Moth, made by itself, running in the page."],
  ["Machine code", "moth build, for Windows and Linux", "A program of its own: no runtime beside it, and an installer if you want one."],
];

const SAME = {
  moth: 'set scores to list of 42, 77, 91\nfor each s in scores\n    if s is greater than 50\n        say s " passed"\n    end\nend',
  python: 'scores = [42, 77, 91]\nfor s in scores:\n    if s > 50:\n        print(f"{s} passed")',
  js: "const scores = [42, 77, 91];\nfor (const s of scores) {\n  if (s > 50) {\n    console.log(`${s} passed`);\n  }\n}",
};

const pad = (n) => String(n).padStart(2, "0");

// The first visit's curtain: a count to 100 while the page fetches Moth's compiler for the playground (so it's
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
      const elapsed = performance.now() - started;
      target = Math.max(target, Math.min(100, (elapsed / 1600) * 100)); // never slower than this
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
    // what's fetched, as far as it's got
    fetch(`${BASE}/moth.wasm`).then(async (response) => {
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
      <p className="what"><MothMark />Loading Moth&apos;s compiler, written in Moth</p>
      <p className="count">{String(count).padStart(3, "0")}</p>
    </div>
  );
}

export default function Home({ libraries, functions, lessons, gallery }) {
  const scope = useRef(null);
  const [active, setActive] = useState(0);
  const [curtain, setCurtain] = useState(false);
  const [ready, setReady] = useState(false);
  const preview = useRef(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let first = false;
    try { first = !sessionStorage.getItem("moth-curtain"); sessionStorage.setItem("moth-curtain", "1"); } catch {}
    if (first && !reduced) setCurtain(true);
    else setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = scope.current;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const smoother = ScrollSmoother.create({ wrapper: "#smooth-wrapper", content: "#smooth-content", smooth: 1.1, effects: true });

      // the headline: each letter up into place, then heavier where the pointer is
      const split = SplitText.create(root.querySelectorAll(".hero h1 .line:not(.said)"), { type: "chars", charsClass: "char" });
      const said = root.querySelector(".hero h1 .said em");
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .from(split.chars, { yPercent: 105, duration: 1.3, stagger: 0.025 })
        .from(said, { yPercent: 105, rotate: 4, duration: 1.3 }, "-=1.05")
        .fromTo(root.querySelectorAll(".hero [data-reveal]"), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08 }, "-=1");
      const weights = split.chars.map((char) => gsap.quickTo(char, "fontWeight", { duration: 0.6, ease: "power3" }));
      const heavier = (e) => {
        for (const [k, char] of split.chars.entries()) {
          const box = char.getBoundingClientRect();
          const distance = Math.hypot(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2));
          weights[k](900 - Math.min(1, distance / 420) * 600);
        }
      };
      const lighter = () => weights.forEach((w) => w(700));
      const hero = root.querySelector(".hero");
      hero.addEventListener("pointermove", heavier);
      hero.addEventListener("pointerleave", lighter);

      // lines that draw themselves across, and things that come up as they're reached
      for (const rule of root.querySelectorAll(".rule")) gsap.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: rule, start: "top 90%" } });
      for (const group of root.querySelectorAll("[data-reveal-group]")) {
        gsap.fromTo(group.querySelectorAll("[data-reveal]"), { autoAlpha: 0, yPercent: 30 }, { autoAlpha: 1, yPercent: 0, duration: 1.1, stagger: 0.07, ease: "expo.out", scrollTrigger: { trigger: group, start: "top 80%" } });
      }
      const headings = [...root.querySelectorAll("h2.split")].map((heading) => {
        const lines = SplitText.create(heading, { type: "lines", mask: "lines" });
        gsap.from(lines.lines, { yPercent: 105, duration: 1.2, stagger: 0.08, ease: "expo.out", scrollTrigger: { trigger: heading, start: "top 85%" } });
        return lines;
      });

      // the seal turns as the page goes by
      gsap.to(root.querySelector(".seal svg"), { rotate: 360, ease: "none", scrollTrigger: { trigger: root.querySelector(".engines"), start: "top bottom", end: "bottom top", scrub: 0.5 } });

      // the numbers count up to what they are
      for (const number of root.querySelectorAll("[data-count]")) {
        const to = Number(number.dataset.count);
        const counter = { value: 0 };
        gsap.to(counter, { value: to, duration: 1.8, ease: "expo.out", scrollTrigger: { trigger: number, start: "top 88%" }, onUpdate: () => { number.textContent = Math.round(counter.value).toLocaleString("en"); } });
      }

      // the name, at the very end, letter by letter
      gsap.from(".foot .wordmark span", { yPercent: 100, duration: 1.4, stagger: 0.06, ease: "expo.out", scrollTrigger: { trigger: ".foot", start: "top 70%" } });

      motionReady();
      return () => {
        hero.removeEventListener("pointermove", heavier);
        hero.removeEventListener("pointerleave", lighter);
        headings.forEach((lines) => lines.revert());
        split.revert();
        smoother.kill();
      };
    });

    // the reel, on a wide screen: the page stops while the programs go up through the lens, one at a time
    media.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      const section = root.querySelector(".reel");
      const track = section.querySelector(".track");
      const cards = [...track.children];
      const step = () => cards[1].offsetTop - cards[0].offsetTop;
      const place = (p) => {
        gsap.set(track, { y: -p * step() });
        cards.forEach((card, k) => {
          const d = Math.min(1, Math.abs(k - p));
          gsap.set(card, { opacity: 1 - 0.72 * d, scale: 1 - 0.1 * d, filter: `grayscale(${d})` });
        });
      };
      place(0);
      const trigger = ScrollTrigger.create({
        trigger: section, start: "top top", end: () => `+=${(REEL.length - 1) * window.innerHeight * 0.5}`, pin: true, scrub: true,
        snap: { snapTo: 1 / (REEL.length - 1), duration: { min: 0.2, max: 0.6 }, ease: "power2.inOut", delay: 0.05 },
        onUpdate: (self) => {
          const p = self.progress * (REEL.length - 1);
          place(p);
          setActive(Math.round(p));
        },
      });
      return () => { trigger.kill(); gsap.set([track, ...cards], { clearProps: "all" }); };
    });
    media.add("(prefers-reduced-motion: reduce)", () => motionReady());
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
                <div className="meta" data-reveal>
                  <span>(01)</span><span>A programming language</span><span>Windows · Linux · the web</span><span>Open source</span>
                </div>
                <h1 aria-label="Write code the way you'd say it.">
                  <span className="line" aria-hidden="true">Write code</span>
                  <span className="line" aria-hidden="true">the way you&apos;d</span>
                  <span className="line said" aria-hidden="true"><em>say it.</em></span>
                </h1>
                <div className="hero-foot">
                  <p className="intro" data-reveal>Moth has no symbols to learn. <code>if age is at least 18</code>, not <code>if (age &gt;= 18) {"{"}</code>. Run it here in your browser; build it into a program of its own for Windows or Linux.</p>
                  <div className="cta" data-reveal>
                    <a className="btn primary" href={`${BASE}/playground`} data-cursor="Write"><span>Open the playground</span></a>
                    <Link className="btn ghost" href="/learn" data-cursor="Learn"><span>{lessons} lessons</span></Link>
                  </div>
                  <p className="install" data-reveal><code>moth build hello.moth</code><span>→ hello.exe</span></p>
                </div>
              </div>
            </section>

            <section className="reel" aria-label="Moth, a thing at a time">
              <div className="reel-stage wrap">
                <div className="reel-list">
                  <p className="label">(02) Moth, a thing at a time</p>
                  <ol>{REEL.map((r, k) => <li key={r.name} className={k === active ? "on" : ""}><span>{pad(k + 1)}</span>{r.name}</li>)}</ol>
                </div>
                <div className="reel-lens">
                  <div className="brackets" aria-hidden="true"><i /><i /></div>
                  <ol className="track">
                    {REEL.map((r) => (
                      <li key={r.name} className="reel-card">
                        <div className="card-head"><span>{r.name.toLowerCase()}.moth</span><span>run ↗</span></div>
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
                    <p className="label">{now.bad ? "Moth says, stopping" : "→ says"}</p>
                    {now.said.map((line, k) => <p key={k} className="said-line" style={{ animationDelay: `${0.08 * k}s` }}>{line}</p>)}
                  </div>
                </div>
              </div>
            </section>

            <section className="engines wrap">
              <span className="rule" />
              <div className="engines-head">
                <p className="label">(03) Where it runs</p>
                <h2 className="split">One language. <em>Four engines.</em> Every machine.</h2>
                <div className="seal" aria-hidden="true">
                  <svg viewBox="0 0 200 200">
                    <defs><path id="seal-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" /></defs>
                    <text><textPath href="#seal-circle">READS LIKE ENGLISH · RUNS LIKE MACHINE CODE · </textPath></text>
                  </svg>
                  <MothMark className="seal-mark" />
                </div>
              </div>
              <ol className="engine-rows" data-reveal-group>
                {ENGINES.map(([name, line, more], k) => (
                  <li key={name} data-reveal>
                    <span className="n">{pad(k + 1)}</span>
                    <span className="name">{name}</span>
                    <span className="line">{line}</span>
                    <span className="more">{more}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="versus wrap">
              <span className="rule" />
              <p className="label">(04) The same program</p>
              <h2 className="split">Only one of them <em>reads out loud.</em></h2>
              <div className="columns" data-reveal-group>
                <div className="col moth" data-reveal>
                  <p className="label">Moth</p>
                  <pre><code><Highlighted code={SAME.moth} /></code></pre>
                  <p className="out">→ 77 passed<br />→ 91 passed</p>
                </div>
                <div className="col" data-reveal><p className="label">Python</p><pre><code>{SAME.python}</code></pre></div>
                <div className="col" data-reveal><p className="label">JavaScript</p><pre><code>{SAME.js}</code></pre></div>
              </div>
            </section>

            <section className="numbers wrap">
              <span className="rule" />
              <p className="label">(05) In numbers</p>
              <div className="grid" data-reveal-group>
                <div data-reveal><b data-count="4">4</b><span>engines, saying exactly the same things</span></div>
                <div data-reveal><b data-count={libraries}>{libraries}</b><span>libraries that come with it</span></div>
                <div data-reveal><b data-count={functions}>{functions.toLocaleString("en")}</b><span>functions, each with an example</span></div>
                <div data-reveal><b data-count={lessons}>{lessons}</b><span>lessons, one evening</span></div>
              </div>
            </section>

            <section className="works wrap" onPointerLeave={() => setHovered(null)}>
              <span className="rule" />
              <p className="label">(06) Made with Moth</p>
              <ol data-reveal-group>
                {gallery.map((g, k) => (
                  <li key={g.name} data-reveal onPointerEnter={() => setHovered(k)}>
                    <a href={playgroundLink(g.code)} data-cursor="Open">
                      <span className="n">{pad(k + 1)}</span>
                      <span className="name">{g.name}</span>
                      <span className="about">{g.about}</span>
                      <span className="go">Open in the playground ↗</span>
                    </a>
                  </li>
                ))}
              </ol>
              <div className={`preview${hovered !== null ? " on" : ""}`} ref={preview} aria-hidden="true">
                {gallery.map((g, k) => <img key={g.name} src={`${BASE}/docs/${g.picture}`} alt="" className={k === hovered ? "on" : ""} />)}
              </div>
            </section>

            <section className="start wrap" data-reveal-group>
              <span className="rule" />
              <h2 className="split">Start writing Moth <em>in ten seconds.</em></h2>
              <div className="start-foot">
                <p data-reveal>No install, no account: the playground runs it in this tab. When you&apos;re ready, one command makes it a program of its own.</p>
                <div className="cta" data-reveal>
                  <a className="btn primary" href={`${BASE}/playground`} data-cursor="Write"><span>Open the playground</span></a>
                  <a className="btn ghost" href={RELEASES} data-cursor="Get it"><span>Download Moth</span></a>
                </div>
              </div>
            </section>
          </main>
          <Footer />
        </div>
      </div>
    </>
  );
}
