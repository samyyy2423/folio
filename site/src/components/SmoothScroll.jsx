"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/motion";

// The wheel, eased, on every page but the front one (which has ScrollSmoother) and the playground (whose panes scroll
// themselves): a turn of the wheel says where the page should get to, and each frame it goes part of the way
// there. The page still scrolls as pages do, so what sticks stays stuck, links to a place on the page work, and
// keys and the scroll bar are left alone: either stops the easing where it is. Not on a touch screen, which is
// smooth already, nor with motion turned down.
export default function SmoothScroll() {
  const path = usePathname();
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(pointer: coarse)").matches) return;
    if (document.getElementById("smooth-wrapper") || path.startsWith("/playground")) return;
    let target = scrollY;
    let current = scrollY;
    let moving = false;
    const most = () => document.documentElement.scrollHeight - innerHeight;
    // something under the pointer that can still scroll that way itself (a long list, a box of code) keeps the wheel
    const scrollsItself = (el, dy) => {
      for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        if (el.scrollHeight <= el.clientHeight + 1) continue;
        if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
        if ((dy < 0 && el.scrollTop > 0) || (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true;
      }
      return false;
    };
    const stop = () => {
      if (!moving) return;
      moving = false;
      gsap.ticker.remove(step);
    };
    function step(time, delta) {
      current += (target - current) * (1 - Math.exp(-Math.min(delta, 50) / 120)); // the same pace at any frame rate
      if (Math.abs(target - current) < 0.4) {
        current = target;
        stop();
      }
      scrollTo(0, current);
    }
    const wheel = (e) => {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY) || scrollsItself(e.target, e.deltaY)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
      if (!moving) target = current = scrollY;
      target = Math.max(0, Math.min(most(), target + dy));
      if (!moving) {
        moving = true;
        gsap.ticker.add(step);
      }
    };
    const key = (e) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) stop(); };
    addEventListener("wheel", wheel, { passive: false });
    addEventListener("keydown", key);
    addEventListener("pointerdown", stop);
    return () => {
      stop();
      removeEventListener("wheel", wheel);
      removeEventListener("keydown", key);
      removeEventListener("pointerdown", stop);
    };
  }, [path]);
  return null;
}
