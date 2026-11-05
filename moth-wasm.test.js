// moth.wasm (DESIGN §144): Moth's compiler as a WebAssembly module of its own, made by itself, which compiles
// every program to the bytes wasm.js makes, and stops at the same mistakes; and the playground compiling with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run, mothWasmCompiler, compileToWasmBytes, MothError } from "./moth.js";
import { makeMothWasm, MOTH_WASM_FILES } from "./make-moth-wasm.mjs";
import examples from "./examples.js";
import { generatePrograms } from "./generate.js";
import { PROGRAMS, ERRORS, TYPED, brokenPrograms } from "./cases.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url));
const shipped = here("moth.wasm");
const compile = mothWasmCompiler(shipped);

test("moth.wasm is what make-moth-wasm.mjs makes, and it makes itself again", () => {
  assert.ok(Buffer.compare(Buffer.from(makeMothWasm()), shipped) === 0, "moth.wasm is behind: run node make-moth-wasm.mjs");
  const files = Object.fromEntries(MOTH_WASM_FILES.map((name) => [name, here(name).toString("utf8")]));
  const itself = compile(here("moth-wasm.moth").toString("utf8"), files).whole;
  assert.ok(Buffer.compare(Buffer.from(itself), shipped) === 0);
});

// a program's module, as each compiler makes it (moth.wasm's with its section "moth" after, which wasm.js's
// hasn't), or the mistake that stopped it
function made(compiler, source) {
  try {
    return compiler(source).bytes;
  } catch (err) {
    if (!(err instanceof MothError)) throw err;
    return `line ${err.line}, column ${err.col}: ${err.message}`;
  }
}

test("moth.wasm compiles every program to wasm.js's bytes, and stops at the same mistakes", () => {
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

test("what moth.wasm makes runs as the VM runs it, files and all", () => {
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
  const files = { "shapes.moth": "to area with w, h\n    return w * h\nend\n" };
  const using = 'use "shapes.moth" as shapes\nsay shapes\'s area(3, 4)';
  assert.deepEqual(outcome("wasm", { wasm: (text) => compile(text, files) })(using), ["12"]);
});

test("the playground compiles with moth.wasm on WebAssembly, and with wasm.js until it has it", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /fetch\("\.\/moth\.wasm"\)/);
  assert.match(page, /postMessage\(\{[^}]*mothWasm \}\)/);
  const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  assert.match(worker, /engine === "wasm" && mothWasm \? mothWasmCompiler\(mothWasm\) : null/);
  assert.match(worker, /\.\.\.\(compiled && \{ wasm: compiled \}\)/);
});
