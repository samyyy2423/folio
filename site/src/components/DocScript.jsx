"use client";
import { useEffect } from "react";
import { gsap, motionReady, revealOnScroll, entrance, afterVeil } from "@/lib/motion";

// A docs page's own script (its search, or its list's filter), run once the page is there; and its parts brought in
export default function DocScript({ code }) {
  useEffect(() => {
    if (code) new Function(code)(); // the page's own script, as make-docs.mjs wrote it
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      motionReady();
      const hero = document.querySelector(".doc-hero .wrap");
      const heading = hero?.querySelector("h1") ?? null;
      const undo = entrance(heading, hero ? [...hero.children].filter((el) => el !== heading) : []);
      const cards = gsap.fromTo(document.querySelectorAll(".doc .card, .doc .fn"), { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.02, ease: "power3.out", clearProps: "transform", paused: true, delay: 0.3 });
      const stop = afterVeil(() => cards.play());
      revealOnScroll(document.querySelector(".doc"));
      return () => { undo(); stop(); };
    });
    media.add("(prefers-reduced-motion: reduce)", () => motionReady());
    return () => media.revert();
  }, [code]);
  return null;
}
