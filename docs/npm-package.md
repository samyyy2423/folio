# mothlang on npm

[`npm/`](../npm) is `mothlang` for JavaScript: Moth's own engine (the one the playground runs), the standard
library, and a small API (`run`, `load`, `check`, `format`, `test`) and command (`mothlang`). It's made by
`node npm/make-package.mjs`, which copies the engine in as the VS Code extension carries it, and gives the
package Moth's version. `npm.test.js` makes it and uses it as a program would.

## Publishing

The [npm workflow](../.github/workflows/npm.yml) publishes it when a release is published, with npm's
provenance (a signed record that this repository's workflow made it, from that commit). It needs an npm account
that owns the name `mothlang`, once:

1. Make the package exist on npm, from your own computer, signed in as you (`npm login`):

   ```text
   node npm/make-package.mjs
   cd npm/dist
   npm publish --access public
   ```

2. Then, so the workflow can publish with no token kept anywhere: on npmjs.com, the package's **Settings** ->
   **Trusted publishing**, add GitHub Actions with the repository `samyyy2423/moth` and the workflow `npm.yml`.

   Until that's set, the workflow can publish with a token instead: an npm **granular access token** that
   can publish `mothlang`, saved as the repository secret `NPM_TOKEN`.

After that, each release published on GitHub publishes the same version of `mothlang`.
