// Folio's website: a static site (`next build` writes it to out/), served by GitHub Pages under /folio. The engine
// the playground runs sits beside the pages, in public/, put there by scripts/sync.mjs.
const basePath = process.env.FOLIO_BASE_PATH ?? "/folio";

export default {
  output: "export",
  basePath,
  trailingSlash: false, // /folio/playground, so the playground's own ./worker.js and ./folio.wasm are /folio/worker.js...
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
};
