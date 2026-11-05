#!/usr/bin/env node
// foliolang's command: Folio on its JavaScript engine, wherever Node.js is.
//
//   foliolang run hello.folio [arguments...]   run it (--disk lets it read and write files here)
//   foliolang check hello.folio                the problems folio check finds, without running it
//   foliolang test [files.test.folio...]       each test_ function, in a run of its own
//   foliolang tidy hello.folio [--check]       write it the one way Folio writes code
//   foliolang --version
import { readFileSync, readSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runFile, check, format, test, version, FolioError } from "../foliolang.js";

const [command, ...rest] = process.argv.slice(2);
const usage = "usage: foliolang run [--disk] <file.folio> [arguments...] | check <file.folio> | test [files...] | tidy <files...> [--check] | --version";

// a line of this program's input, or null when it has ended
function readLine() {
  const bytes = [];
  const one = Buffer.alloc(1);
  for (;;) {
    let got = 0;
    try {
      got = readSync(0, one, 0, 1, null);
    } catch (err) {
      if (err.code === "EAGAIN") continue;
      if (err.code === "EOF") got = 0;
      else throw err;
    }
    if (got === 0) return bytes.length ? Buffer.from(bytes).toString("utf8") : null;
    if (one[0] === 10) return Buffer.from(bytes).toString("utf8").replace(/\r$/, "");
    bytes.push(one[0]);
  }
}

// a mistake as folio says one: where, what, and the line with a ^ under the spot
function said(err, path) {
  const where = `${err.file ?? path}:${err.line}:${err.col}`;
  let text = `${where}: ${err.reason ?? err.message}`;
  try {
    const line = readFileSync(err.file ?? path, "utf8").split(/\r?\n/)[err.line - 1];
    if (line !== undefined) text += `\n${line}\n${line.slice(0, err.col - 1).replace(/\S/g, " ")}^`;
  } catch {}
  return text;
}

function tests(here = ".", found = []) {
  for (const name of readdirSync(here).sort()) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const path = here === "." ? name : join(here, name);
    if (statSync(path).isDirectory()) tests(path, found);
    else if (name.endsWith(".test.folio")) found.push(path);
  }
  return found;
}

if (command === "--version" || command === "version") {
  console.log(`foliolang ${version}`);
} else if (command === "run" && rest.length) {
  const disk = rest[0] === "--disk";
  const [path, ...args] = disk ? rest.slice(1) : rest;
  if (!path) {
    console.error(usage);
    process.exit(2);
  }
  let code = 0;
  try {
    runFile(path, {
      args, disk, print: (line) => process.stdout.write(`${line}\n`),
      input: (question) => {
        process.stdout.write(`${question} `);
        return readLine();
      },
      exit: (n) => (code = n),
    });
  } catch (err) {
    if (!(err instanceof FolioError)) throw err;
    console.error(said(err, path));
    code = 1;
  }
  process.exitCode = code;
} else if (command === "check" && rest.length === 1) {
  const problems = check(readFileSync(rest[0], "utf8"), { folder: join(rest[0], "..") });
  for (const p of problems) console.log(`${p.file ?? rest[0]}:${p.line}:${p.col}: ${p.kind === "fails" ? "will fail" : p.kind}: ${p.message}`);
  if (!problems.length) console.log(`${rest[0]}: no problems found`);
  process.exitCode = problems.some((p) => p.kind === "error" || p.kind === "fails") ? 1 : 0;
} else if (command === "test") {
  const files = rest.length ? rest : tests();
  let passed = 0;
  let failed = 0;
  for (const file of files) {
    for (const result of test(readFileSync(file, "utf8"), { folder: join(file, "..") })) {
      if (result.error) {
        failed++;
        console.log(`✗ ${result.name ?? file}: ${result.error.message}`);
      } else {
        passed++;
        console.log(`✓ ${result.name ?? file}`);
      }
    }
  }
  console.log(`${passed} passed${failed ? `, ${failed} failed` : ""}`);
  process.exitCode = failed ? 1 : 0;
} else if (command === "tidy" && rest.length) {
  const checking = rest.includes("--check");
  let untidy = 0;
  for (const file of rest.filter((f) => f !== "--check")) {
    const text = readFileSync(file, "utf8");
    const tidied = format(text);
    if (tidied === text) console.log(`${file} is tidy`);
    else if (checking) {
      console.log(`${file} needs tidying`);
      untidy++;
    } else {
      writeFileSync(file, tidied);
      console.log(`tidied ${file}`);
    }
  }
  process.exitCode = untidy ? 1 : 0;
} else {
  console.error(usage);
  process.exitCode = 2;
}
