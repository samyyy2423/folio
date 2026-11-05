// The cookbook's recipes (docs/cookbook/*.md, DESIGN §128), each run as it's written, so none goes stale:
// its files are written to a folder of its own, each program run, and what each says must be what the recipe
// shows. In a recipe:
//
//   ```moth file=todo.moth      a file, written to the recipe's folder (```text file=..., ```json file=... too)
//   ```moth                     a program, run on its own; the ```output block after it is what it says
//   ```console                  what to type and what it says: `$ moth ...` runs moth, `$ curl ...` asks a
//                               site, `$ cat` shows a file, `$ ./name` runs a program the recipe built (on
//                               Linux), and a command ending in `&` keeps running, in
//                               the background, to the block's end; every other line is what the command
//                               before it says, `...` in it matching anything
//
// A recipe that asks a real site (api.github.com) asks a stand-in here, which answers as the site would. A
// program that opens a window runs where there's a display, for a few seconds, and must still be running.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import net from "node:net";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { machineCompiler } from "./moth.js";

const here = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
const target = { win32: "windows", linux: "linux" }[process.platform];
const folder = new URL("./docs/cookbook/", import.meta.url);
export const RECIPES = readdirSync(folder).filter((file) => file.endsWith(".md") && file !== "README.md").sort();

// ---------- reading a recipe ----------

// a recipe's steps, in order: { file, text }, { program, output }, or { console: lines }
export function stepsOf(markdown) {
  const steps = [];
  for (const m of markdown.matchAll(/^```(\w*)([^\n]*)\n([^]*?)^```[ \t]*$/gm)) {
    const [, language, info, body] = m;
    const text = body.replace(/\n$/, "");
    const file = /\bfile=(\S+)/.exec(info)?.[1];
    if (file) steps.push({ file, text: `${text}\n` });
    else if (language === "moth") steps.push({ program: `${text}\n`, output: null });
    else if (language === "output") {
      const last = steps.at(-1);
      if (!last || last.program === undefined || last.output !== null) throw new Error("an ```output block must come right after a ```moth block");
      last.output = text;
    } else if (language === "console") steps.push({ console: text.split("\n") });
  }
  return steps;
}

// a command's words, as a shell splits them: in '' or "" a space is part of a word
export function wordsOf(command) {
  const words = [];
  for (const m of command.matchAll(/'([^']*)'|"((?:[^"\\]|\\.)*)"|(\S+)/g)) words.push(m[1] ?? (m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : m[3]));
  return words;
}

// ---------- the stand-ins for real sites ----------

// what api.github.com answers, for the recipe that asks it: a repository, its open issues, and a new one
const REPOSITORY = { full_name: "samyyy2423/moth", description: "A programming language that reads like plain English",
  stargazers_count: 128, forks_count: 9, open_issues_count: 3, language: "JavaScript", license: { name: "Apache License 2.0" } };
const ISSUES = [{ number: 42, title: "A clearer message for a missing end" }, { number: 41, title: "Dates before 1970 on Windows" },
  { number: 37, title: "moth tidy and long lists" }];
function github(request, body) {
  const url = new URL(request.url, "http://here");
  if (request.headers["user-agent"] === undefined) return [403, { message: "Request forbidden by administrative rules. Please make sure your request has a User-Agent header" }];
  if (request.method === "GET" && url.pathname === "/repos/samyyy2423/moth") return [200, REPOSITORY];
  if (request.method === "GET" && url.pathname === "/repos/samyyy2423/moth/issues") return [200, ISSUES.slice(0, Number(url.searchParams.get("per_page") ?? 30))];
  if (request.method === "POST" && url.pathname === "/repos/samyyy2423/moth/issues") {
    if (!/^Bearer \S+/.test(request.headers.authorization ?? "")) return [401, { message: "Requires authentication" }];
    return [201, { number: 43, title: JSON.parse(body).title, html_url: "https://github.com/samyyy2423/moth/issues/43" }];
  }
  return [404, { message: "Not Found" }];
}
export const SITES = { "https://api.github.com": github };

let stands = null;
// a local server for each site, and what a recipe's files say instead of the site's address
async function standIns() {
  if (stands) return stands;
  stands = {};
  for (const [address, answer] of Object.entries(SITES)) {
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (piece) => (body += piece));
      request.on("end", () => {
        const [status, json] = answer(request, body);
        response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(json));
      });
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    stands[address] = { server, local: `http://127.0.0.1:${server.address().port}` };
  }
  return stands;
}
after(() => Object.values(stands ?? {}).forEach(({ server }) => server.close()));

// ---------- moth ----------

let built = null;
let builtIn = null; // the folder moth was built in, taken away once every recipe has run
after(() => builtIn && rmSync(builtIn, { recursive: true, force: true }));
// moth, built from the source as machine.test.js builds it, or MOTH_EXE's, which saves a minute while writing
function mothExe() {
  if (built) return built;
  if (process.env.MOTH_EXE) return (built = process.env.MOTH_EXE);
  const dir = (builtIn = mkdtempSync(join(tmpdir(), "moth-cookbook-")));
  const machine = machineCompiler(here("machine.moth"), here("compiler.moth"));
  const files = Object.fromEntries(["machine.moth", "compiler.moth", "stdlib.moth", "webpage.moth", "checker-rules.moth", "tools/hash.moth", "wasm.moth"]
    .filter((file) => existsSync(new URL(`./${file}`, import.meta.url))).map((file) => [file, here(file)]));
  const bytes = machine(here("moth.moth"), { files, target, name: "moth.moth", allow: ["--allow-read", "--allow-write", "--allow-run"],
    include: { "moth-debugger.moth": readFileSync(new URL("./moth-debugger.moth", import.meta.url)) } });
  built = join(dir, target === "windows" ? "moth.exe" : "moth");
  writeFileSync(built, bytes);
  if (target === "linux") chmodSync(built, 0o755);
  return built;
}

// whether something listens on a port yet
const listening = (port) => new Promise((done) => {
  const socket = net.connect(port, "127.0.0.1", () => {
    socket.destroy();
    done(true);
  });
  socket.on("error", () => done(false));
});

// what curl would print, asked with -d, -X and -H as curl takes them
async function curl(words) {
  let [method, body, url] = [null, null, null];
  const headers = {};
  for (let k = 1; k < words.length; k++) {
    const w = words[k];
    if (w === "-d" || w === "--data") body = words[++k];
    else if (w === "-X") method = words[++k];
    else if (w === "-H") {
      const [name, ...rest] = words[++k].split(":");
      headers[name.trim()] = rest.join(":").trim();
    } else if (w !== "-s") url = /^https?:/.test(w) ? w : `http://${w}`;
  }
  if (body !== null && !headers["Content-Type"]) headers["Content-Type"] = "application/x-www-form-urlencoded";
  const port = Number(new URL(url).port || 80);
  for (let k = 0; k < 300 && !(await listening(port)); k++) await new Promise((done) => setTimeout(done, 100));
  const response = await fetch(url, { method: method ?? (body === null ? "GET" : "POST"), body, headers });
  return await response.text();
}

// the same, but for what's different every run: `...` in what a recipe shows matches anything
const same = (got, wanted) => {
  const pattern = wanted.split("...").map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^]*");
  return new RegExp(`^${pattern}$`).test(got);
};

// a window can open: on Windows, and on Linux where there's GTK 3 and a display (CI runs the tests in Xvfb)
const display = target === "windows" || (Boolean(process.env.DISPLAY)
  && ["/usr/lib/x86_64-linux-gnu/libgtk-3.so.0", "/usr/lib64/libgtk-3.so.0", "/usr/lib/libgtk-3.so.0"].some((f) => existsSync(f)));

// Runs a recipe: its files written, its programs and commands run, in a folder of its own; gives what went
// differently from what it shows, as lines
export async function cook(markdown, name) {
  const exe = mothExe();
  const sites = await standIns();
  const dir = mkdtempSync(join(tmpdir(), `moth-recipe-${name}-`));
  const wrong = [];
  const running = [];
  // a site's address, in what's written, made the stand-in's; and in what's said, the site's again
  const local = (text) => Object.entries(sites).reduce((t, [address, { local: there }]) => t.replaceAll(address, there), text);
  const real = (text) => Object.entries(sites).reduce((t, [address, { local: there }]) => t.replaceAll(there, address), text);
  try {
    let n = 0;
    for (const step of stepsOf(markdown)) {
      if (step.file) {
        mkdirSync(join(dir, step.file, ".."), { recursive: true });
        writeFileSync(join(dir, step.file), local(step.text));
      } else if (step.program !== undefined) {
        const file = `program-${++n}.moth`;
        writeFileSync(join(dir, file), local(step.program));
        const ran = await mothRun(exe, ["run", "--allow-all", file], dir);
        const said = real(ran.said).replace(/\n+$/, "");
        if (ran.status !== 0) wrong.push(`the program before line ${step.program.split("\n")[0]} ended with ${ran.status}: ${said}`);
        else if (step.output !== null && !same(said, step.output)) wrong.push(`a program said:\n${said}\nnot:\n${step.output}`);
      } else {
        const lines = step.console;
        for (let k = 0; k < lines.length; k++) {
          if (!lines[k].startsWith("$ ")) continue;
          const command = lines[k].slice(2).trim();
          let wanted = [];
          for (let j = k + 1; j < lines.length && !lines[j].startsWith("$ "); j++) wanted.push(lines[j]);
          wanted = wanted.join("\n").replace(/\n+$/, "");
          const words = wordsOf(command.replace(/\s*&$/, ""));
          let got = "";
          if (words[0] === "curl") got = await curl(words);
          else if (words[0] === "moth" && command.endsWith("&")) {
            const opens = /use "(game|ui|windows|linux)\.moth"/.test(readdirSync(dir).filter((f) => f.endsWith(".moth")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n"));
            if (opens && !display) continue; // a window needs GTK and a display to open on
            const child = spawn(exe, words.slice(1), { cwd: dir, detached: target !== "windows", stdio: ["ignore", "pipe", "pipe"] });
            const said = [];
            child.stdout.on("data", (piece) => said.push(piece));
            child.stderr.on("data", (piece) => said.push(piece));
            const job = { child, command, said, started: Date.now(), ended: null };
            running.push(job);
            child.on("exit", (code) => (job.ended = code));
            continue;
          } else if (words[0] === "moth") {
            got = (await mothRun(exe, words.slice(1), dir)).said;
          } else if (words[0] === "cat") got = readFileSync(join(dir, words[1]), "utf8");
          else if (words[0].startsWith("./") && target === "linux") got = (await mothRun(join(dir, words[0]), words.slice(1), dir)).said;
          else if (words[0].startsWith("./")) continue; // a program built for Linux, on Windows
          else throw new Error(`a recipe can run moth, curl, cat and what it built, not: ${command}`);
          got = real(got).replace(/\n+$/, "");
          if (!same(got, wanted)) wrong.push(`$ ${command}\nsaid:\n${got}\nnot:\n${wanted}`);
        }
        // what's running in the background must still be, a few seconds after it started
        for (const r of running) {
          while (r.ended === null && Date.now() - r.started < 3000) await new Promise((done) => setTimeout(done, 100));
          if (r.ended !== null) wrong.push(`$ ${r.command}\nended with ${r.ended} where it should go on: ${Buffer.concat(r.said).toString()}`);
        }
        stopAll(running);
      }
    }
    // a picture the recipe shows is there, and one its programs made is the one it shows
    for (const m of markdown.matchAll(/!\[[^\]]*\]\(([\w.-]+\.(?:svg|png))\)/g)) {
      const made = join(dir, m[1]);
      if (!existsSync(new URL(m[1], folder))) wrong.push(`the recipe shows ${m[1]}, which isn't in docs/cookbook`);
      else if (existsSync(made) && !readFileSync(made).equals(readFileSync(new URL(m[1], folder)))) {
        wrong.push(`${m[1]} isn't what the recipe's program makes now: copy it from ${made}`);
      }
    }
  } finally {
    stopAll(running);
    if (!wrong.length) rmSync(dir, { recursive: true, force: true });
  }
  return wrong;
}

// what's left running stopped: the whole group, as `moth run` starts the program it builds
function stopAll(running) {
  for (const r of running.splice(0)) {
    if (r.ended !== null) continue;
    try {
      if (target === "windows") spawnSync("taskkill", ["/pid", String(r.child.pid), "/t", "/f"]);
      else process.kill(-r.child.pid, "SIGKILL");
    } catch {}
  }
}

// what makes a run say the same each time
const STEADY = { NO_COLOR: "1" };

// moth run, waited for without stopping this process, whose stand-ins answer it meanwhile: { status, said }
function mothRun(exe, args, cwd) {
  return new Promise((done) => {
    const env = { ...process.env, ...STEADY };
    delete env.GITHUB_TOKEN; // a recipe shows what happens without one, where CI has none to give it
    const child = spawn(exe, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const said = [];
    child.stdout.on("data", (piece) => said.push(piece));
    child.stderr.on("data", (piece) => said.push(piece));
    const limit = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("close", (status) => {
      clearTimeout(limit);
      done({ status, said: Buffer.concat(said).toString() });
    });
  });
}

test("the cookbook's recipes are read as they're written", () => {
  assert.deepEqual(stepsOf("Hi\n\n```moth file=a.moth\nsay 1\n```\n\n```moth\nsay 2\n```\n\n```output\n2\n```\n\n```console\n$ moth run a.moth\n1\n```\n"),
    [{ file: "a.moth", text: "say 1\n" }, { program: "say 2\n", output: "2" }, { console: ["$ moth run a.moth", "1"] }]);
  assert.deepEqual(wordsOf(`curl -s -d '{"title": "milk"}' -H "A: b c" localhost:8080/todos`), ["curl", "-s", "-d", '{"title": "milk"}', "-H", "A: b c", "localhost:8080/todos"]);
  assert.ok(same("compiled to dodge (123,456 bytes)", "compiled to dodge (... bytes)"));
  assert.ok(!same("1\n2", "1"));
});

for (const recipe of RECIPES) {
  test(`the recipe ${recipe} does what it says`, { skip: target ? false : "moth makes programs for Windows and Linux", timeout: 600_000 }, async () => {
    const wrong = await cook(readFileSync(new URL(recipe, folder), "utf8"), recipe.replace(/\.md$/, ""));
    assert.deepEqual(wrong, [], wrong.join("\n\n"));
  });
}
