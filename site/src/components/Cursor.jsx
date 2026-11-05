"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/motion";

// A lamp-coloured dot that follows the pointer, a little behind; over a link or anything with data-cursor it
// grows and says what a click does. Not in the playground, where the pointer edits code.
export default function Cursor() {
  const dot = useRef(null);
  const path = usePathname();
  const off = path === "/playground";
  useEffect(() => {
    if (off || matchMedia("(hover: none), (pointer: coarse)").matches) return;
    const el = dot.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const x = gsap.quickTo(el, "x", { duration: reduced ? 0 : 0.45, ease: "power3" });
    const y = gsap.quickTo(el, "y", { duration: reduced ? 0 : 0.45, ease: "power3" });
    const label = el.querySelector("b");
    const move = (e) => {
      x(e.clientX);
      y(e.clientY);
      const over = e.target.closest?.("[data-cursor], a, button");
      el.classList.toggle("big", !!over?.dataset?.cursor);
      label.textContent = over?.dataset?.cursor ?? "";
      el.style.opacity = over && !over.dataset?.cursor ? "0.55" : "1";
    };
    const leave = () => { el.style.opacity = "0"; };
    addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    return () => { removeEventListener("pointermove", move); document.removeEventListener("pointerleave", leave); };
  }, [off]);
  if (off) return null;
  return <div className="cursor" ref={dot} aria-hidden="true" style={{ opacity: 0 }}><b /></div>;
}
