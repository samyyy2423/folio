// Makes moth.wasm (DESIGN §144): Moth's compiler as a WebAssembly module of its own, made by itself.
//
//     node make-moth-wasm.mjs
//
// wasm.js makes moth-wasm.moth into a module first; that module, run, makes moth-wasm.moth into a module again,
// which is moth.wasm; and moth.wasm, run, must make moth-wasm.moth into its own bytes, or nothing is written.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { compileToWasmBytes, mothWasmCompiler } from "./moth.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

// the files moth-wasm.moth uses, by name
export const MOTH_WASM_FILES = ["compiler.moth", "wasm.moth", "wasm-runtime.moth"];

// a module wasm.js made, with what running it needs in its section "moth", as moth build --target wasm writes it
function withDetails(made) {
  const details = JSON.stringify({ ats: made.ats.map((at) => [at.line, at.col, at.file ?? ""]), names: made.names, kinds: made.kinds });
  const payload = [...new TextEncoder().encode("moth")];
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

export function makeMothWasm() {
  const source = here("moth-wasm.moth");
  const files = Object.fromEntries(MOTH_WASM_FILES.map((name) => [name, here(name)]));
  const first = withDetails(compileToWasmBytes(source, { files: (name) => files[name], file: "moth-wasm.moth" }));
  const made = mothWasmCompiler(first)(source, files);
  const again = mothWasmCompiler(made.whole)(source, files);
  if (Buffer.compare(Buffer.from(made.whole), Buffer.from(again.whole)) !== 0) throw new Error("moth.wasm doesn't make itself again: it isn't written");
  return made.whole;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bytes = makeMothWasm();
  writeFileSync(new URL("./moth.wasm", import.meta.url), bytes);
  console.log(`made moth.wasm: ${bytes.length.toLocaleString("en")} bytes, which makes itself again`);
}
