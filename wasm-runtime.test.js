// The part of the WebAssembly runtime written once (wasm-runtime.js), which both back ends assemble: text in the
// module, and numbers shown in it as the VM shows them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run, compileToWasmBytes } from "./moth.js";
import { show } from "./vm.js";
import { wasmRuntimeMoth } from "./make-wasm-runtime.mjs";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

test("wasm-runtime.moth is what make-wasm-runtime.mjs makes of wasm-runtime.js as it is", () => {
  assert.equal(here("wasm-runtime.moth"), wasmRuntimeMoth());
});

// a module's exports, run with no imports at all: showing a number, and joining text, never need JavaScript
function exportsOf() {
  const module = new WebAssembly.Module(compileToWasmBytes("say 1").bytes);
  const imports = new Proxy({}, { get: (_, name) => () => assert.fail(`the module called ${String(name)}`) });
  return new WebAssembly.Instance(module, { moth: imports }).exports;
}

test("a number in text is what the VM shows: to 15 digits, laid out as JavaScript lays numbers out", () => {
  const x = exportsOf();
  const text = (t) => String.fromCharCode(...Array.from({ length: x.textLength(t) }, (_, i) => x.textUnit(t, i)));
  const view = new DataView(new ArrayBuffer(8));
  let seed = 2026;
  const next = (k) => { // Park and Miller's minimal standard, so the numbers are the same every run
    seed = (seed * 48271) % 2147483647;
    return seed % k;
  };
  const numbers = [0, -0, 1, 0.1, 0.1 + 0.2, 1 / 3, 1e21, 1e-7, 1e-6, 123456789012345.5, 1234567890123456.5, 2 ** 53, 2 ** 53 + 2, 2 ** 64,
    1.7976931348623157e308, 5e-324, 2.2250738585072014e-308, 2.225073858507201e-308, 4.4501477170144023e-308, NaN, Infinity, 1e22, 1e23, 99999999999999.99, 1.005, 0.07];
  for (let i = 0; i < 20000; i++) {
    view.setUint32(0, next(2 ** 31) * 2 + next(2)); // any bits at all
    view.setUint32(4, next(2 ** 31) * 2 + next(2));
    numbers.push(view.getFloat64(0));
    numbers.push(next(10 ** (1 + next(15))) / 10 ** next(20)); // a few digits, somewhere
    view.setUint32(0, next(2 ** 21)); // the smallest numbers, where 15 digits no longer read back as one each
    view.setUint32(4, next(2 ** 31) * 2);
    numbers.push(view.getFloat64(0));
  }
  for (const n of numbers) for (const v of [n, -n]) assert.equal(text(x.numberText(v)), show(v), String(v));
});

// what a program says on the VM and on the WebAssembly engine, which must be the same
function both(source) {
  const said = (engine) => {
    const lines = [];
    run(source, (line) => lines.push(line), { engine, maxSteps: 1_000_000 });
    return lines;
  };
  const vm = said("vm");
  assert.deepEqual(said("wasm"), vm, source);
  return vm;
}

test("text joined in place leaves the text it began as it was", () => {
  assert.deepEqual(both('set a to "ab"\nset b to a + "c"\nset c to a + "d"\nsay b\nsay c\nsay a\nsay a + a\nsay b + 1.5 + c'), ["abc", "abd", "ab", "abab", "abc1.5abd"]);
  assert.deepEqual(both('set s to ""\nfor each i from 1 to 20000\n    set s to s + "x"\nend\nsay length of s\nset t to s\nset s to s + "y"\nsay length of t\nsay length of s'), ["20000", "20000", "20001"]);
  assert.deepEqual(both('set s to "é😀"\nset t to s + s\nsay t\nsay length of t\nsay item 4 of t'), ["é😀é😀", "4", "😀"]);
});

test("text is compared unit by unit, as JavaScript compares strings, and by its letters for is", () => {
  assert.deepEqual(both('say "😀" is less than ""\nsay "b" is greater than "abc"\nsay "ab" is at most "ab"\nsay "" is less than "a"\nsay "é" is "é"\nsay "a" + "b" is "ab"'),
    ["yes", "yes", "yes", "yes", "yes", "yes"]);
});

test("the module makes, joins and compares text with none of JavaScript's help", () => {
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(compileToWasmBytes("say 1").bytes)).map((i) => i.name);
  for (const gone of ["sameText", "concat", "textNum", "numText", "text"]) assert.ok(!imports.includes(gone), gone);
});

// Stage 2's second part (DESIGN §146): a mistake the program makes itself is thrown and caught in the module, as a
// WebAssembly exception of its own. JavaScript only hears that a `try` began, and sees a mistake nothing caught.
test("a program's own mistakes are thrown and caught in the module, and one nothing catches reaches JavaScript", () => {
  const module = new WebAssembly.Module(compileToWasmBytes("try\n    fail with 5\nif it fails with why\n    say why\nend\ntry\n    say nope\nif it fails\n    say 2\nend\nfail with 7").bytes);
  const imported = WebAssembly.Module.imports(module).map((i) => i.name);
  for (const gone of ["fail", "unset", "failWith"]) assert.ok(!imported.includes(gone), gone);
  assert.deepEqual(WebAssembly.Module.exports(module).filter((e) => e.kind === "tag").map((e) => e.name), ["mistake"]);
  const said = [];
  const allowed = { tryStart: () => {}, grant: () => 2 ** 30, refill: () => 2 ** 30, say: () => said.push("say") };
  const imports = new Proxy({}, { get: (_, name) => allowed[name] ?? (() => assert.fail(`the module called ${String(name)}`)) });
  const x = new WebAssembly.Instance(module, { moth: imports }).exports;
  x.restart();
  assert.throws(() => x.main(), (err) => err instanceof WebAssembly.Exception && err.is(x.mistake) && x.num(err.getArg(x.mistake, 0)) === 7 && err.getArg(x.mistake, 1) === 1);
  assert.deepEqual(said, ["say", "say"]);
});
