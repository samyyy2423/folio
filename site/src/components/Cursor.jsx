"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/motion";

// The pointer, as the site draws it: a pair of brackets, as the site numbers its notes, (1), with an orange square
// exactly where the pointer is. It never covers what it points at:
// - over nothing, the brackets ride on the pointer, leaning the way it's going;
// - over a small link or button, they go to its two ends and put it in brackets: (Learn);
// - over something with a word of its own (data-cursor), a place to type, or a big link, a block beside the pointer
//   says what a click does: (Run), (type), (→) for another page, (↗) another site, (↓) further down this one.
// They close up while the button's down, and are ink on a light ground and white on a dark one. The system's own
// pointer is hidden while this one's there. Not in the playground, where the pointer edits code, nor on a touch
// screen.
const TYPING = 'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';
const LINKS = 'a[href], button, [role="button"], label[for], summary';

// what's under the pointer: [how the brackets behave, the word they say, the thing that decided it]
function read(el) {
  const typing = el?.closest?.(TYPING);
  const labelled = el?.closest?.("[data-cursor]");
  if (labelled && (!typing || labelled.contains(typing))) return ["word", labelled.dataset.cursor, labelled];
  if (typing) return ["word", "type", typing];
  const link = el?.closest?.(LINKS);
  if (!link) return ["idle", "", null];
  const box = link.getBoundingClientRect();
  if (box.width <= 300 && box.height <= 84) return ["wrap", "", link];
  if (link.tagName !== "A") return ["word", "press", link];
  const href = link.getAttribute("href") ?? "";
  return ["word", href.startsWith("#") ? "↓" : link.origin && link.origin !== location.origin ? "↗" : "→", link];
}

// ink on a light ground, white on a dark one: by the first thing behind the pointer that has a colour of its own
function toneAt(el) {
  for (let at = el; at && at !== document.documentElement; at = at.parentElement) {
    const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(at).backgroundColor);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5)) return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 < 0.3 ? "light" : "dark";
  }
  return "dark";
}

export default function Cursor() {
  const brackets = useRef(null);
  const pip = useRef(null);
  const path = usePathname();
  const off = path === "/playground";
  useEffect(() => {
    if (off || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const html = document.documentElement;
    const el = brackets.current;
    const dot = pip.current;
    const gap = el.querySelector(".gap");
    const word = el.querySelector("b");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const quick = (target, property, duration) => gsap.quickTo(target, property, { duration: reduced ? 0 : duration, ease: "power3" });
    gsap.set(el, { xPercent: -50, yPercent: -50 });
    gsap.set(dot, { xPercent: -50, yPercent: -50 });
    const x = quick(el, "x", 0.18);
    const y = quick(el, "y", 0.18);
    const lean = quick(el, "rotation", 0.45);
    const width = quick(gap, "width", 0.32);
    const dotX = gsap.quickSetter(dot, "x", "px");
    const dotY = gsap.quickSetter(dot, "y", "px");

    let pointer = null;
    let moved = false;
    let target = null; // the element the pointer's over, as the browser last said
    let mode = "idle";
    let thing = null; // the link the brackets are round, or the thing the word's about
    let said = "";
    let blockWidth = 0;
    let scrolledAt = -1e9;
    let asked = 0;

    const become = (node) => {
      if (node === target) return;
      target = node;
      const [next, text, what] = read(node);
      el.dataset.tone = toneAt(node);
      if (next === mode && what === thing && text === said) return;
      mode = next;
      thing = what;
      said = text;
      el.dataset.mode = mode;
      word.textContent = text;
      if (mode === "word") {
        // a block beside the pointer: its corner at the pointer, not its middle (read once, here: how wide it'll be)
        blockWidth = word.offsetWidth + 46;
        width(word.offsetWidth + 6);
        gsap.to(el, { xPercent: 0, yPercent: 0, fontSize: 24, rotation: 0, duration: reduced ? 0 : 0.3, ease: "power3.out", overwrite: "auto" });
      } else if (mode === "wrap") {
        const box = what.getBoundingClientRect();
        gsap.to(el, { xPercent: -50, yPercent: -50, fontSize: Math.max(34, Math.min(76, box.height * 1.08)), rotation: 0, duration: reduced ? 0 : 0.3, ease: "power3.out", overwrite: "auto" });
      } else {
        width(13);
        gsap.to(el, { xPercent: -50, yPercent: -50, fontSize: 38, duration: reduced ? 0 : 0.3, ease: "power3.out", overwrite: "auto" });
      }
    };

    // once a frame, before anything's written in it (so reading where a link is costs no extra layout)
    const frame = () => {
      if (!pointer) return;
      const [px, py] = pointer;
      if (!moved && performance.now() - scrolledAt < 1500 && ++asked % 6 === 0) become(document.elementFromPoint(px, py)); // the page moved under a still pointer
      if (mode === "wrap" && thing?.isConnected) {
        const box = thing.getBoundingClientRect();
        x(box.left + box.width / 2);
        y(box.top + box.height / 2);
        width(box.width + 2);
      } else if (mode === "word") {
        const left = px + 16 + blockWidth > innerWidth; // no room to the right: to the left of the pointer
        const above = py + 64 > innerHeight;
        x(left ? px - 16 - blockWidth : px + 16);
        y(above ? py - 54 : py + 20);
      } else if (moved) {
        x(px);
        y(py);
      }
      if (moved) { dotX(px); dotY(py); } else if (mode === "idle") lean(0); // still: upright again
      moved = false;
    };

    const show = (yes) => gsap.to([el, dot], { autoAlpha: yes ? 1 : 0, duration: 0.2, overwrite: "auto" });
    const move = (e) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (!pointer) { // the first move: start where the pointer is, not slide in from the corner
        gsap.set([el, dot], { x: e.clientX, y: e.clientY });
        x(e.clientX, e.clientX);
        y(e.clientY, e.clientY);
        html.classList.add("custom-cursor");
        show(true);
      } else if (mode === "idle" && !reduced) {
        lean(Math.max(-16, Math.min(16, (e.clientX - pointer[0]) * 1.1))); // leaning the way it's going
      }
      pointer = [e.clientX, e.clientY];
      moved = true;
      become(e.target);
    };
    const press = () => gsap.to(el, { scaleX: mode === "idle" ? 0.7 : 0.94, scaleY: mode === "idle" ? 1 : 0.94, duration: 0.12, ease: "power2.out", overwrite: "auto" });
    const release = () => gsap.to(el, { scaleX: 1, scaleY: 1, duration: reduced ? 0 : 0.5, ease: "back.out(3.5)", overwrite: "auto" });
    const leave = () => show(false);
    const enter = () => { if (pointer) show(true); };
    const scrolled = () => { scrolledAt = performance.now(); };

    gsap.ticker.add(frame, false, true);
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerdown", press, { passive: true });
    addEventListener("pointerup", release, { passive: true });
    addEventListener("scroll", scrolled, { passive: true });
    html.addEventListener("mouseleave", leave);
    html.addEventListener("mouseenter", enter);
    return () => {
      gsap.ticker.remove(frame);
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", press);
      removeEventListener("pointerup", release);
      removeEventListener("scroll", scrolled);
      html.removeEventListener("mouseleave", leave);
      html.removeEventListener("mouseenter", enter);
      html.classList.remove("custom-cursor");
      gsap.killTweensOf([el, dot, gap]);
    };
  }, [off]);
  if (off) return null;
  return (
    <>
      <div className="cursor" ref={brackets} data-mode="idle" data-tone="dark" aria-hidden="true"><span className="paren">(</span><span className="gap"><b /></span><span className="paren">)</span></div>
      <div className="cursor-pip" ref={pip} aria-hidden="true" />
    </>
  );
}
