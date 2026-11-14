"use client";
import Ways from "@/app/ways";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { BASE, GITHUB } from "@/lib/site";
import { gsap, motionReady, revealOnScroll, entrance } from "@/lib/motion";
import Letters from "@/components/Letters";

// What versus/race.py measured on a Windows laptop: each time a whole run, start-up included, in milliseconds
const RACES = [
  { name: "fib(32)", about: "A function that calls itself, about 7 million times.", times: { Folio: 23, C: 18, Rust: 16, JavaScript: 78, Python: 406 } },
  { name: "100 million adds", about: "Add up every number from 1 to 100,000,000, in a plain loop.", times: { Folio: 33, C: 34, Rust: 8, JavaScript: 133, Python: 9307 } },
  { name: "Primes", about: "Count the primes up to 300,000, by trying each divisor.", times: { Folio: 69, C: 69, Rust: 71, JavaScript: 114, Python: 1870 } },
  { name: "Float maths", about: "30 million steps of decimal maths: the sum of 1 / (i × i).", times: { Folio: 46, C: 46, Rust: 47, JavaScript: 97, Python: 4214 } },
];
// And machine learning, against PyTorch, on the same laptop
const AI = [
  { name: "One GPT training step", about: "On the graphics card, a GTX 1650.", unit: "ms", digits: 1, times: { Folio: 3.0, PyTorch: 9.1 } },
  { name: "The digit reader", about: "On the processor.", unit: "s", digits: 2, times: { Folio: 0.65, PyTorch: 0.5 } },
];
const LOW = 5; // the log scale's ends, in milliseconds: every time on the page falls between them
const HIGH = 12000;
const logWidth = (ms) => `${((100 * Math.log(ms / LOW)) / Math.log(HIGH / LOW)).toFixed(2)}%`; // rounded: the server and the browser agree
const shown = (n, digits = 0) => (n >= 1000 ? Math.round(n).toLocaleString("en") : n.toFixed(digits));

function Bars({ times, unit = "ms", digits = 0, width }) {
  const fastest = Math.min(...Object.values(times));
  const most = Math.max(...Object.values(times));
  return (
    <ul className="bars">
      {Object.entries(times).map(([lang, t]) => (
        <li key={lang} className={`race-row ${lang.toLowerCase()}${t === fastest ? " best" : ""}`}>
          <span className="lang">{lang}</span>
          <span className="track"><i className="fill" style={{ "--w": width ? width(t) : `${((100 * t) / most).toFixed(2)}%` }} /></span>
          <span className="ms" data-value={t} data-unit={unit} data-digits={digits}>{shown(t, digits)} {unit}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Benchmarks() {
  const scope = useRef(null);
  useEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      motionReady();
      const hero = scope.current.querySelector(".essay-hero");
      const undo = entrance(hero.querySelector("h1"), [...hero.querySelectorAll("[data-reveal]")]);
      revealOnScroll(scope.current);
      // each chart's bars grow from nothing as it comes in, and its times count up with them
      const charts = [...scope.current.querySelectorAll(".chart")].map((chart) => {
        const t = gsap.timeline({ scrollTrigger: { trigger: chart, start: "top 80%" } })
          .from(chart.querySelectorAll(".fill"), { scaleX: 0, duration: 1.2, stagger: 0.08, ease: "expo.out" });
        chart.querySelectorAll(".ms").forEach((label, k) => {
          const to = Number(label.dataset.value);
          const digits = Number(label.dataset.digits);
          const n = { v: 0 };
          t.to(n, { v: to, duration: 1.2, ease: "expo.out", onUpdate: () => { label.textContent = `${shown(n.v, digits)} ${label.dataset.unit}`; } }, k * 0.08);
        });
        return t;
      });
      return () => { undo(); charts.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); }); };
    });
    media.add("(prefers-reduced-motion: reduce)", () => motionReady());
    return () => media.revert();
  }, []);

  return (
    <main ref={scope} className="essay">
      <section className="essay-hero opening">
        <Letters word="benchmarks" />
        <div className="wrap">
          <p className="eyebrow" data-reveal>Benchmarks</p>
          <h1>How fast is <em>Folio</em>?</h1>
          <p className="lede" data-reveal>The same four programs in Folio, C, Rust, JavaScript and Python. Each time is a whole run, start-up included, on a Windows laptop. Shorter bars are faster.</p>
          <ol className="contents" data-reveal aria-label="On this page">
            <li><a href="#part-01"><span className="no">(01)</span>The short answer</a></li>
            <li><a href="#part-02"><span className="no">(02)</span>Four programs</a></li>
            <li><a href="#part-03"><span className="no">(03)</span>Machine learning</a></li>
            <li><a href="#part-04"><span className="no">(04)</span>How it was measured</a></li>
          </ol>
        </div>
      </section>

      <section className="essay-part wrap" id="part-01" data-reveal-group>
        <h2><span>01</span>The short answer</h2>
        <div className="essay-body">
          <p className="summary" data-reveal>Folio is about as fast as C on three of the four programs. Rust wins the plain add loop by a wide margin. On fib, Folio takes 23 ms to C&apos;s 18.</p>
          <p data-reveal><b>Why Rust wins the add loop:</b> its compiler turns the loop into vector instructions, which add several numbers at once. Folio and C add one number at a time there.</p>
          <p data-reveal><b>Against JavaScript and Python:</b> Folio is 1.7 to 4 times faster than Node.js on these programs, and 18 to 280 times faster than Python.</p>
        </div>
      </section>

      <section className="essay-part wrap" id="part-02" data-reveal-group>
        <h2><span>02</span>Four programs</h2>
        <div className="essay-body" style={{ maxWidth: "none" }}>
          <div className="charts">
            {RACES.map((race) => (
              <div className="chart" key={race.name} data-reveal>
                <h3>{race.name}</h3>
                <p className="about">{race.about}</p>
                <Bars times={race.times} width={logWidth} />
              </div>
            ))}
          </div>
          <p className="scale-note" data-reveal>Bars on a log scale, so Python fits on the page. ◆ marks the fastest.</p>
        </div>
      </section>

      <section className="essay-part wrap" id="part-03" data-reveal-group>
        <h2><span>03</span>Machine learning</h2>
        <div className="essay-body" style={{ maxWidth: "none" }}>
          <p data-reveal>Folio can train neural networks, on the processor or on an NVIDIA graphics card. Here it is against PyTorch, on the same laptop. PyTorch is faster at the digit reader; Folio is faster at a GPT training step.</p>
          <div className="charts">
            {AI.map((race) => (
              <div className="chart" key={race.name} data-reveal>
                <h3>{race.name}</h3>
                <p className="about">{race.about}</p>
                <Bars times={race.times} unit={race.unit} digits={race.digits} />
              </div>
            ))}
          </div>
          <p className="scale-note" data-reveal>Bars to scale, against the slower of the two.</p>
        </div>
      </section>

      <section className="essay-part wrap" id="part-04" data-reveal-group>
        <h2><span>04</span>How it was measured</h2>
        <div className="essay-body">
          <ul className="method" data-reveal>
            <li>Every program runs as a whole process, from start to finish, so each language&apos;s start-up counts.</li>
            <li>Each time is the least wall time of five runs. Python gets two runs on the four slow programs.</li>
            <li>The languages take turns, so none of them gets a warm machine to itself.</li>
            <li>Folio is built to machine code with <code>folio build</code>. C and Rust are compiled with optimisation on. JavaScript runs on Node.js, Python on CPython.</li>
          </ul>
          <p data-reveal>The programs and the script are in the repository, in <a href={`${GITHUB}/tree/main/versus`}>versus/</a>. To run the race on your own machine:</p>
          <p className="command" data-reveal>python versus/race.py</p>
          <p data-reveal>Numbers will differ from machine to machine. The order mostly doesn&apos;t.</p>
        </div>
      </section>

      <Ways to={["why", "playground", "learn"]} n="→" name="Where next" last={null} moves />
    </main>
  );
}
