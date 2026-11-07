// Writes wasm-runtime.folio, the part of the WebAssembly runtime that wasm-runtime.js holds, as wasm.folio reads it:
// the same cleaned text wasm.js assembles, so the two back ends make the same bytes.
//
//     node make-wasm-runtime.mjs
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { RUNTIME } from "./wasm-runtime.js";

// text as a Folio literal: \ " and { escaped, line ends as \n
const literal = (text) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\{/g, "\\{").replace(/\n/g, "\\n")}"`;

export function wasmRuntimeFolio() {
  const out = [
    "# Made by make-wasm-runtime.mjs from wasm-runtime.js: the part of the WebAssembly runtime written once, as text",
    "# both back ends assemble (see wasm_shared_declare in wasm.folio). Don't change it by hand: change wasm-runtime.js,",
    "# then run node make-wasm-runtime.mjs.",
    "",
    "to wasm_runtime_source",
    '    set made to ""',
  ];
  // the source in pieces of a hundred or so characters, each ending before a space, so no line here is long
  const pieces = [];
  let piece = "";
  for (const word of RUNTIME.split(/(?=[ \n])/)) {
    if (piece.length + word.length > 100 && piece) {
      pieces.push(piece);
      piece = "";
    }
    piece += word;
  }
  pieces.push(piece);
  for (const p of pieces) out.push(`    set made to made + ${literal(p)}`);
  out.push("    return made", "end", "");
  return out.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(new URL("./wasm-runtime.folio", import.meta.url), wasmRuntimeFolio());
  console.log("wrote wasm-runtime.folio");
}
