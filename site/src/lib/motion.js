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
const GONE = "moth:veil-gone";
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
// Gives what undoes it.
export function entrance(heading, rest = []) {
  const intro = gsap.timeline({ paused: true });
  let split = null;
  if (heading) {
    gsap.set(heading, { autoAlpha: 1 });
    split = SplitText.create(heading, { type: "lines", mask: "lines" });
    intro.from(split.lines, { yPercent: 108, duration: 1.15, stagger: 0.09, ease: "expo.out" });
  }
  if (rest.length) intro.fromTo(rest, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08, ease: "power4.out" }, heading ? 0.25 : 0);
  const stop = afterVeil(() => intro.play());
  return () => { stop(); intro.kill(); split?.revert(); };
}

// things that come up into place as they're scrolled to, a group at a time
export function revealOnScroll(scope) {
  for (const group of scope.querySelectorAll("[data-reveal-group]")) {
    const items = group.querySelectorAll("[data-reveal]");
    gsap.fromTo(items, { autoAlpha: 0, y: 36 }, {
      autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.09,
      scrollTrigger: { trigger: group, start: "top 82%" },
    });
  }
}

export { gsap, ScrollTrigger, SplitText, MotionPathPlugin };
