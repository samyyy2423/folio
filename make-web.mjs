// Makes webpage.folio, the page `folio build --web` writes a program into: the playground (index.html) with
// Folio's engine in it, so the page needs nothing else, from a file or from any site:
//
//     node make-web.mjs
//
// Each of the engine's modules is in the page as text, and made a module from a blob: URL when it's first
// imported, its own imports pointing at the others' (folioModule, below). folio.test.js says when webpage.folio
// is behind the files it's made from.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// what the page and its worker import, and what those import
export const MODULES = ["vm.js", "pictures.js", "scope.js", "jit.js", "wasm-binary.js", "wasm-runtime.js", "wasm.js", "checker.js", "folio.js", "examples.js", "worker.js"];
export const PLACE = "/*FOLIO_APP*/null"; // where folio puts the program, its name and the files it uses, as JSON

// text that's safe inside a <script>: no "</script" or "<!--" in it
const scripted = (text) => text.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

// the page, with the modules in it
export function webpage(read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8")) {
  // without the site's own parts, marked "site only": its motion, which loads GSAP from the web, and which a
  // program's page, needing nothing else, goes without
  let html = read("index.html").replace(/\n[ \t]*<!-- site only[^]*?<!-- \/site only -->/g, "");
  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`index.html has no ${from}`);
    html = html.replace(from, () => to); // a function, so a $ in `to` is itself
  };
  const imports = /import \{([^}]*)\} from "\.\/folio\.js";/.exec(html);
  if (!imports) throw new Error("index.html doesn't import folio.js as make-web.mjs expects");
  swap(imports[0], `const {${imports[1]}} = await import(folioModule("folio.js"));`);
  swap('import examples from "./examples.js";', 'const examples = (await import(folioModule("examples.js"))).default;');
  swap('new Worker("./worker.js", { type: "module" })', 'new Worker(folioModule("worker.js"), { type: "module" })');
  swap('<link rel="icon" href="docs/folio.svg" type="image/svg+xml">',
    `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(read("docs/folio.svg")).toString("base64")}" type="image/svg+xml">`);
  const sources = Object.fromEntries(MODULES.map((name) => [name, read(name)]));
  const loader = [
    "  <script>",
    `    window.FOLIO_APP = ${PLACE};`,
    `    const folioSources = ${scripted(JSON.stringify(sources))};`,
    "    const folioUrls = {};",
    "    // a module of the engine's, made from its text the first time it's asked for, its imports made so too",
    "    function folioModule(name) {",
    "      if (!folioUrls[name]) {",
    "        const text = folioSources[name].replace(/from \"\\.\\/([\\w.-]+\\.js)\"/g, (_, used) => `from \"${folioModule(used)}\"`);",
    "        folioUrls[name] = URL.createObjectURL(new Blob([text], { type: \"text/javascript\" }));",
    "      }",
    "      return folioUrls[name];",
    "    }",
    "  </script>",
  ].join("\n");
  swap("  <script type=\"module\">", `${loader}\n  <script type="module">`);
  if (html.split(PLACE).length !== 2) throw new Error(`the page must have ${PLACE} once`);
  return html;
}

// the page as a Folio text, for folio.folio: \ " and { escaped, line ends and tabs as \n and \t
const literal = (text) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\{/g, "\\{").replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r")}"`;

export function webpageFolio(read) {
  const html = webpage(read);
  if (/[\r\0-\x08\x0b-\x1f]/.test(html)) throw new Error("the page has a control character Folio text can't hold");
  return [
    "# The page `folio build --web` writes a program into: the playground, with Folio's engine in it, in app mode",
    "# (see index.html). Made by make-web.mjs from index.html and the engine's modules: change those, then run",
    "# it again.",
    "",
    `set page_place to "${PLACE}" # where the program goes, as JSON`,
    "",
    "to page_text",
    `    return ${literal(html)}`,
    "end",
    "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const made = webpageFolio();
  writeFileSync(new URL("./webpage.folio", import.meta.url), made);
  console.log(`made webpage.folio: ${made.length.toLocaleString("en")} bytes`);
}
