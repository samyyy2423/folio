"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import MothMark from "./MothMark";
import { gsap } from "@/lib/motion";
import { BASE, GITHUB, PAGES, RELEASES } from "@/lib/site";

export const GitHubIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const current = (path, href) => (href === "/docs" ? path === "/docs" || (path.startsWith("/docs/") && !["/docs/cookbook", "/docs/examples"].includes(path)) : path === href);

// The bar at the top of every page. Over the first screen it runs the page's whole width, clear; once the page
// scrolls it gathers into an ink dock in the middle. Its lamp, an orange pill, rests on the page you're on and
// flies to whichever link you point at. On a narrow screen, a menu that fills the screen.
export default function TopBar() {
  const path = usePathname();
  const [docked, setDocked] = useState(false);
  const [open, setOpen] = useState(false);
  const links = useRef(null);
  const lamp = useRef(null);

  useEffect(() => {
    const look = () => setDocked(window.scrollY > 40);
    look();
    addEventListener("scroll", look, { passive: true });
    return () => removeEventListener("scroll", look);
  }, []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => { document.documentElement.style.overflow = ""; };
  }, [open]);

  // the lamp: where it rests, and where it goes
  useEffect(() => {
    const nav = links.current;
    const light = lamp.current;
    if (!nav || !light) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anchors = [...nav.querySelectorAll("a")];
    const resting = anchors.find((a) => a.getAttribute("aria-current") === "page");
    const go = (a, show = true) => {
      anchors.forEach((x) => x.classList.toggle("lit", x === a && show));
      if (!a) return gsap.to(light, { opacity: 0, scale: 0.6, duration: reduced ? 0 : 0.3, ease: "power2.out" });
      gsap.to(light, { x: a.offsetLeft, width: a.offsetWidth, opacity: show ? 1 : 0, scale: 1, duration: reduced ? 0 : 0.55, ease: "expo.out" });
    };
    gsap.set(light, resting ? { x: resting.offsetLeft, width: resting.offsetWidth, opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 });
    resting?.classList.add("lit");
    const enter = (e) => go(e.currentTarget);
    const leave = () => go(resting ?? null);
    anchors.forEach((a) => { a.addEventListener("pointerenter", enter); a.addEventListener("focus", enter); a.addEventListener("blur", leave); });
    nav.addEventListener("pointerleave", leave);
    const settle = () => resting && gsap.set(light, { x: resting.offsetLeft, width: resting.offsetWidth });
    document.fonts?.ready.then(settle);
    addEventListener("resize", settle);
    return () => {
      anchors.forEach((a) => { a.removeEventListener("pointerenter", enter); a.removeEventListener("focus", enter); a.removeEventListener("blur", leave); a.classList.remove("lit"); });
      nav.removeEventListener("pointerleave", leave);
      removeEventListener("resize", settle);
    };
  }, [path]);

  const link = ({ name, href, full }, extra = {}) => full
    ? <a key={name} href={`${BASE}${href}`} aria-current={current(path, href) ? "page" : undefined} {...extra}>{extra.children ?? name}</a>
    : <Link key={name} href={href} aria-current={current(path, href) ? "page" : undefined} {...extra}>{extra.children ?? name}</Link>;

  return (
    <>
      <header className={`topbar${docked ? " docked" : ""}${open ? " menu-open" : ""}`}>
        <div className="bar">
          <a className="brand" href={`${BASE}/`}><MothMark />Folio<sup>®</sup></a>
          <nav className="links" ref={links} aria-label="Folio">
            <span className="lamp" ref={lamp} aria-hidden="true" />
            {PAGES.map((page) => link(page))}
          </nav>
          <div className="ends">
            <a className="gh" href={GITHUB} aria-label="Folio on GitHub" data-cursor="Star"><GitHubIcon /></a>
            <a className="get" href={RELEASES} data-cursor="Get it">Get Folio</a>
            <button className="menu-button" type="button" aria-expanded={open} aria-controls="menu" onClick={() => setOpen(!open)}><i />{open ? "Close" : "Menu"}</button>
          </div>
        </div>
      </header>
      <div className={`menu${open ? " open" : ""}`} id="menu" aria-hidden={!open}>
        <ol>
          {[{ name: "Home", href: "/", full: true }, ...PAGES].map((page, i) => (
            <li key={page.name} style={{ "--i": i }}>
              {page.href === "/"
                ? <a href={`${BASE}/`} tabIndex={open ? 0 : -1}><span className="n">{String(i + 1).padStart(2, "0")}</span><span className="t">{page.name}</span></a>
                : link(page, { tabIndex: open ? 0 : -1, children: <><span className="n">{String(i + 1).padStart(2, "0")}</span><span className="t">{page.name}</span></> })}
            </li>
          ))}
        </ol>
        <div className="menu-foot"><a href={GITHUB} tabIndex={open ? 0 : -1}>GitHub</a><a href={RELEASES} tabIndex={open ? 0 : -1}>Releases</a></div>
      </div>
    </>
  );
}
