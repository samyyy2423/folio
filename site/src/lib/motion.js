"use client";
// GSAP, with the plugins the site uses, registered once, in the browser
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, SplitText, MotionPathPlugin);

// the motion has started: what it brings in no longer needs the 3-second fallback (see layout.jsx)
export const motionReady = () => document.documentElement.classList.add("motion-ready");

// The veil between pages (Transition.jsx) is lifting: a page's own words come up now, as the veil's go, and not
// underneath it, where no one would see them.
const GONE = "folio:veil-gone";
export function veilGone() {
  document.documentElement.classList.remove("veil-up", "veiled");
  window.dispatchEvent(new Event(GONE));
}

// runs `start` now, or once the veil is lifting if it's over the page (and in 5 seconds at most); gives what stops it
// waiting, for a page that's gone before then
export function afterVeil(start) {
  const html = document.documentElement;
  if (!html.classList.contains("veil-up") && !html.classList.contains("veiled")) {
    start();
    return () => {};
  }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    removeEventListener(GONE, go);
    clearTimeout(latest);
    start();
  };
  addEventListener(GONE, go);
  const latest = setTimeout(go, 5000);
  return () => { done = true; removeEventListener(GONE, go); clearTimeout(latest); };
}

// A page's first words: its heading rising a line at a time out of its own lines, the rest coming up after it,
// once the veil between pages is lifting (so the veil's words go up and out, and the page's come up in their place).
// And its opening's way out: the opening stays where it is while the page comes up over it, standing back as it
// does, a little smaller and darker; what follows it is marked `covers`, so it's on paper of its own, the whole
// width, and hides the opening as it passes. Gives what undoes it all.
export function entrance(heading, rest = []) {
  const intro = gsap.timeline({ paused: true });
  let split = null;
  // the page's name, huge behind its opening (Letters.jsx), comes up first, a letter at a time
  const letters = heading?.closest("section")?.querySelectorAll(".letters span") ?? [];
  if (letters.length) intro.from(letters, { yPercent: 75, autoAlpha: 0, duration: 1.4, stagger: 0.06, ease: "expo.out" }, 0);
  if (heading) {
    gsap.set(heading, { autoAlpha: 1 });
    split = SplitText.create(heading, { type: "lines", mask: "lines", linesClass: "h-line" });
    intro.from(split.lines, { yPercent: 108, duration: 1.15, stagger: 0.09, ease: "expo.out" }, letters.length ? 0.3 : 0);
  }
  if (rest.length) intro.fromTo(rest, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08, ease: "power4.out" }, heading ? (letters.length ? 0.55 : 0.25) : 0);
  const stop = afterVeil(() => intro.play());

  const opening = heading?.closest("section.opening") ?? null;
  const covers = [];
  let shade = null;
  let leaving = null;
  if (opening) {
    for (let next = opening.nextElementSibling; next; next = next.nextElementSibling) {
      next.classList.add("covers");
      covers.push(next);
    }
    shade = document.createElement("i");
    shade.className = "opening-shade";
    opening.append(shade);
    leaving = gsap.timeline({ scrollTrigger: { trigger: opening, start: "top top", end: "bottom top", pin: true, pinSpacing: false, scrub: true } })
      .to(opening.querySelector(".wrap"), { scale: 0.94, ease: "none", transformOrigin: "50% 62%" }, 0)
      .to(shade, { opacity: 0.6, ease: "none" }, 0);
  }
  return () => {
    stop();
    intro.kill();
    split?.revert();
    leaving?.scrollTrigger?.kill();
    leaving?.kill();
    shade?.remove();
    covers.forEach((el) => el.classList.remove("covers"));
    if (opening) gsap.set(opening.querySelector(".wrap"), { clearProps: "transform" });
  };
}

const two = (n) => String(n).padStart(2, "0");

// What a page brings in as it's scrolled to, the same on every page but the front one (which has its own):
// - things marked data-reveal come up into place, a group (data-reveal-group) at a time;
// - an essay's parts each get a rule that draws itself across their top, and which part of how many it is, and
//   their headings come up a line at a time out of their own lines;
// - programs, charts and the like are unveiled by a wipe from the foot, and lean to the pointer.
// Safe to run twice on the same page (as React does while it's being worked on): what it adds, it adds once.
export function revealOnScroll(scope) {
  for (const group of scope.querySelectorAll("[data-reveal-group]")) {
    const items = group.querySelectorAll("[data-reveal]");
    gsap.fromTo(items, { autoAlpha: 0, y: 36 }, {
      autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.09,
      scrollTrigger: { trigger: group, start: "top 82%" },
    });
  }

  const parts = [...scope.querySelectorAll(".essay-part")];
  parts.forEach((part, k) => {
    let rule = part.querySelector(":scope > .part-rule");
    if (!rule) {
      rule = document.createElement("i");
      rule.className = "part-rule";
      const of = document.createElement("span");
      of.className = "part-of";
      of.setAttribute("aria-hidden", "true");
      of.textContent = `${two(k + 1)} / ${two(parts.length)}`;
      part.prepend(rule, of);
    }
    gsap.timeline({ scrollTrigger: { trigger: part, start: "top 88%" } })
      .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "expo.inOut" }, 0)
      .fromTo(part.querySelector(":scope > .part-of"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, 0.5);
    const heading = part.querySelector(":scope > h2");
    if (heading && !heading.querySelector(".h-line")) {
      const lines = SplitText.create(heading, { type: "lines", mask: "lines", linesClass: "h-line" });
      gsap.from(lines.lines, { yPercent: 108, duration: 1.1, stagger: 0.08, ease: "expo.out", scrollTrigger: { trigger: part, start: "top 86%" } });
    }
  });

  for (const card of scope.querySelectorAll(".side figure, figure.program, .chart")) {
    gsap.fromTo(card, { clipPath: "inset(100% 0% 0% 0%)" }, {
      clipPath: "inset(0% 0% 0% 0%)", duration: 1.15, ease: "expo.inOut", clearProps: "clipPath",
      scrollTrigger: { trigger: card, start: "top 92%" },
    });
    if (card.dataset.leans || !matchMedia("(hover: hover) and (pointer: fine)").matches) continue;
    card.dataset.leans = "yes";
    const most = card.matches(".chart") ? 1.6 : 3;
    gsap.set(card, { transformPerspective: 900 });
    const overX = gsap.quickTo(card, "rotationX", { duration: 0.6, ease: "power3" });
    const overY = gsap.quickTo(card, "rotationY", { duration: 0.6, ease: "power3" });
    card.addEventListener("pointermove", (e) => {
      const box = card.getBoundingClientRect();
      overY(((e.clientX - box.left) / box.width - 0.5) * 2 * most);
      overX((0.5 - (e.clientY - box.top) / box.height) * 2 * most);
    });
    card.addEventListener("pointerleave", () => { overX(0); overY(0); });
  }
}

// A drawing drawn as the pen drew it (Drawing.jsx): its paths one after another, each for as long as it is, the
// whole of it starting and ending gently. Gives the tween that moves it on.
export function drawIn(svg, { duration = 2.8, delay = 0, ease = "power1.inOut" } = {}) {
  const paths = [...svg.querySelectorAll("path")];
  const total = paths.reduce((n, path) => n + Number(path.dataset.n), 0) || 1;
  const strokes = gsap.timeline({ paused: true });
  let before = 0;
  for (const path of paths) {
    const n = Number(path.dataset.n);
    strokes.to(path, { strokeDashoffset: 0, duration: Math.max(n / total, 0.0005), ease: "none" }, before / total);
    before += n;
  }
  return gsap.to(strokes, { progress: 1, duration, delay, ease, onComplete: () => svg.classList.add("drawn") });
}

export { gsap, ScrollTrigger, SplitText, MotionPathPlugin };
