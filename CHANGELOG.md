# Changelog

What changed in each release of Folio, newest first. Each version links to its release on GitHub, which has
the downloads and their SHA-256 sums. [VERSIONING.md](VERSIONING.md) says what a version number promises,
and [DESIGN.md](DESIGN.md) has the reasons behind each change, a section for each.

## Not released yet

- **A GPT trained on the graphics card.** learn.folio has `embedding`, `gelu`, `layer_norm` and `attention` with a
  causal mask, on the card and on the processor, and keeps weights in safetensors files (`save`, `load`,
  `load_into`). gpt.folio trains a character-level GPT on Folio's README on a GTX 1650 to the same loss as
  PyTorch's same model, at 25 ms a step to PyTorch's 18 (DESIGN §167).
- **matmul with AVX, on every core.** arrays.folio's matrix multiply in machine code uses AVX where the processor
  has it and shares big ones out over up to 8 cores, every number still Folio's own sum to the last bit: 512 by
  512 in 5 ms, where it took 42 at the start of the day (DESIGN §166).
- **Numbers on the graphics card: `gpu.folio`.** Lists of numbers go up to an NVIDIA card, are added, multiplied,
  matrix-multiplied and summed there, and come back, through CUDA's driver alone: no toolkit. A 2,048 by 2,048
  matrix multiply on a GTX 1650 takes 13 ms, where arrays.folio's machine code takes 3.5 seconds (DESIGN §158).
- **Structures, views and atomics in `memory.folio`.** `layout` lays a C structure out as C does, and
  `get_field` and `put_field` go by name; `view` is part of a block with its own bounds, `read_only` one that
  refuses writes, and a view of a block given back is a mistake; `taken()` finds leaks; and `add_atomically`,
  `swap_if`, `get_atomically` and `put_atomically` change a number whole however many threads do (DESIGN §165).
- **Faster machine code.** `s + i * 0.5` works out the right first when s is a number, a third of the time a
  loop like that took; arrays.folio's matmul keeps 4 by 4 blocks in registers, twice as fast, to the same bits
  (DESIGN §164).
- **Networks trained on the graphics card: `learn.folio`.** Matrices on the card (or on the processor, where
  there's none) that remember how they were made, `backward(loss)` for every parameter's gradient, layers, and
  gradient descent and Adam. A digit reader learns 10 rounds of 6,000 drawings in 0.24 s on a GTX 1650, where
  PyTorch takes 0.63 on the same card (DESIGN §162).
- **gpu.folio** has transpose, add_rows, column_sums, softmax_rows, cross_entropy, argmax_rows, relu_gradient,
  add_scaled and adam_step, and keeps memory it's given back for the next numbers of as many (DESIGN §162).
- **math.folio's `sqrt` is the nearest double.** It was wrong for numbers past about 10^36 and below 10^-36
  (`sqrt(10^300)` gave 8.7 × 10^281); now it's the processor's own to the last bit, and arrays.folio's `sqrt` is
  `sqrtsd` in machine code. arrays.folio has `above_zero`, relu's slope (DESIGN §163).
- **Memory as C has it: `memory.folio`.** Numbers kept as C keeps them, in bytes or in memory of the program's
  own outside the collector, in each of C's kinds and either byte order: `memory's put(b, 1, -2, "a whole
  number")`, `get`, `get_many` and `put_many`, `take`, `copy`, `fill`, `address_of` and `give_back`. In a program
  folio builds, a loop of Folio's own in machine code puts a million floats in a millisecond (DESIGN §160).
- **Programs start sooner on Windows.** The DLLs a program uses for windows, pictures, sound and going online are
  loaded the first time it uses them, not as it starts: `folio version` takes 16 ms, not 25, where a C program
  that says hello takes 15 (DESIGN §159).
- **`folio check` starts at once.** It reads the checker's rules for the parts of the language a program uses,
  not all 9,500 of them first: 17 ms on a short file, not 37 (DESIGN §161).
- **Lists, text, dictionaries and bytes stay in WebAssembly.** A text's letters, a dictionary's keys, `add` to
  text and amounts, showing any value, and every mistake these make, "did you mean" and all, are the module's own:
  it imports 42 functions, not 51. An item given past 15 digits, as in `set item 2.0000000000000004 of xs to 9`,
  now changes the list on the WebAssembly engine, as on the others (DESIGN §153).
- **Inputs that say what they are, checked in WebAssembly.** A function's typed inputs and a record's "did you
  mean" are the module's own too (40 imports). An amount given to an input that wants a number now says "not a
  distance" on the WebAssembly engine, as on the others, not "not undefined" (DESIGN §154).
- **The operators stay in WebAssembly.** `+ - * /` with text, amounts or a mistake, `-` before a value, comparing,
  `is` by value and `is in` are the module's own: it imports 34 functions, not 40 (DESIGN §155).
- **A program with many variables compiles fast.** The compiler written in Folio found each name by going through
  every name in its scope; it keeps a dictionary of them now. A program of 20,000 variables runs in folio.exe in
  0.4 seconds, not 20, and one of 50,000 in 1 second, not more than 3 minutes (DESIGN §156).
- **`is divisible by` stays in WebAssembly.** An exact remainder of two numbers, from their bits, as C's fmod
  gives it: the module imports 32 functions (DESIGN §157).
- **Security: a folio.packages can't reach out of packages/, or into git's options.** A line naming a package
  `../x` made `folio get` and `folio remove` take away a folder outside `packages/`, and one whose source began
  `--upload-pack=` could make git run a command. folio now refuses a line, a program's own or a package's,
  whose name isn't a package's name, whose source or version starts with `-`, or whose commit isn't one, and
  runs git with no hooks. A clone that can't go to the version asked for isn't left behind (DESIGN §152).
- **Deeply nested code is the same mistake everywhere.** `format` and the compilers written in Folio let
  JavaScript's stack running out escape as a RangeError; now each says "the code is nested too deeply". The
  checker is much faster on long sums: 1,000 terms in 20 ms, not 198.
- **git's messages keep their r's.** What `folio add`, `get` and `update` said git said had lost every r.
- **More mistakes worded in WebAssembly.** A call of what isn't a function, a function given the wrong number
  of inputs, a range of what isn't numbers, and a field of what isn't a record are worded inside the module,
  with the program's own names (DESIGN §151).
- **Moth is now Folio.** The language, its command (`folio`), its files (`.folio`) and its packages
  (`foliolang`) have a new name. Programs from before still run: `use "json.moth"` finds `json.folio`, and
  `folio run`, `folio build` and `folio test` take `.moth` files as they are (DESIGN §150).
- **A new website.** Folio's site is now a Next.js app (`site/`) with GSAP motion and a new look: the front
  page, the playground, the lessons and the whole reference, cookbook and examples. The playground is the
  same one, every feature and all; the pages are made from the same sources as before. Old links still work.
- **Dictionaries in WebAssembly.** On the WebAssembly engine, dictionaries live inside the module, with no
  JavaScript: number and text keys are about twice as fast to set and read. The third part of making Folio's
  WebAssembly run with no JavaScript at all.
- **Mistakes in WebAssembly.** On the WebAssembly engine, `fail with`, a name with no value yet, and `try`
  catching them happen inside the module, with no JavaScript: catching a mistake in a loop is about 25 times
  faster. The second part of making Folio's WebAssembly run with no JavaScript at all.
- **Faster on the VM, the JIT and in machine code.** Measured on sixteen programs, before and after in turns:
  the VM takes 1.5 to 3.6 times less time (its switch goes straight to each instruction), the JIT 1.1 to 6.4
  times less on all but calls of four inputs (adding to text 179 ms to 28, records 89 to 23), and machine code compares
  `x is "text"` in line (1,000,000 letters compared, 101 ms to 30) and hashes dictionary keys eight bytes at a
  time (1.1 to 1.2 times faster); folio builds compiler.folio with 11% fewer instructions (DESIGN §149).
- **Web pages, made in Folio.** `page.folio` makes a page a part at a time: headings, text, links, pictures,
  lists, tables, boxes, text boxes, checkboxes, dropdowns and buttons, in Folio's look or with CSS of its own.
  The playground shows it, and so does a page `folio build --web` makes, as the whole window. `when the page is
  used with what` runs when something on it is clicked, typed or chosen, with every field's value, and the
  program shows the page again. The page is in a sandboxed frame, so it can't reach the site it's shown on.
  For a site, `html_of()` is the page's HTML for `server.folio` to send, with menus and forms.
- **`apps/recipes`**, a whole site in Folio: pages made with `page.folio`, a menu, a search, a form that adds a
  recipe and shows it again with what was wrong, a SQLite database, its own tests, and the recipes as JSON.
- The playground finds the standard library: `use "page.folio"`, `"json.folio"` and the rest work there.
- **folio.wasm.** Folio's compiler, `compiler.folio` and `wasm.folio`, is a WebAssembly module of its own,
  `folio.wasm`, made by itself and checked to make itself again. The playground compiles with it on the
  WebAssembly engine, so the programs it runs there are compiled by Folio, not by JavaScript.
- **What a function needs.** `to withdraw with amount where amount is greater than 0` checks its condition at
  the start of each call: if it isn't so, the call is a mistake that says what the function needs, as written,
  and what the name was: `'withdraw' needs amount is greater than 0, but amount is -5`. `where` goes on the
  function's first line, after its inputs, so no program that worked before means anything different.
- **New commands.** `folio new [app|web|package|library] <name>` starts a project: its code, tests that pass
  as made, a README and a GitHub workflow that runs them. `folio explain` says what a mistake means, why it
  happens and how to put it right, for the first mistake in a file or for a mistake's words. `folio upgrade`
  puts the newest release in place of the folio on PATH, once its SHA-256 checks out. `folio doc` makes pages
  of HTML from a program's comments, `folio bench` times `bench_` functions, `folio watch` runs a command again
  on each change, and `folio publish` opens a pull request that puts a package in the package index.
- **MCP servers, PDF files and spreadsheets.** `mcp.folio` makes servers whose tools Claude and other AI apps
  can call; `pdf.folio` writes PDF files with text, lines, boxes and colours; `xlsx.folio` reads and writes
  Excel workbooks. All three are in the standard library, in Folio alone.
- **foliolang for JavaScript.** `npm install foliolang` runs Folio in Node.js on the playground's engine:
  `run(source)` gives what a program said, `load(source)` its functions as JavaScript ones, and `check`,
  `format` and `test` are `folio check`'s, `folio tidy`'s and `folio test`'s; `npx foliolang run hello.folio` runs a
  file. A workflow publishes it with each release, once the name is set up on npm
  ([docs/npm-package.md](docs/npm-package.md)).
- **Installers.** `irm https://raw.githubusercontent.com/samyyy2423/folio/main/packaging/install.ps1 | iex` on
  Windows and `curl -fsSL https://raw.githubusercontent.com/samyyy2423/folio/main/packaging/install.sh | sh` on
  Linux install the latest release, checked against its `SHA256SUMS.txt`, and put `folio` on PATH. Scoop
  installs it from `packaging/scoop/folio.json`, and winget's manifests for `samyyy2423.Folio` are ready to
  submit. Each release now has `folio_<version>_amd64.deb` for Debian and Ubuntu, and an image,
  `ghcr.io/samyyy2423/folio`, on distroless Debian.
- **Signed releases.** Every file of a release is signed with Sigstore (a `.sigstore.json` bundle, a `.sig`
  and a `.pem` each), attested by GitHub, and described by an SBOM, `folio-<version>.cdx.json`.
  [docs/verifying-releases.md](docs/verifying-releases.md) says how to check them with `cosign verify-blob`
  and `gh attestation verify`. Before signing, the release workflow builds folio from the tag's source and
  checks the release's programs are those bytes, and the fixed point, on Linux and on Windows.
- **Property-based testing.** `properties.folio` tries what should hold for every value of a sort on a hundred
  made at random, small first, from `whole_number`, `decimal`, `yes_or_no`, `any_text`, `text_of`, `one_of`,
  `either_of`, `list_of`, `dictionary_of`, `mapped` and `kept`. A value that shows it doesn't hold is made as
  simple as it can be, and the mistake says it, with the seed that makes the same values again.
- **Faster machine code.** `bit and`, `bit or`, `bit xor` and the shifts of whole numbers are done where
  they're written, in a few instructions, not the runtime's 60: a loop that calls a function with a `bit and`
  in it runs twice as fast, and `folio build` 5% faster.
- **Fixed:** in a program `folio build` makes, `shift x left by n` of a number whole only to 15 digits (as
  `0.1 * 3 * 10` is) now shifts the number as it is, as the engines do, so it gives what they give.
- **`folio --version` and `folio version`** say which Folio this is: one line with the release version,
  taken from `package.json` and built into the standalone program.
- **`folio build --target wasm`** makes `<file>.wasm`, a WebAssembly module, from
  [`wasm.folio`](wasm.folio): Folio's WebAssembly back end, now written in Folio too, which makes exactly the
  bytes the playground's WebAssembly engine makes. `runWasm` in `folio.js` runs one.
- **Text on the WebAssembly engine** lives in the module now, as UTF-16, the first part of the runtime moving
  out of JavaScript (DESIGN §139): joining text, comparing it and showing numbers in it happen in WebAssembly,
  and text that's added to grows in place. Comparing text is 12 times faster there, and joining it a little
  faster. A number joined to text is shown exactly as the other engines show it, to 15 digits.
- **Fixed:** on the WebAssembly engine, a function that used a variable from outside it only in `ask`'s
  question, `wait`'s amount or `play note`'s note or time found it had no value.
- **A cookbook, examples and exercises.** [The cookbook](https://samyyy2423.github.io/folio/docs/cookbook/) has
  10 recipes for real work (CSV, JSON, web APIs, a web API with a database, the command line, statistics and
  charts, dates, every core, tests and text), [the examples](https://samyyy2423.github.io/folio/docs/examples.html)
  8 whole programs that open in the playground with a click, and [`exercises/`](exercises/) 20 problems to
  practise on, with tests, in Exercism's track format. Every recipe and example is run, and every exercise's
  tests checked, each time Folio changes.
- **The standard library's reference**, at [samyyy2423.github.io/folio/docs/](https://samyyy2423.github.io/folio/docs/):
  a page for each library, with what it's for and each of its functions, what it takes and an example with
  what it says, and a search of all 807. It's made from the libraries' own comments by `node make-docs.mjs`,
  and the tests fail when it's behind them. Every public function now has a comment, so the editors' hovers
  say what each does too.
- **Folio from Python.** `pip install foliolang` (a wheel for Windows and one for Linux, each with `folio` in
  it): `folio.load("fast.folio")` builds the file into a library once, caches it, and calls its functions
  through ctypes, with Python's own values going across and Folio's mistakes raised as `FolioError`;
  `folio.run(source)` runs a program; and the wheel gives you the `folio` command. fib(30) runs 10 to 13 times as
  fast as in Python.
- **A library for C.** `folio build fast.folio --library` makes the program's functions a shared library,
  `libfast.so` or `fast.dll`, and `fast.h` declares them: each takes and gives `folio_value`s through the
  system's own C convention, with a value API to make, read and free text, lists, dictionaries, records and
  bytes. A mistake gives 1 and a record of it, never an end to the program that loaded it; the top level
  runs once; calls from many threads take turns; and every call has a stack as deep as a program's.
- **Workers: every core.** `start work(x) on another core` runs the call on a worker, a thread with memory of
  its own, given copies of what it's called with and of the program's variables; `wait for` gives a copy of
  what it gave back, or fails with its mistake. In a program `folio build` makes, workers run at the same
  moment on as many cores as there are, on Windows and Linux; in the playground, as tasks do, one after
  another, giving the same.
- **A web server for many people.** `server.folio` serves many connections at once, so a slow client holds up
  no one, keeps them open for the next request (HTTP/1.1 keep-alive), answers requests sent together in
  order, and limits how long a request takes and how big it is (`set_timeout`, `set_idle_timeout`,
  `set_most_bytes`, `set_most_connections`, `set_most_requests`, `set_keep_alive`). A request now has its
  `version`. `serve_on_workers(8080, answer, 4)`, or `set_workers(4)`, answers on 4 workers. From 10,500
  requests a second to 85,000, on one thread.
- **Trusted packages.** `folio.sums`, beside `folio.packages`, keeps the SHA-256 of each package's files.
  `folio add` and `folio update` write it and `folio get` checks it, so a package changed in `packages/`, or
  changed where it comes from, is found. A package's own `folio.sums` is checked for the packages it brings.
  A `folio.packages` with no sums gets them from the next `folio get`.
- **Signed packages.** `folio add`, `folio get` and `folio update` take `--signed`, which accepts only a
  package whose commit, or the tag it was asked for at, has a signature git trusts.
- **`folio audit`** checks a program's packages against the advisories in the package index and says which
  are about the commits they're at.
- **Packages are checked out the same way everywhere.** folio tells git to keep line ends as they were
  committed and to write a symbolic link as a small file, whatever the system or the person's own git
  settings, so a package's files, and their sum, are the same on Windows and Linux.
- **Documents for depending on Folio:** a language specification ([SPEC.md](SPEC.md)), a stability promise
  ([VERSIONING.md](VERSIONING.md)), a security policy ([SECURITY.md](SECURITY.md)) and this changelog.
- **Types you can add.** An input can be `a dog` (a record the kind dog makes) or `a list of numbers` (or of
  `text`, `dogs`, `lists of numbers`...), and a function can say what it `gives`. A run checks what it
  always could; `folio check`, the playground and the editors check the rest before the program runs, as
  "doesn't fit", in red. They also know what a function returns, so `f() + 1`, where f gives nothing, will
  fail. Code that says nothing is checked as it was, and `gives` stays a name.
- **`folio check` works the types out**, as the playground's checker does, and says what it says word for
  word, but for what rests on a value written out (`1 / 0`).
- **`folio lsp`, a language server**, for any editor: problems as you type, formatting as `folio tidy` writes,
  the outline, go to definition in the file or a file it uses, hovers that say what a variable holds and
  what a function takes and gives, and completion, after `rex's` too.
- **Every major editor.** The VS Code extension asks `folio lsp` for the outline, definitions, hovers and
  completion where folio is installed. New: a plugin folder for Neovim, settings for Helix, an extension for
  Zed, a tree-sitter grammar for their colours, and how to use JetBrains' IDEs through LSP4IJ
  ([editors/README.md](editors/README.md)).
- **`ask for 64 bytes`** gives the input's next 64 bytes without waiting for a line's end, in programs folio
  builds.
- **The VS Code extension, ready for the Visual Studio Marketplace and Open VSX.** It finds folio from the
  `folio.path` setting, or else the PATH (`folio.exe` on Windows, paths with spaces too), and where there's none
  says so once, with a button to the releases, while colours, snippets, problems and Format Document go on
  without it. Run and Build keep what the program said in the terminal once it has ended, as tasks, which
  tasks.json can have too. It has an icon, a Marketplace page with a picture of each feature, and a changelog
  of its own; CI packs it with vsce and tests it in VS Code itself, and a workflow publishes it when it's run
  by hand ([docs/publishing-the-extension.md](docs/publishing-the-extension.md)).
- **A debugger in your editor.** A debug adapter for `folio debug` gives VS Code (*Folio: Debug this file*, or
  F5), Neovim, Helix and JetBrains' IDEs breakpoints, stepping, the calls in progress and the variables.
- **Libraries for a company's work.** `postgres.folio` and `mysql.folio` query PostgreSQL and MySQL over their
  own protocols, each value sent apart from the SQL, and `redis.folio` talks to Redis, all three on
  `wire.folio`. `s3.folio` keeps objects in S3 and the stores that speak its language, `jwt.folio` makes and
  checks JSON Web Tokens, `oauth.folio` signs a person in with OAuth 2 and PKCE, and `yaml.folio` reads and
  writes YAML. CI tests them against real PostgreSQL, MySQL, Redis and MinIO servers.
- **Fixes.** A package can use the standard library: `use "text.folio"` in a package, or in a file it uses,
  is folio's own `text.folio` unless the package has one, so a package no longer needs copies of its own.
- **`folio coverage` of tests.** `folio coverage x.test.folio`, or `folio coverage` for every `.test.folio` file
  here, runs the tests as `folio test` does and says which lines of the files they test ran, every test's runs
  added up: each file's share, and the lines no test ran. `--lcov` writes `lcov.info` for CI services and
  editors, for a program's run too. It no longer counts folio's own copies of the standard library, nor
  packages.

## [1.11.0](https://github.com/samyyy2423/moth/releases/tag/v1.11.0) (2026-11-04)

A standard library like Python's, secure networking, every core at once, and a faster web.

- **The standard library goes everywhere.** moth carries it, so `use "json.moth"` works in any folder. New
  since 1.10: `http.moth`, `websocket.moth`, `sockets.moth` with TLS and IPv6, HTTPS for `server.moth`,
  `email.moth` (SMTP, POP3 and IMAP), `zip.moth`, `xml.moth`, `toml.moth`, `options.moth`, `log.moth`,
  `collections.moth`, `lists.moth`, `stats.moth`, `zones.moth`, `base64.moth`, `secrets.moth`, `big.moth`,
  `fractions.moth`, `sets.moth`, `images.moth`, `crypto.moth` and `charts.moth`.
- **The language.** Inputs a call can leave out, functions with no name, lists built from lists,
  `items 2 to 4 of xs`, `to the power of`, `rounded down` and `rounded up`, `remainder of 17 divided by 5`,
  `x with 2 decimals`, a record's own functions, lists as sets, `either way` (like Python's `finally`),
  inputs by name, unpacking, `match`, steps in `for each`, kinds with `give`, and how a kind is shown.
- **Every core at once.** `tools/cores.moth` shares a list's items out between copies of the program, a core
  each. `job has ended` asks whether a task is done, and `sync.moth` has locks, semaphores, flags and queues.
- **Tools.** `moth profile`, `moth coverage` and `moth notebook`. `moth debug` stops at a mistake. Packages
  can be asked for at a version (`github.com/someone/thing@v1.2`), and `moth search` reads a package index.
- **Shipping.** `moth build --web` makes a page that runs the program in a browser. `moth build --installer`
  makes a setup program, and `--sign` signs each program built.
- **More of C.** Small and unsigned whole numbers, structures by value, and callbacks from any thread.
- **A faster web.** The playground runs programs on WebAssembly GC where the browser has it, up to 5 times as
  fast as 1.10 on lists, records and text.
- **Fixes.** A task's thread could crash on a Linux computer with one core. The profiler reports however a
  program ends. Reading text a letter at a time no longer counts from the start each time.
- **License.** Moth is under the Apache License 2.0 from this release. Earlier releases stay under MIT.

## [1.10.0](https://github.com/samyyy2423/moth/releases/tag/v1.10.0) (2026-11-03)

C libraries, the system's own controls, a shell, tasks and faster machine code.

- **The Moth shell.** `moth` on its own reads Moth a line at a time.
- **C libraries.** `use the library "sqlite3" ... end` calls a C library's functions, with structures,
  callbacks and floats, on Windows and Linux (`--allow-libraries`). `tools/sqlite.moth` keeps a database.
- **The system's own controls.** `tools/windows.moth` (Windows) and `tools/linux.moth` (GTK), with
  `tools/ui.moth` picking the right one.
- **More tools.** `server.moth`, `tasks.moth`, `text.moth`, `dates.moth`, `system.moth`, `hash.moth`
  (SHA-256) and `game.moth`.
- **Tasks.** `set job to start count(10)` runs a call on a thread of its own, and `wait for job` gives what
  it returned.
- **Values in text.** `"Hi, {name}!"`, with any value inside the braces.
- **A value's own functions and fields.** `rex's bark()` is `bark(rex)`, and `rex's name` is `name of rex`.
- **`moth debug`** stops a built program before each line, on command.
- **Packages.** `moth add`, `get`, `update`, `remove` and `packages`, and `use the package "json"`. A package
  is a Git repository, pinned at its commit in `moth.packages`.
- **VS Code.** `editors/vscode`: colours, problems as you type, Quick Fixes, formatting, the outline, and
  Run, Debug and Build.
- **Shipping a program.** `moth build --icon app.png --version 1.2.0 --include data`.
- **Faster machine code.** Small functions are put in line, inputs go in registers, and lists, text and
  records are worked on where the code is. fib(32) takes 1.25 times C's time.

## [1.9.0](https://github.com/samyyy2423/moth/releases/tag/v1.9.0) (2026-10-30)

Apps with real controls, and a window on Linux.

- **A window on Linux.** Drawings and apps show in a window on any X server, Xwayland and WSLg included,
  with nothing to install. Linux has no clipboard, drawing pad or file boxes yet.
- **Checkboxes, text areas, lists, dropdowns and sliders**, with handlers for each.
- **Choosing a file.** `choose a file to open` (or `to save`).
- **Editing what's typed**: the cursor, selecting, and cut, copy and paste.
- **Sending and JSON.** `send data to "https://..."`, `with headers`, `x as json` and `json from`.
- **Faster records.** A record made in one go is one block of memory.
- **Fixed:** in the Windows window, a button's handler also ran every 10 ms as if it were a timer.

## [1.8.1](https://github.com/samyyy2423/moth/releases/tag/v1.8.1) (2026-10-30)

Security fixes for Windows. Update if you use 1.8 or earlier on Windows.

- **DLLs only from System32.** A file called `winhttp.dll`, `winmm.dll` or `gdiplus.dll` beside `moth.exe`,
  or beside a program it built, would have run inside it.
- **`run program` never runs a program from beside the running one.** A name with no folder is looked for in
  System32, then the Windows folder, then PATH, skipping empty entries.
- **No commands slipped into a batch file.** An argument to a `.bat` or `.cmd` file holding any of
  `" % ^ & | < > !` or a line break is refused, as cmd.exe would read it as a command (the same problem as
  Rust's CVE-2024-24576).
- **`load` reads very small and very large numbers** written with an exponent, in built programs.

## [1.8.0](https://github.com/samyyy2423/moth/releases/tag/v1.8.0) (2026-10-30)

The time, saving, sound, buttons and pictures, and all of Moth in machine code.

- **The time and waiting.** `the time`, `the date`, `the clock`, `wait 2 seconds` and the rest.
- **Putting things in order.** `scores in order`, `in reverse order`, and `people in order by age`.
- **Saving and loading.** `save scores to "scores.txt"` and `load "scores.txt"`.
- **Sound.** `play note "C4" for 0.5 seconds`, a pitch in hertz, and `play a beep`.
- **Buttons and text boxes**, with handlers for clicks and Enter.
- **Pictures from files.** `draw picture "cat.png" at 0, 0`, PNG or BMP.
- **All of Moth in machine code.** Units, tables, charts, colours, folders and going online.
- **`moth test` finds the tests itself** when no file is named.
- **Speed.** About as fast as C and Rust, except on function calls, and 10 to 200 times as fast as Python.

## [1.7.0](https://github.com/samyyy2423/moth/releases/tag/v1.7.0) (2026-10-30)

Drawing, random numbers and the whole moth command.

- **Drawing, apps and the handwriting pad in machine code**, in a window of their own on Windows.
- **Random numbers in machine code**, the same as the playground's for the same seed (`MOTH_SEED`).
- **The whole moth command.** `moth run`, `moth tidy`, `moth check` and `moth test`, written in Moth.
- **New phrases.** `say ... to the error output`, `stop the program with 2`, `run program ... with ...`
  (and `keeping its output`), and `remove the file`. `--allow-run` lets a program start another without
  asking.
- **`expect` in machine code.**
- **The naming trap, fixed.** A `set` in a function changes a variable outside it only if that variable is
  made above the function. This can change what an old program does.
- **Fixes.** `stop the program` in an app's handler ends the program. A file used as two names keeps both
  copies' functions.

## [1.6.0](https://github.com/samyyy2423/moth/releases/tag/v1.6.0) (2026-10-30)

Moth on its own: `moth` is a program of its own for Windows and Linux, which needs nothing else installed.

- **It builds itself.** `moth.moth` and `machine.moth`, made into machine code, are moth, and moth makes
  them again into exactly the same bytes. A Windows moth and a Linux moth build each other byte for byte.
- **Machine code takes nearly all of Moth**: functions inside functions and as values, files, `ask`,
  arguments and the `--allow` flags, and upper and lower case for every Unicode character.
- **A garbage collector.**
- **The handwriting network runs as a program of its own.**
- **Gone:** the Rust engine (`moth-native`) and the Node.js command line. Both are still in 1.5.1. The
  playground keeps its JavaScript engine.

## [starter-1](https://github.com/samyyy2423/moth/releases/tag/starter-1) (2026-10-29, pre-release)

The first standalone moth, built from commit 44c1dd5: a program of its own for Windows and Linux on x86-64
that compiles a Moth program into one, kept so that a moth can always build the next one.

## [1.5.1](https://github.com/samyyy2423/moth/releases/tag/v1.5.1) (2026-10-29)

Closes five gaps in asking before files and going online.

- **`use` stays in the program's folder**, and a link inside it that leads out is refused.
- **`moth test` asks** as `moth run` does, and takes the same `--allow` flags.
- **Programs made by `moth build` ask too**, with the flags given to the build built in.
- **Flags can name what they allow**: `--allow-read=data,notes.txt`, `--allow-write=out`,
  `--allow-net=example.com`. A file is checked where it really is.
- **Redirects are asked about**, ten at most.

## [1.5.0](https://github.com/samyyy2423/moth/releases/tag/v1.5.0) (2026-10-29)

Numbers and data the way people use them.

- **Numbers like a spreadsheet**, shown and compared to 15 significant digits, so `0.1 + 0.2` is `0.3`.
- **Units**: distances, times, weights and volumes, metric and imperial.
- **Tables and charts.** `read table "sales.csv"`, `total of`, `average of` and `draw chart of`.
- **Inputs that say what they are.** `to area with width as a number, ...` checks every call.
- **Asks before it touches your files.** A program asks before it reads a file, writes one or goes online,
  unless it was started with `--allow-read`, `--allow-write`, `--allow-net` or `--allow-all`. This changed
  how scripts run.
- **Reading websites.** `read "https://..."`.
- **Fix buttons** in the playground for misspelled names.

## [1.4.0](https://github.com/samyyy2423/moth/releases/tag/v1.4.0) (2026-10-29)

Moth without JavaScript.

- **moth-native**, Moth written again in Rust with no libraries, making the same bytecode as the JavaScript
  engines, and building into one WebAssembly file that needs only WASI.
- **Moth builds itself without JavaScript**: compiler.moth writes bytecode, byte for byte what the Rust
  compiler makes.
- **Bytecode files** (`.mothc`).
- **A new website** for the playground.

## [1.3.0](https://github.com/samyyy2423/moth/releases/tag/v1.3.0) (2026-10-29)

Apps: programs that answer keys, clicks and time.

- **Events and timers**: `when a key is pressed`, `when the mouse is clicked`, `every 100 milliseconds`.
- **More to draw with**: `move to`, filled boxes and circles, text, and `clear`.
- **Random numbers.**
- **The playground runs apps live**, with Snake and Paint as examples.
- **`moth build --web`** makes one HTML file that runs the program.

## [1.2.0](https://github.com/samyyy2423/moth/releases/tag/v1.2.0) (2026-10-29)

Tools for writing real programs.

- **Error trails** show the calls that led to a mistake.
- **`expect` and `moth test`.**
- **`moth fmt`**, and a Tidy button in the playground.
- **Faster WebAssembly** for bytes and dictionaries.
- **Real tools in `tools/`**: a Mandelbrot picture, a word counter and a JSON reader.
- **Fixed:** a built program names the right file for a mistake inside a file it uses.

## [1.1.0](https://github.com/samyyy2423/moth/releases/tag/v1.1.0) (2026-10-28)

What real programs need.

- **Catching mistakes** with `try ... if it fails with why ... end`.
- **Dictionaries**, `keys of`, and `x is in y`.
- **Modules**: `use "math.moth" as math`.
- **Files and arguments**: `read`, `read bytes`, `write ... to` and `arguments`.
- **Bytes and bits**: `100 bytes`, `bit and`, `shift x left by 2`, `0xFF` and `255 as hex`.

## [1.0.0](https://github.com/samyyy2423/moth/releases/tag/v1.0.0) (2026-10-28)

The first release: a programming language that reads like plain English, written from scratch in JavaScript.

- **The language**: variables, lists, records, functions and closures, `if`, `repeat`, `for each`, `stop`,
  `fail with`, text helpers, `ask`, `use` and turtle drawing, with mistakes explained in plain words.
- **Three engines that must agree**: a bytecode virtual machine, a JIT to JavaScript, and a WebAssembly
  compiler.
- **A compiler written in Moth** that compiles itself to exactly the JIT's JavaScript.
- **Neural networks written in Moth**, and a handwriting reader.
- **Tools**: a checker, a time-travel debugger, the playground, and the `moth` command.
