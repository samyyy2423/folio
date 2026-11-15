"use client";
import { useEffect, useRef } from "react";
import { BASE } from "@/lib/site";
import { gsap, ScrollTrigger, afterVeil, drawIn } from "@/lib/motion";

// One of the site's drawings (scripts/art.mjs: each made by a short Folio program), drawn as the pen drew it: its
// picture is fetched, and its paths drawn one after another, when the page comes up (`when="enter"`) or when it's
// scrolled to, or only when it's asked for (`when="asked"`: a "redraw" event on its box, which draws any of them
// again). With `spin`, it turns slowly as the page is scrolled; inside something marked data-redraw, it's drawn
// again when that's pointed at. With motion turned down it's simply there.
export default function Drawing({ name, className = "", when = "scroll", duration = 2.8, delay = 0, spin = 0 }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    let alive = true;
    const undo = [];
    fetch(`${BASE}/art/${name}.svg`).then((answer) => (answer.ok ? answer.text() : "")).then((picture) => {
      if (!alive || !picture) return;
      el.innerHTML = picture;
      const svg = el.firstElementChild;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void svg.classList.add("drawn");
      let pen = null;
      const draw = (seconds = duration, wait = delay) => {
        pen?.kill();
        gsap.set(svg.querySelectorAll("path"), { clearProps: "strokeDashoffset" });
        pen = drawIn(svg, { duration: seconds, delay: wait });
      };
      if (when === "enter") undo.push(afterVeil(() => draw()));
      else if (when !== "asked") {
        const seen = ScrollTrigger.create({ trigger: el, start: "top 84%", once: true, onEnter: () => draw() });
        undo.push(() => seen.kill());
      }
      const asked = () => draw(duration, 0);
      el.addEventListener("redraw", asked);
      undo.push(() => el.removeEventListener("redraw", asked));
      const again = el.closest("[data-redraw]");
      if (again) {
        const redraw = () => { if (!pen || !pen.isActive()) draw(Math.min(duration, 1.8), 0); };
        again.addEventListener("pointerenter", redraw);
        undo.push(() => again.removeEventListener("pointerenter", redraw));
      }
      if (spin) {
        const turning = gsap.to(svg, { rotation: spin, ease: "none", scrollTrigger: { trigger: el.closest("section") ?? el, start: "top bottom", end: "bottom top", scrub: 1 } });
        undo.push(() => { turning.scrollTrigger?.kill(); turning.kill(); });
      }
      undo.push(() => pen?.kill());
    }).catch(() => {});
    return () => { alive = false; undo.forEach((f) => f()); };
  }, [name, when, duration, delay, spin]);
  return <span className={`drawing-box ${className}`} ref={box} aria-hidden="true" />;
}
