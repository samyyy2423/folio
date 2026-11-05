"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import MothMark from "./MothMark";
import { BASE, GITHUB, PAGES } from "@/lib/site";

// The bar at the top of every page: clear over the first screen, frosted once the page scrolls, out of the way
// while it's scrolling down and back when it scrolls up; on a narrow screen, a menu
export default function TopBar() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    const look = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      setHidden(y > 240 && y > last.current);
      last.current = y;
    };
    look();
    addEventListener("scroll", look, { passive: true });
    return () => removeEventListener("scroll", look);
  }, []);
  useEffect(() => setOpen(false), [path]);
  const current = (href) => (href === "/docs" ? path === "/docs" || (path.startsWith("/docs/") && !["/docs/cookbook", "/docs/examples"].includes(path)) : path === href);
  return (
    <header className={`topbar${scrolled ? " scrolled" : ""}${hidden && !open ? " hidden" : ""}`}>
      <div className="wrap">
        <a className="brand" href={`${BASE}/`}><MothMark />Moth<sup>®</sup></a>
        <nav className={open ? "open" : ""} aria-label="Moth">
          {PAGES.map(({ name, href, full }) => full
            ? <a key={name} href={`${BASE}${href}`} aria-current={current(href) ? "page" : undefined}>{name}</a>
            : <Link key={name} href={href} aria-current={current(href) ? "page" : undefined}>{name}</Link>)}
          <a className="btn small gh" href={GITHUB} data-cursor="Star"><span>GitHub</span></a>
        </nav>
        <button className="menu-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button>
      </div>
    </header>
  );
}
