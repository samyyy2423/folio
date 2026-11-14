"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/motion";

// How far down the page it is, as an orange line across the very top, on every page but the playground (which
// doesn't scroll as a page does). It follows the scroll a moment behind.
export default function ScrollLine() {
  const path = usePathname();
  const bar = useRef(null);
  useEffect(() => {
    if (path.startsWith("/playground")) return;
    const along = gsap.fromTo(bar.current, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
    return () => {
      along.scrollTrigger?.kill();
      along.kill();
      gsap.set(bar.current, { scaleX: 0 });
    };
  }, [path]);
  return <div className="scroll-line" aria-hidden="true"><i ref={bar} /></div>;
}
