// Makes stdlib.folio, the standard library folio carries, from math.folio and the libraries in tools/:
//
//     node make-stdlib.mjs
//
// folio.folio uses it, so a program anywhere can `use "json.folio"`: the file beside the program first, then
// folio's own copy. folio.test.js says when stdlib.folio is behind the files it's made from.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// the libraries: each file a program uses for what it does, not a program, an example or a test; and the
// profiler `folio profile` builds into a program
export const STANDARD = ["math.folio", "folio-profiler.folio", "folio-coverage.folio", ...["ai", "arrays", "base64", "big", "charts", "collections", "cores", "crypto", "dates", "email", "fractions", "game", "gpu", "hash", "http", "images", "installer", "json", "jwt", "linux", "lists", "log", "mcp", "mysql", "oauth", "onnx", "options", "page", "pdf", "postgres", "properties", "python", "redis", "s3", "secrets", "server", "sets", "sockets", "sqlite", 
  "stats", "sync", "system", "tasks", "text", "toml", "ui", "websocket", "windows", "wire", "xlsx", "xml", "yaml", "zip", "zones"].map((name) => `tools/${name}.folio`)];

// a file's text as a Folio text: \ " and { escaped, line ends and tabs as \n and \t
const literal = (text) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\{/g, "\\{").replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;

export function stdlib(read = (file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8")) {
  const lines = [
    "# The standard library, which folio carries, so a program anywhere can use it: `use \"json.folio\"` finds the",
    "# file beside the program first, then this copy. Made by make-stdlib.mjs from math.folio and the libraries in",
    "# tools/: change those, then run it again.",
    "",
    `set standard_names to list of ${STANDARD.map((file) => `"${file.split("/").at(-1)}"`).join(", ")}`,
    "",
    "# a file of the standard library's text, by its name, or nothing if none is called that",
    "to standard_text with name",
  ];
  for (const file of STANDARD) {
    const text = read(file);
    if (/[\r\0-\x08\x0b-\x1f]/.test(text)) throw new Error(`${file} has a control character Folio text can't hold`);
    lines.push(`    if name is "${file.split("/").at(-1)}"`, `        return ${literal(text)}`, "    end");
  }
  lines.push("    return nothing", "end", "");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const made = stdlib();
  writeFileSync(new URL("./stdlib.folio", import.meta.url), made);
  console.log(`made stdlib.folio: ${STANDARD.length} files, ${made.length.toLocaleString("en")} bytes`);
}
