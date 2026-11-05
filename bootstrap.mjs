// Makes the first folio.exe (folio on Linux) from the source, with Node.js and the JavaScript engine, for when
// there is no folio yet to build folio with (the releases have one too):
//
//     node bootstrap.mjs [windows|linux]
//
// It makes the same bytes folio makes of itself, so after this folio builds folio:
//
//     folio build folio.folio --allow-read --allow-write --allow-run --include folio-debugger.folio --include package.json
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { machineCompiler } from "./folio.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
const target = process.argv[2] ?? (process.platform === "win32" ? "windows" : "linux");
if (target !== "windows" && target !== "linux") throw new Error("usage: node bootstrap.mjs [windows|linux]");
const machine = machineCompiler(here("machine.folio"), here("compiler.folio"));
const files = { "machine.folio": here("machine.folio"), "compiler.folio": here("compiler.folio"), "wasm.folio": here("wasm.folio"), "wasm-runtime.folio": here("wasm-runtime.folio"), "stdlib.folio": here("stdlib.folio"), "webpage.folio": here("webpage.folio"), "checker-rules.folio": here("checker-rules.folio"), "tools/hash.folio": here("tools/hash.folio"), "folio-coverage.folio": here("folio-coverage.folio") };
// folio debug builds the debugger into the programs it debugs, so folio carries it, as a file built into it
// The release manifest travels with folio, so its version never depends on the current folder.
const include = Object.fromEntries(["folio-debugger.folio", "package.json"].map((file) => [file, readFileSync(new URL(`./${file}`, import.meta.url))]));
const bytes = machine(here("folio.folio"), { files, target, name: "folio.folio", allow: ["--allow-read", "--allow-write", "--allow-run"], include });
const out = new URL(target === "windows" ? "./folio.exe" : "./folio", import.meta.url);
writeFileSync(out, bytes);
if (target === "linux") chmodSync(out, 0o755);
console.log(`made ${target === "windows" ? "folio.exe" : "folio"} for ${target === "windows" ? "Windows" : "Linux"} (${bytes.length.toLocaleString("en")} bytes)`);
