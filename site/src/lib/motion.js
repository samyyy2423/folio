"use client";
// GSAP, with the plugins the site uses, registered once, in the browser
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, SplitText, MotionPathPlugin);

// the motion has started: what it brings in no longer needs the 3-second fallback (see layout.jsx)
export const motionReady = () => document.documentElement.classList.add("motion-ready");

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
