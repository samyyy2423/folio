// Takes the README's pictures in VS Code itself (screenshots-suite.js has each), into images/, with the extension
// as a .vsix has it and the repository's folio (node bootstrap.mjs makes it, or say where one is with FOLIO). On
// Linux, with ImageMagick, on a display of its own, the size the pictures are cut from:
//
//     cd editors/vscode
//     npx vsce package
//     xvfb-run -a -s "-screen 0 2600x1700x24" node e2e/screenshots.mjs
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTests } from "@vscode/test-electron";
import { copyFolio, downloadVSCode, extensionFolder, findVsix, here, profile, programs, unpack } from "./setup.mjs";

const vsix = findVsix(process.argv[2]);
const top = mkdtempSync(join(tmpdir(), "folio shots "));
try {
  const extension = unpack(vsix, top);
  const shop = readFileSync(join(here, "shop.folio"), "utf8");
  const prices = readFileSync(join(here, "prices.folio"), "utf8");
  const folder = programs(top, { "shop.folio": shop, "prices.folio": prices });
  const folio = copyFolio(top);
  if (!folio) throw new Error("There's no folio: make one with node bootstrap.mjs, or say where one is with FOLIO.");
  const vscodeExecutablePath = await downloadVSCode();
  const look = {
    "workbench.colorTheme": "Default Dark Modern",
    "window.commandCenter": false,
    "workbench.layoutControl.enabled": false,
    "workbench.secondarySideBar.defaultVisibility": "hidden",
    "chat.disableAIFeatures": true,
    "editor.minimap.enabled": false,
    "editor.fontSize": 14,
    "editor.hover.delay": 100000, // a hover only when it's asked for
    "terminal.integrated.fontSize": 14,
    "debug.toolBarLocation": "docked",
  };
  // with folio for all but one picture; and without it, on a PATH with none, for the message that says so
  for (const run of [folio, null]) {
    const args = profile(join(top, run ? "with folio" : "without folio"), { ...look, "folio.path": run ?? "" });
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: extension,
      extensionTestsPath: join(here, "screenshots-suite.js"),
      launchArgs: [folder, ...args, "--force-device-scale-factor=2"],
      extensionTestsEnv: { FOLIO_SHOTS_FOLDER: folder, FOLIO_SHOTS_OUT: join(extensionFolder, "images"), FOLIO_SHOTS_FOLIO: run ?? "", PATH: run ? process.env.PATH : "/usr/bin:/bin" },
    });
  }
} finally {
  rmSync(top, { recursive: true, force: true, maxRetries: 5 });
}
