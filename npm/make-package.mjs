// Makes the npm package mothlang in a folder, ready for npm publish: its own files, Moth's engine (as the VS
// Code extension carries it) in engine/, the standard library in lib/, and a package.json with Moth's version.
//
//     node npm/make-package.mjs [folder]      (npm/dist unless it says)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ENGINE } from "../editors/vscode/make-vsix.mjs";
import { STANDARD } from "../make-stdlib.mjs";

const npm = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));

export function makePackage(into = join(npm, "dist")) {
  const out = resolve(into);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "engine"), { recursive: true });
  mkdirSync(join(out, "lib"));
  for (const file of ["mothlang.js", "mothlang.d.ts", "README.md"]) cpSync(join(npm, file), join(out, file));
  cpSync(join(npm, "bin"), join(out, "bin"), { recursive: true });
  for (const file of ["LICENSE", "NOTICE", "LICENSE-DejaVu"]) cpSync(join(root, file), join(out, file));
  for (const file of ENGINE) cpSync(join(root, file), join(out, "engine", file));
  for (const file of STANDARD) cpSync(join(root, file), join(out, "lib", basename(file)));
  const moth = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const made = { ...JSON.parse(readFileSync(join(npm, "package.json"), "utf8")), version: moth.version };
  writeFileSync(join(out, "package.json"), `${JSON.stringify(made, null, 2)}\n`);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`made the npm package in ${makePackage(process.argv[2])}`);
}
