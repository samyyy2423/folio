"use client";
import Ways from "@/app/ways";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Highlighted } from "@/components/CodeView";
import { BASE } from "@/lib/site";
import { gsap, motionReady, revealOnScroll, entrance } from "@/lib/motion";
import Letters from "@/components/Letters";

// The same small program in Folio and in JavaScript
const FOLIO = `set scores to list of 70, 90, 55
set total to 0
for each score in scores
    add score to total
end
say total`;
const JAVASCRIPT = `const scores = [70, 90, 55];
let total = 0;
for (const s of scores) {
  total += s;
}
console.log(total);`;

// The questions people ask, and the answers
const FAQ = [
  {
    q: "Isn't this COBOL again?",
    a: [
      "COBOL showed that code written in English words is readable. It also got verbose. There were many ways to say the same thing, and programs grew long.",
      <>Folio keeps one way to write each thing. <code>folio tidy</code> rewrites a program into that one way, so programs stay short.</>,
    ],
  },
  {
    q: "It looks harder to read than normal languages.",
    a: [
      "If you already read code all day, symbols scan faster. You learned them, and they work for you.",
      <>Folio is a bet on everyone else. Compare <code>for each score in scores</code> with <code>for (const s of scores)</code>. The first needs no explanation.</>,
    ],
  },
  {
    q: "It looks like Ruby.",
    a: [
      "Ruby set the bar for readable code, and Folio owes it a lot.",
      "Folio goes further into English, with no symbols to learn. And it compiles to a standalone native program, so there is no runtime to install.",
    ],
  },
  {
    q: "Why a new language when good ones exist?",
    a: [
      "Because none of them tries this exact idea: code that reads like plain English, compiled to native machine code, with one toolchain for everything.",
      "If readability doesn't have to cost speed, more people can write programs, and more people can read them.",
    ],
  },
];

export default function Why() {
  const scope = useRef(null);
  useEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      motionReady();
      const hero = scope.current.querySelector(".essay-hero");
      const heading = hero.querySelector("h1");
      const undo = entrance(heading, [...hero.querySelectorAll("[data-reveal]")]);
      revealOnScroll(scope.current);
      return undo;
    });
    media.add("(prefers-reduced-motion: reduce)", () => motionReady());
    return () => media.revert();
  }, []);

  return (
    <main ref={scope} className="essay">
      <section className="essay-hero opening">
        <Letters word="why" />
        <div className="wrap">
          <p className="eyebrow" data-reveal>Why Folio</p>
          <h1>Readable, <em>and fast</em>.</h1>
          <p className="lede" data-reveal>Folio is a programming language written in plain English words. It compiles to native machine code, so being readable doesn&apos;t cost speed. This page says who it&apos;s for, what it is, what it isn&apos;t, and answers the questions people ask most.</p>
          <ol className="contents" data-reveal aria-label="On this page">
            <li><a href="#part-01"><span className="no">(01)</span>Who it&apos;s for</a></li>
            <li><a href="#part-02"><span className="no">(02)</span>The idea</a></li>
            <li><a href="#part-03"><span className="no">(03)</span>The same program</a></li>
            <li><a href="#part-04"><span className="no">(04)</span>What it isn&apos;t</a></li>
            <li><a href="#part-05"><span className="no">(05)</span>Questions people ask</a></li>
          </ol>
        </div>
      </section>

      <section className="essay-part wrap" id="part-01" data-reveal-group>
        <h2><span>01</span>Who it&apos;s for</h2>
        <ol className="points">
          <li data-reveal>
            <span>A</span>
            <div>
              <h3>People who read code more than they write it</h3>
              <p>Reviewers, teachers, team leads, anyone who inherits a program. Plain words are quicker to check than symbols you have to decode first.</p>
            </div>
          </li>
          <li data-reveal>
            <span>B</span>
            <div>
              <h3>People who need to program but bounce off symbols</h3>
              <p>Students, analysts, scientists. They know what they want the computer to do. The brackets and operators are what stop them.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="essay-part wrap" id="part-02" data-reveal-group>
        <h2><span>02</span>The idea</h2>
        <ol className="points">
          <li data-reveal>
            <span>1</span>
            <div>
              <h3>Code that reads like plain English</h3>
              <p>A loop is <code>for each score in scores</code>. A test is <code>if total is at least 200</code>. Output is <code>say &quot;We won!&quot;</code>. There is one way to write each thing.</p>
            </div>
          </li>
          <li data-reveal>
            <span>2</span>
            <div>
              <h3>Compiled to native machine code</h3>
              <p>Folio builds a program into machine code for Windows or Linux: one file, with nothing else to install. On our benchmarks it runs about as fast as C on three programs out of four. <Link href="/benchmarks">See the numbers.</Link></p>
            </div>
          </li>
          <li data-reveal>
            <span>3</span>
            <div>
              <h3>One toolchain</h3>
              <p>Everything comes in the one <code>folio</code> program, so there is nothing to choose or set up.</p>
              <div className="tools">
                <code>folio build</code><code>folio test</code><code>folio tidy</code><code>folio check</code><code>packages</code><code>a debugger</code><code>GPU training</code>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <section className="essay-part wrap" id="part-03" data-reveal-group>
        <h2><span>03</span>The same program</h2>
        <div className="essay-body">
          <p data-reveal>Add up three scores and show the total. First in Folio, then in JavaScript.</p>
          <div className="side" data-reveal>
            <figure><figcaption><span>Folio</span><span>total.folio</span></figcaption><pre><code><Highlighted code={FOLIO} /></code></pre></figure>
            <figure><figcaption><span>JavaScript</span><span>total.js</span></figcaption><pre><code>{JAVASCRIPT}</code></pre></figure>
          </div>
          <p data-reveal>Both print 215. Someone who has never programmed can read the first one out loud and say what it does.</p>
        </div>
      </section>

      <section className="essay-part wrap" id="part-04" data-reveal-group>
        <h2><span>04</span>What it isn&apos;t</h2>
        <div className="essay-body">
          <p data-reveal><b>Folio is not a replacement for Rust or Python.</b> They are mature languages, with large communities and libraries that took decades to build. If you know them and they work for you, keep using them.</p>
          <p data-reveal>Folio is an experiment. It asks how far readability can go, and what it costs. So far, the answer on speed is: not much.</p>
        </div>
      </section>

      <section className="essay-part wrap" id="part-05" data-reveal-group>
        <h2><span>05</span>Questions people ask</h2>
        <div className="faq" data-reveal>
          {FAQ.map(({ q, a }, k) => (
            <details key={q} open={k === 0}>
              <summary>{q}</summary>
              <div>{a.map((line, i) => <p key={i}>{line}</p>)}</div>
            </details>
          ))}
        </div>
      </section>

      <Ways to={["benchmarks", "playground", "writing"]} n="→" name="Where next" last={null} moves />
    </main>
  );
}
