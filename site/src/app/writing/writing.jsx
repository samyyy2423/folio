"use client";
import Ways from "@/app/ways";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Highlighted } from "@/components/CodeView";
import { BASE, playgroundLink } from "@/lib/site";
import { gsap, motionReady, revealOnScroll, entrance } from "@/lib/motion";
import Letters from "@/components/Letters";
import { LOGIC, SHORTER, CART, SHOP, SHOP_SAYS, CART_TEST } from "./examples";

const lines = (code) => code.split("\n").length;

// A program, and what it says when it runs
function Program({ name, code, says, open = true }) {
  return (
    <figure className="program">
      <figcaption><span>{name}</span>{open && <a href={playgroundLink(code)} data-cursor="Run">Run it ↗</a>}</figcaption>
      <pre><code><Highlighted code={code} /></code></pre>
      {says && (
        <div className="program-says">
          <span className="label">→ says</span>
          {says.map((line, k) => <p key={k}>{line}</p>)}
        </div>
      )}
    </figure>
  );
}

// How to make a larger program small, a rule at a time
const RULES = [
  ["One job for each function", <>Name a function for what it gives. <code>cost_of(basket)</code> reads as a sentence, and a function that does one thing is easy to test.</>],
  ["A kind for each thing", <>The things a program is about get a kind: <code>kind line with name, price, count or 1</code>. Then a value carries its own fields, and no function needs five inputs.</>],
  ["A file for each part", <><code>use &quot;cart.folio&quot; as cart</code> keeps the file&apos;s names to itself. The program reaches them as <code>cart&apos;s cost_of</code>, and two files can use the same names.</>],
  ["Say what goes in and out", <><code>as a number</code> on an input and <code>gives a number</code> on a function. <code>folio check</code> finds where the code goes against them, before it runs.</>],
  ["A test file beside each part", <>Put <code>cart.test.folio</code> next to <code>cart.folio</code>. <code>folio test</code> runs every function whose name starts with <code>test_</code>.</>],
  ["Let folio tidy keep it short", <>There is one way to write each thing. <code>folio tidy</code> rewrites a file into it, so the code keeps one shape, whoever wrote it.</>],
];

const CHECKLIST = [
  <>Names that say what a value is: <code>total</code>, not <code>t</code>.</>,
  <><code>where</code> on a loop instead of an <code>if</code> inside it.</>,
  <><code>give</code> instead of an empty list and <code>add</code>.</>,
  <><code>match</code> instead of a chain of <code>else if</code>.</>,
  <><code>set a, b to</code> for names set together.</>,
  <>A <code>where</code> on a function for what its inputs must be.</>,
  <>A kind for each thing, a file for each part, a test for each file.</>,
  <><code>folio tidy</code> before you commit.</>,
];

export default function Writing() {
  const scope = useRef(null);
  useEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      motionReady();
      const hero = scope.current.querySelector(".essay-hero");
      const undo = entrance(hero.querySelector("h1"), [...hero.querySelectorAll("[data-reveal]")]);
      revealOnScroll(scope.current);
      return undo;
    });
    media.add("(prefers-reduced-motion: reduce)", () => motionReady());
    return () => media.revert();
  }, []);

  return (
    <main ref={scope} className="essay writing">
      <section className="essay-hero opening">
        <Letters word="writing" />
        <div className="wrap">
          <p className="eyebrow" data-reveal>Writing Folio</p>
          <h1>Logic in plain words. <em>Programs that stay small.</em></h1>
          <p className="lede" data-reveal>How to write the logic of a program in Folio, how to say it in fewer lines, and how to keep a larger program small. Every example on this page runs, and says what it shows.</p>
          <ol className="contents" data-reveal aria-label="On this page">
            <li><a href="#part-01"><span className="no">(01)</span>Logic, a piece at a time</a></li>
            <li><a href="#part-02"><span className="no">(02)</span>Writing less</a></li>
            <li><a href="#part-03"><span className="no">(03)</span>A larger program</a></li>
            <li><a href="#part-04"><span className="no">(04)</span>Checklist</a></li>
          </ol>
        </div>
      </section>

      <section className="essay-part wrap" id="logic">
        <h2><span>01</span>Logic, a piece at a time</h2>
        <div className="steps-list">
          {LOGIC.map((x, k) => (
            <article className="step-item" key={x.id} data-reveal-group>
              <div className="step-words" data-reveal>
                <p className="step-n">{String(k + 1).padStart(2, "0")}</p>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </div>
              <div data-reveal><Program name={`${x.id}.folio`} code={x.code} says={x.says} /></div>
            </article>
          ))}
        </div>
      </section>

      <section className="essay-part wrap" id="shorter">
        <h2><span>02</span>Writing less</h2>
        <div className="steps-list">
          <p className="intro-line" data-reveal>Each pair says the same thing. The second is how Folio means it to be written.</p>
          {SHORTER.map((x) => (
            <article className="pair" key={x.id} data-reveal-group>
              <div className="step-words" data-reveal>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </div>
              <div className="pair-code" data-reveal>
                <div className="long"><p className="pair-label">The long way <span>{lines(x.long)} lines</span></p><Program name="before.folio" code={x.long} open={false} /></div>
                <div className="short"><p className="pair-label">The Folio way <span>{lines(x.short)} lines</span></p><Program name="after.folio" code={x.short} says={x.says} /></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="essay-part wrap" id="larger">
        <h2><span>03</span>A larger program</h2>
        <div className="steps-list">
          <ol className="points" data-reveal-group>
            {RULES.map(([title, body], k) => (
              <li key={title} data-reveal>
                <span>{k + 1}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>

          <div className="tree-and-files" data-reveal-group>
            <div className="tree" data-reveal>
              <p className="label">A shop, in three files</p>
              <pre>{`shop/
  shop.folio          the program
  cart.folio          what a cart is and costs
  cart.test.folio     what cart.folio must do`}</pre>
              <p className="tree-note">shop.folio stays short because cart.folio does the work, and cart.test.folio says what that work is.</p>
            </div>
            <div data-reveal><Program name="cart.folio" code={CART} open={false} /></div>
            <div data-reveal><Program name="shop.folio" code={SHOP} says={SHOP_SAYS} open={false} /></div>
            <div data-reveal><Program name="cart.test.folio" code={CART_TEST} says={["2 tests pass"]} open={false} /></div>
          </div>

          <div className="commands" data-reveal>
            <p className="label">Then, in the shop folder</p>
            <pre>{`folio check shop.folio     find problems without running it
folio test                 run every test_ function here
folio tidy shop.folio      write it the one way Folio writes code
folio build shop.folio     make shop.exe, a program of its own`}</pre>
          </div>
        </div>
      </section>

      <section className="essay-part wrap" id="checklist" data-reveal-group>
        <h2><span>04</span>Checklist</h2>
        <ul className="method" data-reveal>
          {CHECKLIST.map((item, k) => <li key={k}>{item}</li>)}
        </ul>
      </section>

      <Ways to={["playground", "learn", "docs"]} n="→" name="Where next" last={null} moves />
    </main>
  );
}
