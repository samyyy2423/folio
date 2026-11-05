"use client";
import { useEffect, useRef, useState } from "react";
import { Highlighted } from "@/components/CodeView";
import { BASE, playgroundLink } from "@/lib/site";
import { LESSONS } from "@/generated/learn-lessons.js";
import { gsap, motionReady, revealOnScroll } from "@/lib/motion";

const STORE = "moth-learn-done"; // what learn.html kept, so progress made there carries on here

// WebAssembly where the browser has its GC and exceptions, as the playground starts on; else the JIT
function engineHere() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 3, 1, 0x5f, 0]))
      && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 0x60, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 0x06, 0x40, 0x19, 0x0b, 0x0b])) ? "wasm" : "jit";
  } catch {
    return "jit";
  }
}

function Lesson({ lesson, index, onRun }) {
  const [code, setCode] = useState(lesson.code);
  const [lines, setLines] = useState([]); // [text, bad]
  const [status, setStatus] = useState("");
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");
  const worker = useRef(null);
  const answers = useRef([]);
  const stop = () => { worker.current?.terminate(); worker.current = null; };
  useEffect(() => stop, []);

  function start(source = code) {
    stop();
    setQuestion(null);
    setLines([]);
    setStatus("Running…");
    const current = (worker.current = new Worker(`${BASE}/worker.js`, { type: "module" }));
    const limit = setTimeout(() => {
      if (worker.current !== current) return;
      stop();
      setStatus("Stopped after 10 seconds: does a loop never end?");
    }, 10000);
    current.onmessage = ({ data }) => {
      if (worker.current !== current) return;
      if (data.lines?.length) setLines((said) => [...said, ...data.lines.map((line) => (typeof line === "string" ? [line, false] : [line.error, true]))]);
      if (data.question !== undefined) {
        clearTimeout(limit);
        setStatus("Waiting for your answer");
        setQuestion(data.question);
        setAnswer("");
        return;
      }
      if (data.error) {
        clearTimeout(limit);
        setLines((said) => [...said, [data.error.replace(/^Error: /, ""), true]]);
        setStatus("Moth found a mistake: read what it says above");
        stop();
      }
      if (data.done) {
        clearTimeout(limit);
        const ms = data.ms < 10 ? data.ms.toFixed(1) : Math.round(data.ms);
        setStatus(`Ran in ${ms} ms${data.empty ? ", and said nothing" : ""}`);
        stop();
      }
      if (data.done || data.error) onRun(index);
    };
    current.onerror = (e) => { clearTimeout(limit); setStatus(`Error: ${e.message || "the program stopped unexpectedly"}`); stop(); };
    current.postMessage({ source, engine: engineHere(), answers: answers.current, files: {}, seed: Math.floor(Math.random() * 2 ** 32), disk: {} });
  }

  const run = () => {
    if (lesson.draws) {
      onRun(index);
      window.open(playgroundLink(code), "_blank", "noopener");
      return;
    }
    answers.current = [];
    start();
  };
  const reset = () => { stop(); answers.current = []; setCode(lesson.code); setLines([]); setStatus(""); setQuestion(null); };
  const keys = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    if (e.key === "Tab" && !e.shiftKey) { // four spaces, as Moth is written
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b, value } = e.currentTarget;
      const next = value.slice(0, a) + "    " + value.slice(b);
      setCode(next);
      requestAnimationFrame(() => { e.target.selectionStart = e.target.selectionEnd = a + 4; });
    }
  };
  const rows = code.split("\n").length;
  return (
    <section className="lesson" id={`lesson-${index + 1}`} data-reveal-group>
      <h2 data-reveal><span>{String(index + 1).padStart(2, "0")}</span>{lesson.title}</h2>
      <div className="intro" data-reveal dangerouslySetInnerHTML={{ __html: lesson.intro }} />
      <div className="box" data-reveal>
        <div className="head">
          <span className="name">lesson-{index + 1}.moth</span>
          <span className="grow" />
          <button type="button" className="quiet" onClick={reset} title="Put the lesson's program back">Reset</button>
          <a className="quiet" href={playgroundLink(code)} target="_blank" rel="noopener">Open in the playground ↗</a>
          <button type="button" className="run" onClick={run}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" /></svg>{lesson.draws ? "Run it in the playground" : "Run"}</button>
        </div>
        <div className="editor-lite" style={{ "--rows": rows + 1 }}>
          <pre aria-hidden="true"><code><Highlighted code={code + "\n"} /></code></pre>
          <textarea value={code} spellCheck={false} rows={rows + 1} aria-label={`The program for lesson ${index + 1}`} onChange={(e) => setCode(e.target.value)} onKeyDown={keys} />
        </div>
        {lines.length > 0 && <pre className="out" aria-live="polite">{lines.map(([text, bad], k) => <span key={k} className={bad ? "bad" : ""}>{text}{"\n"}</span>)}</pre>}
        {question !== null && (
          <form className="ask" onSubmit={(e) => { e.preventDefault(); answers.current.push({ text: answer }); start(); }}>
            <label htmlFor={`ask-${index}`}>{question}</label>
            <input id={`ask-${index}`} type="text" autoComplete="off" autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <button type="submit" className="run">Answer</button>
          </form>
        )}
        {status && <div className="status-line">{status}</div>}
      </div>
      <div className="try" data-reveal><b>Try this</b><span dangerouslySetInnerHTML={{ __html: lesson.try }} /></div>
    </section>
  );
}

export default function Lessons() {
  const [done, setDone] = useState(() => new Set());
  const [active, setActive] = useState(0);
  const scope = useRef(null);
  useEffect(() => {
    try { setDone(new Set(JSON.parse(localStorage.getItem(STORE) || "[]"))); } catch {}
  }, []);
  const ran = (i) => setDone((before) => {
    const after = new Set(before).add(i);
    try { localStorage.setItem(STORE, JSON.stringify([...after])); } catch {}
    return after;
  });
  useEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(scope.current.querySelectorAll(".learn-hero [data-reveal]"), { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.1, ease: "power4.out" });
      revealOnScroll(scope.current);
      motionReady();
    });
    media.add("(prefers-reduced-motion: reduce)", () => motionReady());
    // which lesson is being read, for the list beside them
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setActive(Number(entry.target.id.slice("lesson-".length)) - 1);
    }, { rootMargin: "-40% 0px -55% 0px" });
    scope.current.querySelectorAll(".lesson").forEach((lesson) => seen.observe(lesson));
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
    return () => { media.revert(); seen.disconnect(); };
  }, []);
  const share = Math.round((100 * done.size) / LESSONS.length);
  return (
    <main ref={scope} className="learn">
      <section className="learn-hero wrap">
        <p className="eyebrow" data-reveal>Learn Moth</p>
        <h1 data-reveal>Eleven lessons. <span className="wing-text">One evening.</span></h1>
        <p className="lede" data-reveal>Each lesson is a short program to run, change and break. You need nothing but this page: Moth runs right here, in your browser.</p>
        <div className="meter" data-reveal><div className="bar"><i style={{ width: `${share}%` }} /></div><span>{done.size ? `${done.size} of ${LESSONS.length} run` : `${LESSONS.length} lessons`}</span></div>
      </section>
      <div className="learn-layout wrap">
        <nav className="toc" aria-label="Lessons">
          <ol>
            {LESSONS.map((lesson, i) => (
              <li key={lesson.title} className={`${done.has(i) ? "done" : ""}${active === i ? " here" : ""}`}>
                <a href={`#lesson-${i + 1}`}><span>{String(i + 1).padStart(2, "0")}</span>{lesson.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="lessons">
          {LESSONS.map((lesson, i) => <Lesson key={lesson.title} lesson={lesson} index={i} onRun={ran} />)}
        </div>
      </div>
    </main>
  );
}
