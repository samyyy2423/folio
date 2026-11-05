import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";
import Cursor from "@/components/Cursor";
import Transition from "@/components/Transition";
import { BASE } from "@/lib/site";

export const metadata = {
  title: "Folio · a programming language that reads like English",
  description: "Folio is a programming language with no symbols to learn. Write programs in plain words, run them in your browser, and build them into programs of their own for Windows and Linux.",
  icons: { icon: `${BASE}/docs/moth.svg` },
};

export const viewport = { themeColor: "#eeeae2" };

// Before the page shows: old links (the playground was at /moth/#playground, a shared program at /moth/#code=...)
// go to the playground's own page; the veil between pages stays up over a page loaded after a click on another
// (Transition.jsx takes it away); and what the page's motion brings in starts out of sight, unless motion is turned
// down, or the motion hasn't started within 3 seconds, when everything is simply shown.
const BEFORE = `(function () {
  var base = ${JSON.stringify(BASE)}, path = location.pathname.replace(/\\/$/, ""), hash = location.hash;
  if ((path === base || path === base + "/index.html") && (hash === "#playground" || hash.indexOf("#code=") === 0)) {
    location.replace(base + "/playground" + (hash === "#playground" ? "" : hash));
    return;
  }
  var root = document.documentElement;
  try {
    var word = sessionStorage.getItem("moth-veil");
    if (word !== null) {
      root.classList.add("veiled", "veil-up");
      root.style.setProperty("--veil-word", JSON.stringify(word));
      root.style.setProperty("--veil-chars", word.length);
    }
  } catch (e) {}
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("js");
  setTimeout(function () { if (!root.classList.contains("motion-ready")) root.classList.add("reveal-all"); }, 3000);
})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BEFORE }} />
      </head>
      <body>
        {children}
        <Transition />
        <Cursor />
      </body>
    </html>
  );
}
