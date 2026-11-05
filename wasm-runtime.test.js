// The part of the WebAssembly runtime written once (wasm-runtime.js), which both back ends assemble: text in the
// module, and numbers shown in it as the VM shows them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run, compileToWasmBytes } from "./folio.js";
import { show } from "./vm.js";
import { wasmRuntimeFolio } from "./make-wasm-runtime.mjs";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

test("wasm-runtime.folio is what make-wasm-runtime.mjs makes of wasm-runtime.js as it is", () => {
  assert.equal(here("wasm-runtime.folio"), wasmRuntimeFolio());
});

// a module's exports, run with no imports at all: showing a number, and joining text, never need JavaScript
function exportsOf() {
  const module = new WebAssembly.Module(compileToWasmBytes("say 1").bytes);
  const imports = new Proxy({}, { get: (_, name) => () => assert.fail(`the module called ${String(name)}`) });
  return new WebAssembly.Instance(module, { folio: imports }).exports;
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
  const x = new WebAssembly.Instance(module, { folio: imports }).exports;
  x.restart();
  assert.throws(() => x.main(), (err) => err instanceof WebAssembly.Exception && err.is(x.mistake) && x.num(err.getArg(x.mistake, 0)) === 7 && err.getArg(x.mistake, 1) === 1);
  assert.deepEqual(said, ["say", "say"]);
});

// Stage 2's third part (DESIGN §147): a dictionary lives in the module, keys and values in the order the keys were
// first set, found by their hash; making one, setting, getting, finding and taking out keys never call JavaScript
test("dictionaries are made, changed and read in the module, with none of JavaScript's help", () => {
  const source = 'set d to dictionary where "a" is 1, 2.5 is "b"\nfor each i from 1 to 300\n    set item "k" + i of d to i\nend\nfor each i from 1 to 290\n    remove "k" + i from d\nend\n' +
    'set item 0.1 + 0.2 of d to "c"\nset item -0 of d to "z"\nsay item "k" + 295 of d\nsay item 0.3 of d\nsay item 0 of d\nsay "a" is in d\nsay 7 is in d\nsay length of d';
  const module = new WebAssembly.Module(compileToWasmBytes(source).bytes);
  const imported = WebAssembly.Module.imports(module).map((i) => i.name);
  for (const gone of ["dictGetText", "dictGetNum", "dictSetText", "dictSetNum", "dictHasText", "dictHasNum", "jsText"]) assert.ok(!imported.includes(gone), gone);
  let said = 0;
  const allowed = { grant: () => 2 ** 30, refill: () => 2 ** 30, say: () => said++ };
  const imports = new Proxy({}, { get: (_, name) => allowed[name] ?? (() => assert.fail(`the module called ${String(name)}`)) });
  const x = new WebAssembly.Instance(module, { folio: imports }).exports;
  x.restart();
  x.main();
  assert.equal(said, 6);
  assert.deepEqual(both(source), ["295", "c", "z", "yes", "no", "14"]);
});

// Stage 2's fourth part, begun (DESIGN §151): a call of what isn't a function, a function given the wrong number of
// inputs, a range that isn't of numbers, and a field of what isn't a record are worded in the module, with the
// program's names from its own data and each value's kind in words, as the VM words them
test("the module words the mistakes of calls, ranges and fields itself, with the program's names", () => {
  const source = [
    "to f with a",
    "    return a",
    "end",
    "set x to 5", // (an amount is made by a built-in, still in JavaScript)
    "try\n    say nope()\nif it fails with why\n    say why\nend",
    "try\n    say x(1)\nif it fails with why\n    say why\nend",
    "try\n    say f(1, 2)\nif it fails with why\n    say why\nend",
    "try\n    for each i from \"a\" to yes\n        say i\n    end\nif it fails with why\n    say why\nend",
    "try\n    set size of x to 2\nif it fails with why\n    say why\nend",
    "try\n    say size of (list of 1)\nif it fails with why\n    say why\nend",
  ].join("\n");
  const module = new WebAssembly.Module(compileToWasmBytes(source).bytes);
  const imported = WebAssembly.Module.imports(module).map((i) => i.name);
  for (const gone of ["callable", "checkInputs", "checkRange", "recordFor"]) assert.ok(!imported.includes(gone), gone);
  let x = null;
  const said = [];
  const text = (t) => String.fromCharCode(...Array.from({ length: x.textLength(t) }, (_, i) => x.textUnit(t, i)));
  const allowed = { tryStart: () => {}, grant: () => 2 ** 30, refill: () => 2 ** 30, say: (parts) => said.push(Array.from({ length: x.listLength(parts) }, (_, i) => text(x.listItem(parts, i))).join("")) };
  const imports = new Proxy({}, { get: (_, name) => allowed[name] ?? (() => assert.fail(`the module called ${String(name)}`)) });
  x = new WebAssembly.Instance(module, { folio: imports }).exports;
  x.restart();
  x.main();
  assert.deepEqual(said, [
    "there is no function called 'nope'",
    "'x' is a number, not a function",
    "'f' needs 1 input but got 2",
    "'from' and 'to' need numbers, not text and yes/no",
    "can only change 'size' of a record, not a number",
    "can't take 'size' of a list",
  ]);
  assert.deepEqual(both(source), said);
});

// Amounts, which a built-in still makes, shown and added to in the module as the VM shows and adds them: 0 of a
// unit and 1 of it by its word for one, a number past 15 digits as 15, and an amount added in another unit of the
// same measure in the first one's
test("the module shows and adds amounts as the VM does", () => {
  const source = [
    "set t to \"\"",
    "add 0 km to t",
    "say t",
    "set d to 5 km",
    "add 300 m to d",
    "set t to \"\"",
    "add d to t",
    "add \" \" to t",
    "add 1 mile to t",
    "add \" \" to t",
    "add 0.30000000000000004 kg to t",
    "say t",
    "try\n    set g to 1 kg\n    add 1 km to g\nif it fails with why\n    say why\nend",
    "try\n    set w to 3 kg\n    add 2 to w\nif it fails with why\n    say why\nend",
  ].join("\n");
  assert.deepEqual(both(source), ["0 km", "5.3 km 1 mile 0.3 kg", "can't add a distance to a weight", "can't add a number to a weight"]);
});

// DESIGN §153: what lists, text, dictionaries and bytes do, and their mistakes, in the module: a value shown as the
// VM's show does (text quoted inside a list as JSON writes it, a list inside itself as [...]), a text's letters, a
// dictionary's keys, `add` to text, and each mistake worded as vm.js words it, "did you mean" and all
test("the module shows values, goes through text's letters and words the mistakes of items itself", () => {
  const tries = (...lines) => lines.map((line) => `try\n    ${line.replace(/\n/g, "\n    ")}\nif it fails with why\n    say why\nend`).join("\n");
  const source = [
    "to f with a",
    "    return a",
    "end",
    "to shown with v",
    '    set t to ""',
    "    add v to t",
    "    return t",
    "end",
    'say shown(list of 1, "a\\"b", "c\\\\d", "line\\nbreak", yes, no, nothing)',
    "set ys to list of 1",
    "add ys to ys",
    "say shown(ys)",
    'say shown(record with name "Sam", pets (list of "cat"))',
    'set d to dictionary where "apple" is 1, 2 is "b", "pear" is (list of 3)',
    "say shown(d)",
    'remove "pear" from d',
    "say shown(d)",
    "say shown(empty dictionary)",
    "set bs to 3 bytes",
    "set item 2 of bs to 255",
    "say shown(bs)",
    "say shown(1 bytes)",
    "say shown(0 bytes)",
    "say shown(f)",
    'say shown("as it is")',
    'say item 2 of "héllo"',
    'say item 1 of "😀x"',
    'say shown(length of "😀x")',
    "set zs to list of 1, 2, 3",
    "set item 2.0000000000000004 of zs to 9",
    "say shown(zs)",
    'for each c in "a😀b"\n    say c\nend',
    "for each k in d\n    say shown(k)\nend",
    tries(
      "say item 9 of (list of 1, 2, 3)",
      "say item 0 of (list of 1)",
      "say item -2 of (list of 1)",
      "say item 1.5 of (list of 1)",
      'say item "x" of (list of 1)',
      'say item 7 of "abc"',
      "say item 5 of (2 bytes)",
      'say item "aple" of d',
      "say item (list of 1) of d",
      "say item 1 of 5",
      'set s to "abc"\nset item 1 of s to "x"',
      "set item 1 of bs to 300",
      'remove "zz" from d',
      'remove "a" from (list of 1)',
      "say length of 5",
      "for each c in 5\n    say c\nend",
      'set n to 5\nadd "x" to n',
      "repeat 2.5 times\n    say 1\nend",
      'repeat "x" times\n    say 1\nend',
      'set e to dictionary where (list of 1) is 2',
    ),
  ].join("\n");
  const module = new WebAssembly.Module(compileToWasmBytes(source).bytes);
  const imported = WebAssembly.Module.imports(module).map((i) => i.name);
  for (const gone of ["lengthOf", "item", "itemRef", "put", "dict", "remove", "addInto", "checkRepeat", "itemsOf"]) assert.ok(!imported.includes(gone), gone);
  let x = null;
  const said = [];
  const text = (t) => String.fromCharCode(...Array.from({ length: x.textLength(t) }, (_, i) => x.textUnit(t, i)));
  const allowed = { tryStart: () => {}, grant: () => 2 ** 30, refill: () => 2 ** 30, say: (parts) => said.push(Array.from({ length: x.listLength(parts) }, (_, i) => text(x.listItem(parts, i))).join("")) };
  const imports = new Proxy({}, { get: (_, name) => allowed[name] ?? (() => assert.fail(`the module called ${String(name)}`)) });
  x = new WebAssembly.Instance(module, { folio: imports }).exports;
  x.restart();
  x.main();
  assert.deepEqual(said, [
    '[1, "a\\"b", "c\\\\d", "line\\nbreak", yes, no, nothing]',
    "[1, [...]]",
    '(record with name "Sam", pets ["cat"])',
    '(dictionary where "apple" is 1, 2 is "b", "pear" is [3])',
    '(dictionary where "apple" is 1, 2 is "b")',
    "(empty dictionary)",
    "(3 bytes: 0, 255, 0)",
    "(1 byte: 0)",
    "(0 bytes)",
    "<function f>",
    "as it is",
    "é",
    "😀",
    "2",
    "[1, 9, 3]",
    "a", "😀", "b",
    "apple", "2",
    "there is no item 9, the list only has 3 items",
    "there is no item 0, items are counted from 1",
    "there is no item -2, items are counted from 1",
    "item numbers must be whole numbers, not 1.5",
    'item numbers must be whole numbers, not "x"',
    "there is no item 7, the text only has 3 letters",
    "there is no item 5, there are only 2 bytes",
    'there is no "aple" in this dictionary. Did you mean "apple"?',
    "a dictionary's keys are text or numbers, not a list",
    "can only take an item of a list, text, dictionary or bytes, not a number",
    "can only change items of a list, dictionary or bytes, not text",
    "a byte is a whole number from 0 to 255, not 300",
    'there is no "zz" in this dictionary',
    "can only remove from a dictionary, not a list",
    "'length of' needs a list, text, dictionary or bytes, not a number",
    "can only go through a list, text, dictionary or bytes, not a number",
    "can't add text to a number",
    "repeat needs a whole number of times, not 2.5",
    'repeat needs a whole number of times, not "x"',
    "a dictionary's keys are text or numbers, not a list",
  ]);
  assert.deepEqual(both(source), said);
});

