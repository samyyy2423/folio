// mothlang on npm (DESIGN §142): the package made as npm/make-package.mjs makes it, then used as JavaScript uses
// it, and its command run as npx runs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { makePackage } from "./npm/make-package.mjs";
import { ENGINE } from "./editors/vscode/make-vsix.mjs";
import { STANDARD } from "./make-stdlib.mjs";

const dir = mkdtempSync(join(tmpdir(), "mothlang-"));
const made = makePackage(join(dir, "mothlang"));
const moth = await import(pathToFileURL(join(made, "mothlang.js")).href);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

test("the package has the engine, the standard library, and Moth's version", () => {
  const manifest = JSON.parse(readFileSync(join(made, "package.json"), "utf8"));
  assert.equal(manifest.name, "mothlang");
  assert.equal(manifest.version, JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version);
  assert.equal(moth.version, manifest.version);
  for (const file of ENGINE) assert.ok(existsSync(join(made, "engine", file)), file);
  for (const file of STANDARD) assert.ok(existsSync(join(made, "lib", file.split("/").at(-1))), file);
  for (const file of manifest.files) assert.ok(existsSync(join(made, file)), file);
  // everything the engine imports is in it
  for (const file of ENGINE) {
    for (const [, used] of readFileSync(join(made, "engine", file), "utf8").matchAll(/^import .* from "\.\/([^"]+)"/gm)) assert.ok(ENGINE.includes(used), `${file} imports ${used}`);
  }
});

test("run gives back what a program said, on each engine, with the standard library", () => {
  const program = 'use "math.moth"\nsay "hi " + sqrt(16)\nfor each n in list of 1, 2\n    say n * 10\nend';
  for (const engine of ["jit", "wasm", "vm"]) assert.deepEqual(moth.run(program, { engine }), ["hi 4", "10", "20"], engine);
  assert.deepEqual(moth.run("say item 2 of arguments\nsay ask \"Name?\"", { args: ["a", "b"], input: ["Sam"] }), ["b", "Sam"]);
  const heard = [];
  moth.run("say 1\nsay 2", { print: (line) => heard.push(line) });
  assert.deepEqual(heard, ["1", "2"]);
  assert.deepEqual(moth.run('use "shapes.moth"\nsay area(2, 3)', { files: { "shapes.moth": "to area with w, h\n    return w * h\nend" } }), ["6"]);
});

test("a mistake is thrown as a MothError, with its line, column and reason", () => {
  try {
    moth.run("say 1\nsay 10 / 0");
    assert.fail("no mistake");
  } catch (err) {
    assert.ok(err instanceof moth.MothError);
    assert.deepEqual([err.line, err.reason], [2, "can't divide by zero"]);
  }
});

test("load hands back a program's functions, called with JavaScript's values", () => {
  const made = load(`
to fib with n
    if n is less than 2
        return n
    end
    return fib(n - 1) + fib(n - 2)
end
to counts with words
    set seen to empty dictionary
    for each w in words
        if w is in seen
            set item w of seen to item w of seen + 1
        else
            set item w of seen to 1
        end
    end
    return seen
end
set greeting to "hello"`);
  function load(source) {
    return moth.load(source, { print: () => {} });
  }
  assert.equal(made.fib(20), 6765);
  assert.deepEqual(made.counts(["a", "b", "a"]), new Map([["a", 2], ["b", 1]]));
  assert.equal(made.greeting, "hello");
});

test("check, format and test are moth check's, moth tidy's and moth test's", () => {
  assert.deepEqual(moth.check("say totl\nset total to 1\nsay total").filter((p) => p.kind === "fails").map((p) => p.message), ["'totl' has no value yet. Did you mean 'total'?"]);
  assert.equal(moth.format("set   x to 1\nsay x"), "set x to 1\nsay x\n");
  const results = moth.test("to test_fine\n    expect 1 + 1 is 2\nend\nto test_wrong\n    expect 1 + 1 is 3\nend");
  assert.deepEqual(results.map((r) => [r.name, r.error?.reason]), [["test_fine", undefined], ["test_wrong", "expected 2 to be 3"]]);
});

test("the mothlang command runs, checks, tests and tidies files", () => {
  const work = join(dir, "work");
  rmSync(work, { recursive: true, force: true });
  spawnSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(work)})`]);
  const cli = (...args) => spawnSync(process.execPath, [join(made, "bin", "mothlang.js"), ...args], { cwd: work, encoding: "utf8", input: "Ada\n" });
  writeFileSync(join(work, "hello.moth"), 'use "helper.moth"\nsay greeting(ask "Name?")\nsay item 1 of arguments\nstop the program with 3\n');
  writeFileSync(join(work, "helper.moth"), 'to greeting with name\n    return "Hello, " + name\nend\n');
  const ran = cli("run", "hello.moth", "first");
  assert.deepEqual([ran.stdout, ran.status], ["Name? Hello, Ada\nfirst\n", 3]);
  writeFileSync(join(work, "broken.moth"), "say 1 +\n");
  const broken = cli("run", "broken.moth");
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /^broken\.moth:2:1: expected a value but found the end of the code/);
  writeFileSync(join(work, "notes.moth"), 'write "kept" to "note.txt"\nsay read "note.txt"\n');
  assert.equal(cli("run", "--disk", "notes.moth").stdout, "kept\n");
  assert.notEqual(cli("run", "notes.moth").status, 0); // without --disk, no files
  assert.match(cli("check", "hello.moth").stdout, /hello\.moth: no problems found/);
  writeFileSync(join(work, "hello.test.moth"), 'use "helper.moth"\nto test_greeting\n    expect greeting("Bo") is "Hello, Bo"\nend\n');
  assert.deepEqual([cli("test").stdout, cli("test").status], ["✓ test_greeting\n1 passed\n", 0]);
  writeFileSync(join(work, "messy.moth"), "set   x to 1\n");
  assert.deepEqual([cli("tidy", "messy.moth", "--check").status, cli("tidy", "messy.moth").stdout], [1, "tidied messy.moth\n"]);
  assert.equal(readFileSync(join(work, "messy.moth"), "utf8"), "set x to 1\n");
  assert.equal(cli("--version").stdout, `mothlang ${moth.version}\n`);
  assert.equal(cli("frobnicate").status, 2);
});
