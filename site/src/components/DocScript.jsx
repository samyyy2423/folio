"use client";
import { useEffect } from "react";
import { gsap, motionReady, revealOnScroll } from "@/lib/motion";

// A docs page's own script (its search, or its list's filter), run once the page is there; and its parts brought in
export default function DocScript({ code }) {
  useEffect(() => {
    if (code) new Function(code)(); // the page's own script, as make-docs.mjs wrote it
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".doc-hero .wrap > *", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08, ease: "power4.out" });
      const cards = document.querySelectorAll(".doc .card, .doc .fn");
      gsap.fromTo(cards, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.02, ease: "power3.out", clearProps: "transform" });
      revealOnScroll(document.querySelector(".doc"));
      motionReady();
    });
    media.add("(prefers-reduced-motion: reduce)", () => motionReady());
    return () => media.revert();
  }, [code]);
  return null;
}
