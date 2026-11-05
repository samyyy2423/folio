// Makes folio.wasm (DESIGN §144): Folio's compiler as a WebAssembly module of its own, made by itself.
//
//     node make-folio-wasm.mjs
//
// wasm.js makes folio-wasm.folio into a module first; that module, run, makes folio-wasm.folio into a module again,
// which is folio.wasm; and folio.wasm, run, must make folio-wasm.folio into its own bytes, or nothing is written.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { compileToWasmBytes, folioWasmCompiler } from "./folio.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

// the files folio-wasm.folio uses, by name
export const FOLIO_WASM_FILES = ["compiler.folio", "wasm.folio", "wasm-runtime.folio"];

// a module wasm.js made, with what running it needs in its section "folio", as folio build --target wasm writes it
function withDetails(made) {
  const details = JSON.stringify({ ats: made.ats.map((at) => [at.line, at.col, at.file ?? ""]), names: made.names, kinds: made.kinds });
  const payload = [...new TextEncoder().encode("folio")];
  const named = [payload.length, ...payload, ...new TextEncoder().encode(details)];
  const size = [];
  for (let n = named.length; ; ) {
    const low = n & 127;
    n = Math.floor(n / 128);
    size.push(n ? low | 128 : low);
    if (!n) break;
  }
  return Uint8Array.from([...made.bytes, 0, ...size, ...named]);
}

export function makeFolioWasm() {
  const source = here("folio-wasm.folio");
  const files = Object.fromEntries(FOLIO_WASM_FILES.map((name) => [name, here(name)]));
  const first = withDetails(compileToWasmBytes(source, { files: (name) => files[name], file: "folio-wasm.folio" }));
  const made = folioWasmCompiler(first)(source, files);
  const again = folioWasmCompiler(made.whole)(source, files);
  if (Buffer.compare(Buffer.from(made.whole), Buffer.from(again.whole)) !== 0) throw new Error("folio.wasm doesn't make itself again: it isn't written");
  return made.whole;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bytes = makeFolioWasm();
  writeFileSync(new URL("./folio.wasm", import.meta.url), bytes);
  console.log(`made folio.wasm: ${bytes.length.toLocaleString("en")} bytes, which makes itself again`);
}
