// foliolang: Folio from JavaScript. Runs Folio programs, and calls a Folio file's functions straight from
// JavaScript, on Folio's own engine (the playground's), which compiles Folio to JavaScript: no folio to install.
//
//   import { run, load } from "foliolang";
//   run('say "Hello from Folio"');                       // ["Hello from Folio"]
//   const fast = load("to fib with n\n    if n is less than 2\n        return n\n    end\n    return fib(n - 1) + fib(n - 2)\nend");
//   fast.fib(25);                                       // 75025
//
// Values cross as they are: a number is a number, text a string, yes and no true and false, nothing null, a
// list an array, a dictionary a Map, and a record an object.
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run as runFolio, compileToJs, check as checkFolio, format as formatFolio, test as testFolio, FolioError } from "./engine/folio.js";
import { UNSET, Closure } from "./engine/vm.js";

export { FolioError };

const here = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;
export { version };

// The standard library's files, as `use "json.folio"` finds them: the file's name, its text, or undefined.
export function library(name) {
  const path = join(here, "lib", name);
  return /^[\w.-]+\.folio$/.test(name) && existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

// What `use` finds: the files given (an object of name and text, or a function), then the folder given, then the
// standard library.
function finder(files, folder) {
  return (name) => {
    const given = typeof files === "function" ? files(name) : files?.[name];
    if (given !== undefined) return given;
    if (folder) {
      const path = join(folder, name);
      if (existsSync(path) && statSync(path).isFile()) return readFileSync(path, "utf8");
    }
    return library(name);
  };
}

// a program's files on the computer's own disk, from a folder, for read, write and read the folder
function diskOf(folder) {
  const at = (name) => resolve(folder, name);
  return {
    read: (name, asBytes) => {
      if (!existsSync(at(name))) return null;
      const data = readFileSync(at(name));
      return asBytes ? new Uint8Array(data) : data.toString("utf8");
    },
    write: (name, data) => writeFileSync(at(name), data),
    remove: (name) => rmSync(at(name)),
    folder: (name) => (existsSync(at(name)) ? readdirSync(at(name)) : null),
  };
}

// the computer's own clock, for `the time`, `the clock` and `wait`
function realClock() {
  const started = performance.now();
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  return {
    now: () => Date.now(),
    since: () => performance.now() - started,
    sleep: (ms) => {
      if (ms > 0) Atomics.wait(sleeper, 0, 0, ms);
    },
  };
}

function options(given = {}) {
  const input = given.input;
  const answers = Array.isArray(input) ? [...input] : null;
  const folder = given.folder ? resolve(given.folder) : undefined;
  return {
    engine: given.engine ?? "jit",
    maxSteps: given.maxSteps ?? Infinity,
    args: given.args ?? [],
    files: finder(given.files, folder),
    file: given.file,
    ask: typeof input === "function" ? input : answers ? () => (answers.length ? answers.shift() : null) : undefined,
    disk: given.disk ? diskOf(typeof given.disk === "string" ? given.disk : folder ?? process.cwd()) : undefined,
    random: given.random ?? Math.random,
    clock: given.clock ?? realClock(),
    printError: given.printError ?? ((line) => process.stderr.write(`${line}\n`)),
    exit: given.exit,
  };
}

// Runs a Folio program: what it said, a line each. A mistake is thrown, a FolioError with its line and column.
// Options: args, input (answers for `ask`, a list or a function), files ({ "name.folio": text } for `use`), folder
// (where `use` finds files), disk (yes, or a folder: what `read` and `write` may touch), engine ("jit", "wasm"
// or "vm"), maxSteps, and print (each line as it's said, as well).
export function run(source, given = {}) {
  const said = [];
  runFolio(source, (line) => {
    said.push(line);
    given.print?.(line);
  }, options(given));
  return said;
}

// Runs a Folio program and gives back what it made at its top level, by name: a function as a JavaScript one,
// called with JavaScript's values. Its top level runs once, here; what it says goes to `print` (console.log).
export function load(source, given = {}) {
  const made = options(given);
  const program = compileToJs(source, { files: made.files, file: made.file });
  const values = program.run(given.print ?? console.log, undefined, Infinity);
  const out = Object.create(null);
  program.names.forEach((name, slot) => {
    const value = values[slot - 1];
    if (value !== UNSET) out[name] = value instanceof Closure ? (...args) => value.fn.run(...args) : value;
  });
  return out;
}

// the same for a file, whose `use` finds files beside it
export function runFile(path, given = {}) {
  return run(readFileSync(path, "utf8"), { folder: dirname(resolve(path)), ...given });
}

export function loadFile(path, given = {}) {
  return load(readFileSync(path, "utf8"), { folder: dirname(resolve(path)), ...given });
}

// the problems folio check finds, without running it: each { line, col, kind, message }
export function check(source, given = {}) {
  return checkFolio(source, { files: options(given).files });
}

// the code written the one way Folio writes it, as folio tidy does
export function format(source) {
  return formatFolio(source);
}

// each test_ function run in a run of its own: { name, said, error } for each
export function test(source, given = {}) {
  const made = options(given);
  return testFolio(source, { engine: made.engine, files: made.files });
}
