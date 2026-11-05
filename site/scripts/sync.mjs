// Brings what the site shows from the rest of the repository, so there's one copy of each thing:
//
//     node scripts/sync.mjs        (npm run dev and npm run build run it first)
//
// - public/: Moth's engine (the modules the playground's worker runs, moth.wasm, the libraries a program may
//   `use`), the pictures, and playground.js: the playground's own script, as index.html has it, word for word.
//   The new playground page has every element it works with, by the same ids, so it drives the page unchanged.
// - src/generated/: the lessons (learn-lessons.js), the examples (examples.js), and pages.json: the reference,
//   cookbook and examples pages make-docs.mjs and make-guides.mjs made, cut into their parts, with their links
//   pointed at the site's new addresses.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(SITE, "..");
const PUBLIC = join(SITE, "public");
const GENERATED = join(SITE, "src", "generated");
export const BASE = process.env.MOTH_BASE_PATH ?? "/moth";

const read = (file) => readFileSync(join(ROOT, file), "utf8");
const copy = (from, to = from) => {
  mkdirSync(dirname(join(PUBLIC, to)), { recursive: true });
  copyFileSync(join(ROOT, from), join(PUBLIC, to));
};

// ---------- the engine ----------

// what index.html's script and its worker import (make-web.mjs keeps the list), and what they fetch
const MODULES = ["vm.js", "pictures.js", "scope.js", "jit.js", "wasm-binary.js", "wasm-runtime.js", "wasm.js", "checker.js", "moth.js", "examples.js", "worker.js"];
const makeWeb = read("make-web.mjs");
for (const file of MODULES) if (!makeWeb.includes(`"${file}"`)) throw new Error(`sync.mjs: make-web.mjs no longer lists ${file}`);
// the Moth files a program may `use` beside the page (the examples' own), and Moth's compiler written in Moth,
// for the Compiled view; not the compilers for machine code and WebAssembly, nor the bundled library
const NOT_FOR_THE_PAGE = new Set(["machine.moth", "moth.moth", "stdlib.moth", "webpage.moth", "wasm.moth", "wasm-runtime.moth", "moth-wasm.moth"]);

export function syncEngine() {
  for (const file of MODULES) copy(file);
  copy("moth.wasm");
  for (const file of readdirSync(ROOT)) if (file.endsWith(".moth") && !NOT_FOR_THE_PAGE.has(file)) copy(file);
  for (const file of readdirSync(join(ROOT, "tools"))) if (file.endsWith(".moth") && !file.endsWith(".test.moth")) copy(`tools/${file}`);
  for (const file of readdirSync(join(ROOT, "docs"))) if (file.endsWith(".svg")) copy(`docs/${file}`);
  for (const file of readdirSync(join(ROOT, "apps"))) if (file.endsWith(".moth")) copy(`apps/${file}`); // the playground's two apps
}

// The front page's gallery, as the old one had it: each program's name, what it is, its picture, and its code
// (from examples.js, or the file the playground loads it from), for a link that opens it in the playground
export async function gallery() {
  const { default: examples } = await import(new URL(`file:///${join(ROOT, "examples.js").replace(/\\/g, "/")}`).href);
  const fromFile = { "Snake": "apps/snake.moth", "Paint": "apps/paint.moth", "Neural network": "neural.moth", "Handwriting": "handwriting.moth" };
  return [
    ["Snake", "A game: arrow keys and a timer", "snake.svg"],
    ["Paint", "Drag to draw, click a colour", "paint.svg"],
    ["Spiral", "The turtle, in colour", "spiral.svg"],
    ["Tree", "A function that calls itself", "tree.svg"],
    ["Neural network", "Learns, in Moth", "neural.svg"],
    ["Handwriting", "Reads the digit you draw", "handwriting.svg"],
  ].map(([name, about, picture]) => ({ name, about, picture, code: fromFile[name] ? read(fromFile[name]).trimEnd() : examples[name] }));
}

// ---------- the playground's script ----------

// index.html's module script, the playground's whole behaviour; and every id it looks up, which the new page
// must have (a test holds it to that)
export function playgroundScript() {
  const html = read("index.html");
  const start = html.indexOf('<script type="module">');
  const end = html.indexOf("</script>", start);
  if (start < 0 || end < 0) throw new Error("sync.mjs: index.html has no module script");
  return html.slice(start + '<script type="module">'.length, end);
}

export function idsUsed(script) {
  const ids = new Set();
  for (const [, id] of script.matchAll(/\$\("([\w-]+)"\)/g)) ids.add(id);
  const [, list] = /const \[code, output, picker, stopButton, status\] = \[([^\]]+)\]/.exec(script) ?? [];
  if (!list) throw new Error("sync.mjs: the playground script's first elements moved");
  for (const [, id] of list.matchAll(/"([\w-]+)"/g)) ids.add(id);
  return [...ids].sort();
}

// ---------- the reference, the cookbook and the examples ----------

// The page each generated file was at, on the old site, and where it is now
const OLD = "https://site.invalid/moth/";
function newAddress(href, from) {
  if (/^(https?:|mailto:|#|javascript:)/.test(href) && !href.startsWith(OLD)) return href;
  const url = new URL(href, from);
  if (!url.href.startsWith(OLD)) return href;
  let path = url.pathname.slice("/moth/".length);
  let hash = url.hash;
  if (path === "" || path === "index.html") {
    if (hash === "#playground") return `${BASE}/playground`;
    if (hash.startsWith("#code=")) return `${BASE}/playground${hash}`;
    return `${BASE}/${hash}`;
  }
  if (path === "learn.html") return `${BASE}/learn${hash}`;
  path = path.replace(/index\.html$/, "").replace(/\/$/, "").replace(/\.html$/, "");
  if (/\.(svg|png|jpg|moth|json)$/.test(path)) return `${BASE}/${path}`;
  return `${BASE}/${path}${url.search}${hash}`;
}

function relink(html, from) {
  return html.replace(/(href|src)="([^"]*)"/g, (_, attribute, href) => `${attribute}="${newAddress(href.replace(/&amp;/g, "&"), from).replace(/&/g, "&amp;")}"`);
}

const between = (text, from, to, label) => {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`sync.mjs: ${label} has no ${JSON.stringify(from)} ... ${JSON.stringify(to)}`);
  return text.slice(a + from.length, b);
};

export function pageParts(file) {
  const html = read(file);
  const from = OLD + file;
  const title = between(html, "<title>", "</title>", file).replace(/&amp;/g, "&");
  const description = between(html, '<meta name="description" content="', '"', file).replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const hero = relink(between(html, '<div class="hero wrap">', "\n    </div>\n  </header>", file), from);
  const body = relink(between(html, "</header>", "<footer", file), from);
  let script = html.slice(html.indexOf("</footer>") + "</footer>".length, html.lastIndexOf("</body>")).trim();
  script = script.replace(/^<script>/, "").replace(/<\/script>$/, "");
  // the search's links, written as a template in the script: to a library's page, at a function
  script = script.replace(/href="\$\{library\}\.html#/g, `href="${BASE}/docs/\${library}#`);
  return { title, description, hero, body, script };
}

export function docsPages() {
  const pages = {};
  for (const file of readdirSync(join(ROOT, "docs"))) {
    if (!file.endsWith(".html")) continue;
    const slug = file === "index.html" ? "" : file.replace(/\.html$/, "");
    pages[slug] = pageParts(`docs/${file}`);
  }
  if (existsSync(join(ROOT, "docs", "cookbook", "index.html"))) pages.cookbook = pageParts("docs/cookbook/index.html");
  return pages;
}

// how many libraries and functions the reference has, for the front page
export function libraryCounts(pages) {
  const libraries = Object.keys(pages).filter((slug) => slug && slug !== "cookbook" && slug !== "examples").length;
  const functions = Object.entries(pages).filter(([slug]) => slug && slug !== "cookbook" && slug !== "examples")
    .reduce((n, [, page]) => n + (page.body.match(/<section class="fn" id=/g) ?? []).length, 0);
  return { libraries, functions };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  syncEngine();
  const script = playgroundScript();
  writeFileSync(join(PUBLIC, "playground.js"), script);
  mkdirSync(GENERATED, { recursive: true });
  const pages = docsPages();
  writeFileSync(join(GENERATED, "pages.json"), JSON.stringify(pages));
  writeFileSync(join(GENERATED, "site.json"), JSON.stringify({ ...libraryCounts(pages), playgroundIds: idsUsed(script), gallery: await gallery() }));
  copyFileSync(join(ROOT, "learn-lessons.js"), join(GENERATED, "learn-lessons.js"));
  copyFileSync(join(ROOT, "examples.js"), join(GENERATED, "examples.js"));
  console.log(`synced: the engine, playground.js (${idsUsed(script).length} ids), ${Object.keys(pages).length} docs pages`);
}
