// Runs the extension's tests (suite.js) in VS Code itself, downloaded by @vscode/test-electron, on the extension
// as a .vsix has it: once with folio, and once without.
//
//     cd editors/vscode
//     npm ci
//     npx vsce package
//     node e2e/run.mjs                          (xvfb-run -a node e2e/run.mjs on Linux with no display)
//
// It takes the newest folio-*.vsix here, or the one it's given. folio is FOLIO's, or the repository's own (made by
// node bootstrap.mjs); it's copied into a folder with spaces in its name, as Program Files has, and folio.path
// set to it. Without one, only the tests that need no folio run. FOLIO_VSCODE_VERSION picks VS Code's version
// (stable, the newest, if it isn't set), which is kept in .vscode-test/ for next time.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTests } from "@vscode/test-electron";
import { copyFolio, downloadVSCode, findVsix, here, nowhere, profile, programs, unpack, vscodeVersion } from "./setup.mjs";

const vsix = findVsix(process.argv[2]);
const top = mkdtempSync(join(tmpdir(), "folio e2e "));
try {
  const extension = unpack(vsix, top);
  const folder = programs(top, {
    "broken.folio": "say (1\n",
    "typo.folio": "set totl to 1\nsay total\n",
    "messy.folio": "to   area with w,h\nreturn w*h\n  end\nsay area(2,3)\n",
    "calls.folio": 'use "lib.folio"\nto outer\n    to inner\n        say 1\n    end\n    inner()\nend\nouter()\nsay twice(3)\n',
    "lib.folio": "# twice: n doubled\nto twice with n\n    return n * 2\nend\n",
    "hello.folio": 'set name to "Folio"\nsay "Hi {name}!"\nset n to 2\nsay n * 21\n',
    "ask.folio": 'set name to ask "Who are you?"\nif name is "Sam"\n    say "Hi Sam!"\nelse\n    fail with "that was {name}"\nend\n',
    ".vscode/tasks.json": JSON.stringify({ version: "2.0.0", tasks: [{ type: "folio", command: "run", file: "hello.folio", label: "say hello" }] }),
  });
  const folio = copyFolio(top);
  if (!folio) console.log("There's no folio here, so only the tests that need no folio run: make one with node bootstrap.mjs, or say where one is with FOLIO.");

  const vscodeExecutablePath = await downloadVSCode();
  let failed = 0;
  for (const run of folio ? [folio, null] : [null]) {
    const args = profile(join(top, run ? "with folio" : "without folio"), { "folio.path": run ?? nowhere(top) });
    console.log(`\n${run ? "With folio" : "Without folio"}, in VS Code ${vscodeVersion}, from ${vsix}:`);
    try {
      await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath: extension,
        extensionTestsPath: join(here, "suite.js"),
        launchArgs: [folder, ...args],
        extensionTestsEnv: { FOLIO_E2E_FOLDER: folder, FOLIO_E2E_FOLIO: run ?? "" },
      });
    } catch (err) {
      console.error(err.message);
      failed++;
    }
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  rmSync(top, { recursive: true, force: true, maxRetries: 5 });
}
