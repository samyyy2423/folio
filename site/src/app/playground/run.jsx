"use client";
import { useEffect } from "react";
import { BASE } from "@/lib/site";

// The playground's own script, once the page's elements are there: a module, so it imports the engine from beside
// it (/folio/folio.js...), and runs once for the page (it's loaded as a page of its own, not by client navigation)
export default function RunPlayground() {
  useEffect(() => {
    if (document.querySelector("script[data-playground]")) return;
    const script = Object.assign(document.createElement("script"), { type: "module", src: `${BASE}/playground.js` });
    script.dataset.playground = "";
    document.body.append(script);
  }, []);
  return null;
}
