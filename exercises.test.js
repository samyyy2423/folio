// Practice exercises in Exercism's track format, exercises/ (DESIGN §131): the track's config.json and each
// exercise's files agree, and each exercise's example solution passes every one of its tests with `moth test`,
// as a student's would, while the stub it starts from passes none.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { machineCompiler } from "./moth.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
const target = { win32: "windows", linux: "linux" }[process.platform];
const folder = new URL("./exercises/", import.meta.url);
const track = JSON.parse(readFileSync(new URL("config.json", folder), "utf8"));
const practice = readdirSync(new URL("practice/", folder)).sort();
const snake = (slug) => slug.replace(/-/g, "_");
const inside = (slug, file) => new URL(`practice/${slug}/${file}`, folder);

test("the track's config.json lists every exercise, and each has its files", () => {
  assert.equal(track.slug, "moth");
  assert.equal(track.version, 3);
  assert.ok(track.blurb.length <= 400, "a blurb of 400 characters at most");
  assert.equal(track.key_features.length, 6, "six key features");
  const listed = track.exercises.practice.map((e) => e.slug).sort();
  assert.deepEqual(listed, practice, "config.json lists the exercises in exercises/practice, and only those");
  assert.ok(practice.length >= 20, "20 practice exercises at least, as a track needs to launch");
  const uuids = track.exercises.practice.map((e) => e.uuid);
  assert.equal(new Set(uuids).size, uuids.length, "each exercise's uuid is its own");
  for (const e of track.exercises.practice) {
    assert.match(e.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, `${e.slug}'s uuid`);
    assert.ok(e.name && Number.isInteger(e.difficulty) && e.difficulty >= 1 && e.difficulty <= 10, `${e.slug}'s name and difficulty`);
    const meta = JSON.parse(readFileSync(inside(e.slug, ".meta/config.json"), "utf8"));
    assert.deepEqual(meta.files, { solution: [`${snake(e.slug)}.moth`], test: [`${snake(e.slug)}.test.moth`], example: [".meta/example.moth"] }, e.slug);
    assert.ok(meta.authors.length && meta.blurb, `${e.slug} has authors and a blurb`);
    for (const file of [...Object.values(meta.files).flat(), ".docs/instructions.md", ".docs/instructions.append.md", ".meta/tests.toml"]) {
      assert.ok(existsSync(inside(e.slug, file)), `${e.slug} has ${file}`);
    }
  }
});

test("each exercise tests every case of problem-specifications that tests.toml includes", () => {
  for (const slug of practice) {
    const cases = here(`exercises/practice/${slug}/.meta/tests.toml`).split(/\n(?=\[)/).filter((c) => c.startsWith("["));
    const included = cases.filter((c) => !/^include = false$/m.test(c));
    const left = cases.filter((c) => /^include = false$/m.test(c));
    for (const c of left) assert.match(c, /^comment = "/m, `${slug}: a case left out says why`);
    const tests = [...here(`exercises/practice/${slug}/${snake(slug)}.test.moth`).matchAll(/^to (test_\w+)/gm)].map((m) => m[1]);
    assert.equal(tests.length, included.length, `${slug}: a test for each case tests.toml includes`);
    assert.equal(new Set(tests).size, tests.length, `${slug}: each test's name is its own`);
  }
});

let built = null;
let builtIn = null;
after(() => builtIn && rmSync(builtIn, { recursive: true, force: true }));
// moth, built from the source as machine.test.js builds it
function mothExe() {
  if (built) return built;
  builtIn = mkdtempSync(join(tmpdir(), "moth-exercises-"));
  const machine = machineCompiler(here("machine.moth"), here("compiler.moth"));
  const files = Object.fromEntries(["machine.moth", "compiler.moth", "wasm.moth", "stdlib.moth", "webpage.moth", "checker-rules.moth", "tools/hash.moth"]
    .filter((file) => existsSync(new URL(`./${file}`, import.meta.url))).map((file) => [file, here(file)]));
  const bytes = machine(here("moth.moth"), { files, target, name: "moth.moth", allow: ["--allow-read", "--allow-write", "--allow-run"],
    include: { "moth-debugger.moth": readFileSync(new URL("./moth-debugger.moth", import.meta.url)) } });
  built = join(builtIn, target === "windows" ? "moth.exe" : "moth");
  writeFileSync(built, bytes);
  if (target === "linux") chmodSync(built, 0o755);
  return built;
}

// every exercise in a folder of its own, its solution `solution` (the example, or the stub), as a student's
// download has it; then `moth test` with no file named, which runs every .test.moth file in the folders
function testAll(solution) {
  const dir = mkdtempSync(join(tmpdir(), "moth-exercises-run-"));
  try {
    for (const slug of practice) {
      const into = join(dir, slug);
      mkdirSync(into);
      cpSync(inside(slug, `${snake(slug)}.test.moth`), join(into, `${snake(slug)}.test.moth`));
      cpSync(inside(slug, solution === "example" ? ".meta/example.moth" : `${snake(slug)}.moth`), join(into, `${snake(slug)}.moth`));
    }
    const ran = spawnSync(mothExe(), ["test"], { cwd: dir, encoding: "utf8", timeout: 600_000 });
    // each file's results, by exercise: [passed, failed]
    const results = {};
    let slug = null;
    for (const line of ran.stdout.split("\n")) {
      const file = /^(?:[\w-]+[\\/])?([\w]+)\.test\.moth$/.exec(line);
      if (file) {
        slug = practice.find((s) => snake(s) === file[1]);
        results[slug] = [0, 0];
      } else if (slug && line.startsWith("✓ ")) results[slug][0]++;
      else if (slug && line.startsWith("✗ ")) results[slug][1]++;
    }
    return { ran, results };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("each exercise's example solution passes every test, with moth test", { skip: target ? false : "moth makes programs for Windows and Linux", timeout: 900_000 }, () => {
  const { ran, results } = testAll("example");
  assert.deepEqual([ran.status, ran.stderr], [0, ""], ran.stdout);
  for (const slug of practice) {
    const tests = [...here(`exercises/practice/${slug}/${snake(slug)}.test.moth`).matchAll(/^to test_/gm)].length;
    assert.deepEqual(results[slug], [tests, 0], `${slug}'s example passes all ${tests} of its tests`);
  }
});

test("each exercise's stub, what a student starts from, runs its tests and passes none", { skip: target ? false : "moth makes programs for Windows and Linux", timeout: 900_000 }, () => {
  const { ran, results } = testAll("stub");
  assert.equal(ran.status, 1);
  for (const slug of practice) {
    const tests = [...here(`exercises/practice/${slug}/${snake(slug)}.test.moth`).matchAll(/^to test_/gm)].length;
    assert.deepEqual(results[slug], [0, tests], `${slug}'s stub runs its ${tests} tests and passes none`);
  }
});
