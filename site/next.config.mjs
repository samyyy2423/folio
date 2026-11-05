// Moth's website: a static site (`next build` writes it to out/), served by GitHub Pages under /moth. The engine
// the playground runs sits beside the pages, in public/, put there by scripts/sync.mjs.
const basePath = process.env.MOTH_BASE_PATH ?? "/moth";

export default {
  output: "export",
  basePath,
  trailingSlash: false, // /moth/playground, so the playground's own ./worker.js and ./moth.wasm are /moth/worker.js...
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
};
