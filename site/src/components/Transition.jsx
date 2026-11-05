"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { gsap, veilGone } from "@/lib/motion";
import { BASE } from "@/lib/site";
import MothMark from "./MothMark";

const STORE = "moth-veil"; // the name the veil shows, kept for the next page when the browser loads it afresh

// what the veil says on the way to a page
export function pageWord(path) {
  if (path === "/" || path === "") return "Folio";
  const names = { "/playground": "Playground", "/learn": "Learn", "/docs": "Docs", "/docs/cookbook": "Cookbook", "/docs/examples": "Examples" };
  if (names[path]) return names[path];
  if (path.startsWith("/docs/")) return `${path.slice("/docs/".length)}.moth`;
  return path.split("/").filter(Boolean).at(-1) ?? "Folio";
}

// a name as its letters, each in a span of its own, for them to move one after another
function letters(holder, word) {
  holder.replaceChildren(...[...word].map((c) => Object.assign(document.createElement("span"), { className: "ch", textContent: c === " " ? " " : c })));
  return [...holder.children];
}

// The veil between pages, and it's the next page's name that carries it. A click on a link to another page of
// the site brings an orange edge and ink up over the page, and the name's letters rise into it one after another;
// once they've all arrived (never sooner), they rise on out of it, and the ink lifts off the new page as its own
// words come up (motion.js's afterVeil). Pages the router can show come in without a reload; the front page and
// the playground are loaded afresh, the ink and the name already over them before they show (layout.jsx).
export default function Transition() {
  const router = useRouter();
  const path = usePathname();
  const veil = useRef(null);
  const state = useRef({ busy: false, waiting: null, settled: Promise.resolve() });

  const parts = () => {
    const root = veil.current;
    return { root, lamp: root.querySelector(".veil-lamp"), ink: root.querySelector(".veil-ink"), word: root.querySelector(".veil-word > span"), to: root.querySelector(".veil-to") };
  };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // up over the page: resolves once the ink covers it; state.settled, once the name has arrived as well
  const cover = (word, address) => new Promise((covered) => {
    const { root, lamp, ink, word: holder, to } = parts();
    root.style.setProperty("--veil-chars", word.length); // a long name smaller, so it fits (globals.css)
    const chars = letters(holder, word);
    to.textContent = address;
    root.classList.add("on");
    document.documentElement.classList.add("veil-up");
    if (reduced()) {
      gsap.set([lamp, ink], { yPercent: 0 });
      gsap.set(chars, { yPercent: 0 });
      gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, onComplete: covered });
      state.current.settled = Promise.resolve();
      return;
    }
    gsap.set(root, { autoAlpha: 1 });
    // The page changes, and the name counts as arrived, by the clock, not by the animation: a tab that draws no
    // frames (in the background, or busy) still gets where it's going, and the veil still goes when it's back.
    const timeline = gsap.timeline()
      .fromTo(lamp, { yPercent: 101 }, { yPercent: 0, duration: 0.62, ease: "expo.inOut" })
      .fromTo(ink, { yPercent: 101 }, { yPercent: 0, duration: 0.62, ease: "expo.inOut" }, 0.09)
      .fromTo(chars, { yPercent: 118 }, { yPercent: 0, duration: 0.85, ease: "expo.out", stagger: 0.035, overwrite: true }, 0.36)
      .fromTo(to, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, overwrite: true }, 0.45);
    const all = timeline.duration() + 0.12; // and a moment for the name to be read
    setTimeout(covered, 720);
    state.current.settled = new Promise((done) => setTimeout(() => { timeline.progress(1); done(); }, all * 1000));
  });

  // off the new page: the name rises out, a letter at a time, and the ink after it
  const reveal = async () => {
    await state.current.settled; // the name has all arrived: nothing else is moving it
    const { root, lamp, ink, word: holder, to } = parts();
    const chars = [...holder.children];
    const finish = () => {
      root.classList.remove("on");
      gsap.set([lamp, ink], { yPercent: 101 });
      state.current.busy = false;
    };
    if (reduced()) {
      veilGone();
      gsap.to(root, { autoAlpha: 0, duration: 0.2, onComplete: finish });
      return;
    }
    const timeline = gsap.timeline()
      .to(chars, { yPercent: -118, duration: 0.6, ease: "power3.in", stagger: 0.025, overwrite: true })
      .to(to, { autoAlpha: 0, duration: 0.25, overwrite: true }, 0)
      .to(ink, { yPercent: -101, duration: 0.9, ease: "expo.inOut" }, 0.3)
      .to(lamp, { yPercent: -101, duration: 0.9, ease: "expo.inOut" }, 0.4);
    setTimeout(veilGone, 420); // the page's own words start up as the ink starts to lift
    setTimeout(() => { timeline.progress(1); finish(); }, timeline.duration() * 1000 + 40);
  };

  // a page the browser loaded afresh, after a click elsewhere on the site: the ink and the name (as a CSS ::before,
  // put there before the page showed) are up already, so the same name in letters takes its place, unmoved
  useEffect(() => {
    const html = document.documentElement;
    const { root, lamp, ink, word: holder } = parts();
    const arriving = html.classList.contains("veiled");
    gsap.set([lamp, ink], { y: 0, yPercent: arriving ? 0 : 101 });
    if (!arriving) return;
    let word = "Folio";
    try {
      word = sessionStorage.getItem(STORE) || word;
      sessionStorage.removeItem(STORE);
    } catch {}
    root.style.setProperty("--veil-chars", word.length);
    gsap.set(letters(holder, word), { yPercent: 0 });
    root.classList.add("on");
    gsap.set(root, { autoAlpha: 1 });
    html.classList.remove("veiled"); // in the same moment as the letters: the ::before goes as they come
    state.current.busy = true;
    state.current.settled = Promise.resolve();
    const fonts = document.fonts?.ready ?? Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 700))]).then(() => setTimeout(reveal, 160));
  }, []);

  // back (or forward) to a page the browser kept just as it was when it was left, the veil up over it and the
  // name in it: no veil, at once
  useEffect(() => {
    const restored = (e) => {
      if (!e.persisted) return;
      const { root, lamp, ink, word: holder, to } = parts();
      gsap.killTweensOf([lamp, ink, to, ...holder.children]);
      gsap.set([lamp, ink], { yPercent: 101 });
      holder.replaceChildren();
      root.classList.remove("on");
      state.current = { busy: false, waiting: null, settled: Promise.resolve() };
      veilGone();
    };
    addEventListener("pageshow", restored);
    return () => removeEventListener("pageshow", restored);
  }, []);

  // a page the router brought: once it's there, the veil goes
  useEffect(() => {
    const waiting = state.current.waiting;
    if (!waiting || waiting !== path) return;
    state.current.waiting = null;
    setTimeout(reveal, 60); // by the clock too, for a tab that draws no frames: the new page has had its moment to show
  }, [path]);

  // every click on a link to another page of the site
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || a.dataset.noVeil !== undefined) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !(url.pathname === BASE || url.pathname.startsWith(`${BASE}/`))) return;
      const page = url.pathname.slice(BASE.length).replace(/\/$/, "") || "/";
      if (/\.(?!html$)[a-z0-9]+$/i.test(page)) return; // a file: a picture, a .moth
      const here = location.pathname.slice(BASE.length).replace(/\/$/, "") || "/";
      if (page === here) return; // this page: its own anchors, or its search
      e.preventDefault();
      if (state.current.busy) return;
      state.current.busy = true;
      try { sessionStorage.setItem("moth-curtain", "1"); } catch {} // the front page's first-visit count isn't wanted after this
      const word = pageWord(page.replace(/\.html$/, "").replace(/\/index$/, ""));
      const afresh = page === "/" || here === "/" || page === "/playground" || here === "/playground" || page.endsWith(".html");
      cover(word, url.pathname + url.hash).then(async () => {
        if (afresh) {
          await state.current.settled; // the next page shows the name as it is now: all of it, still
          try { sessionStorage.setItem(STORE, word); } catch {}
          location.assign(url.href);
          return;
        }
        state.current.waiting = page;
        if (!url.hash) window.scrollTo(0, 0); // under the veil: the next page comes in at its top
        router.push(page + url.search + url.hash, { scroll: !!url.hash });
        setTimeout(() => { // a page that never came: take the veil away anyway
          if (state.current.waiting === page) { state.current.waiting = null; reveal(); }
        }, 6000);
      });
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [router]);

  return (
    <div className="veil" ref={veil} aria-hidden="true">
      <div className="veil-lamp" />
      <div className="veil-ink">
        <div className="veil-top"><span className="veil-mark"><MothMark />Folio</span><span className="veil-to" /></div>
        <p className="veil-word"><span /></p>
      </div>
    </div>
  );
}
