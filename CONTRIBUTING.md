# Helping with Folio

Thank you for looking. Folio is a programming language that reads like plain English, and help of every size
is welcome: a bug report, a clearer error message, an example, a package, or a change to the compiler.
Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

Questions, ideas still taking shape, and things you've made with Folio belong in
[Discussions](https://github.com/samyyy2423/folio/discussions); bugs and planned work belong in issues.

## Ways to help

- **Start with a good first issue.** The issues labelled
  [good first issue](https://github.com/samyyy2423/folio/labels/good%20first%20issue) are small and say where to
  begin. Say in the issue that you're taking it, so two people don't do the same work.
- **Try it and say what went wrong.** Open an issue with the program (as short as you can make it), what Folio
  said, and what you expected. Say which you used: the [playground](https://samyyy2423.github.io/folio/),
  `folio run`, or a program `folio build` made, and on which system.
- **Make an error message clearer.** Folio's mistakes are meant to read like a person explaining them. If one
  puzzled you, that's a bug.
- **Write a package.** A package is a Git repository of Folio files; the
  [package index](https://github.com/samyyy2423/folio-packages) says how to publish one so `folio add` finds it.
- **Improve the docs and examples.** The README, DESIGN.md, and the programs in `apps/` and `tools/`.
- **Change the language or its engines.** Read on.

## Getting set up

You need [Node.js](https://nodejs.org/) 22 or later and Git. Folio has no other dependencies.

```bash
git clone https://github.com/samyyy2423/folio.git
cd folio
node bootstrap.mjs           # makes folio.exe (folio on Linux) from the source
npm test                     # every test: the VM, the JIT, WebAssembly and machine code
python -m http.server        # then open http://localhost:8000 for the playground
```

On Linux the tests for GTK windows need a display: CI runs `xvfb-run -a npm test`.

## How it fits together

The README's [How it's built](README.md#how-its-built) has the map of the files, and
[DESIGN.md](DESIGN.md) has every decision: why it was made, what was tried, and how it's tested. A few rules
keep it working:

- **Every engine says the same thing.** A program must say, draw and fail exactly alike on the VM, the JIT,
  WebAssembly and in machine code. Every check and error message lives once, in `vm.js`, and the tests run
  each program on all of them.
- **The compiler written in Folio matches the JIT byte for byte.** `compiler.folio` writes the same JavaScript
  as `jit.js`, so a change to what the JIT writes is made in both. Changes to the JIT's helpers and to
  `wasm.js` need nothing in `compiler.folio`.
- **Some files are made from others.** After changing `tools/`, run `node make-stdlib.mjs` and
  `node make-docs.mjs` (the standard library's reference, `docs/`); after changing `index.html` or an engine,
  `node make-web.mjs`; after changing `folio.folio` or `machine.folio`, `node bootstrap.mjs`. The tests say when
  one is out of date.
- **A library's public functions say what they do,** in a comment just above each `to`, which the editors'
  hovers and the reference show; a helper starts with the library's own prefix (`stats_`), or is named in
  make-docs.mjs's `HELPERS`.
- **The VS Code extension is tested in VS Code.** `editors/vscode` has tools of its own, for packing and testing
  it: `npm ci` there, then `npx @vscode/vsce package` and `xvfb-run -a node e2e/run.mjs` (CI runs both).
  [docs/publishing-the-extension.md](docs/publishing-the-extension.md) says how it's published to the Visual
  Studio Marketplace and Open VSX.
- **Folio files are tidy.** `folio tidy --check file.folio` says whether a file is laid out the one way Folio
  writes code, and `folio tidy file.folio` lays it out.
- **A name can't be a word Folio uses.** `set`, `item`, `list`, `to`, `every`, `number`, `bytes` and `read`
  are some of them, and Folio says so when one is used.

## Making a change

1. Keep it to one thing, and say in the pull request what it changes and why.
2. Add a test that fails without the change.
3. If it changes what Folio does, add a section to DESIGN.md (why, what it does, how it's tested), and put
   anything a person using Folio would see in the README.
4. If it changes the language, the standard library or the `folio` command, change [SPEC.md](SPEC.md) to
   match, add a line under "Not released yet" in [CHANGELOG.md](CHANGELOG.md), and check it keeps
   [VERSIONING.md](VERSIONING.md)'s promise: nothing a 1.x program does may change. A security problem goes
   to [SECURITY.md](SECURITY.md)'s private report, not a pull request.
5. Run `npm test`. CI runs it again on Linux for every pull request, and it must pass.

By sending a pull request you agree that your change is under the [Apache License 2.0](LICENSE), as the rest
of Folio is.

## Being kind

Be patient and generous with each other, especially with people new to programming: Folio is made for them.
