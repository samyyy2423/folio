// folio.wasm (DESIGN §144): Folio's compiler as a WebAssembly module of its own, made by itself, which compiles
// every program to the bytes wasm.js makes, and stops at the same mistakes; and the playground compiling with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run, folioWasmCompiler, compileToWasmBytes, FolioError } from "./folio.js";
import { makeFolioWasm, FOLIO_WASM_FILES } from "./make-folio-wasm.mjs";
import examples from "./examples.js";
import { generatePrograms } from "./generate.js";
import { PROGRAMS, ERRORS, TYPED, brokenPrograms } from "./cases.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url));
const shipped = here("folio.wasm");
const compile = folioWasmCompiler(shipped);

test("folio.wasm is what make-folio-wasm.mjs makes, and it makes itself again", () => {
  assert.ok(Buffer.compare(Buffer.from(makeFolioWasm()), shipped) === 0, "folio.wasm is behind: run node make-folio-wasm.mjs");
  const files = Object.fromEntries(FOLIO_WASM_FILES.map((name) => [name, here(name).toString("utf8")]));
  const itself = compile(here("folio-wasm.folio").toString("utf8"), files).whole;
  assert.ok(Buffer.compare(Buffer.from(itself), shipped) === 0);
});

// a program's module, as each compiler makes it (folio.wasm's with its section "folio" after, which wasm.js's
// hasn't), or the mistake that stopped it
function made(compiler, source) {
  try {
    return compiler(source).bytes;
  } catch (err) {
    if (!(err instanceof FolioError)) throw err;
    return `line ${err.line}, column ${err.col}: ${err.message}`;
  }
}

test("folio.wasm compiles every program to wasm.js's bytes, and stops at the same mistakes", () => {
  const corpus = [...Object.values(examples), ...PROGRAMS.map(([s]) => s), ...ERRORS.map(([s]) => s), ...TYPED,
    ...generatePrograms(2026, 300), ...brokenPrograms(42, 500)];
  let compiled = 0;
  for (const source of corpus) {
    const want = made(compileToWasmBytes, source);
    const got = made(compile, source);
    if (typeof want === "string") assert.equal(got, want, source);
    else {
      assert.ok(Buffer.compare(Buffer.from(got.subarray(0, want.length)), Buffer.from(want)) === 0, `different bytes for:\n${source}`);
      compiled++;
    }
  }
  assert.ok(compiled > 600, `only ${compiled} compiled`);
});

test("what folio.wasm makes runs as the VM runs it, files and all", () => {
  const outcome = (engine, options = {}) => (source) => {
    const said = [];
    try {
      run(source, (line) => said.push(line), { engine, maxSteps: 100_000, ...options });
      return said;
    } catch (err) {
      return [...said, err.message];
    }
  };
  for (const [source] of PROGRAMS) assert.deepEqual(outcome("wasm", { wasm: (text) => compile(text) })(source), outcome("vm")(source), source);
  const files = { "shapes.folio": "to area with w, h\n    return w * h\nend\n" };
  const using = 'use "shapes.folio" as shapes\nsay shapes\'s area(3, 4)';
  assert.deepEqual(outcome("wasm", { wasm: (text) => compile(text, files) })(using), ["12"]);
});

test("the playground compiles with folio.wasm on WebAssembly, and with wasm.js until it has it", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /fetch\("\.\/folio\.wasm"\)/);
  assert.match(page, /postMessage\(\{[^}]*folioWasm \}\)/);
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  assert.match(worker, /engine === "wasm" && folioWasm \? folioWasmCompiler\(folioWasm\) : null/);
  assert.match(worker, /\.\.\.\(compiled && \{ wasm: compiled \}\)/);
});
