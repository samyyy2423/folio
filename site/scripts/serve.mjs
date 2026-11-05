// Serves the built site (out/) as GitHub Pages does, under /moth: a page's address without .html finds it, and a
// folder its index.html.   node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const BASE = process.env.MOTH_BASE_PATH ?? "/moth";
const port = Number(process.argv[2] ?? 3010);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".wasm": "application/wasm", ".moth": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

const isFile = async (path) => (await stat(path).catch(() => null))?.isFile() ?? false;

createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (path === "/" || !path.startsWith(BASE)) {
    response.writeHead(302, { location: `${BASE}/` }).end();
    return;
  }
  path = normalize(path.slice(BASE.length) || "/");
  const candidates = [join(OUT, path), join(OUT, `${path}.html`), join(OUT, path, "index.html")];
  for (const file of candidates) {
    if (!file.startsWith(OUT) || !(await isFile(file))) continue;
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(file));
    return;
  }
  response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  response.end(await readFile(join(OUT, "404.html")).catch(() => "Not found"));
}).listen(port, "127.0.0.1", () => console.log(`Moth's site: http://localhost:${port}${BASE}/`));
