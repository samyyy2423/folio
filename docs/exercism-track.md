# Proposing a Moth track to Exercism

Samyak: this is for you. [Exercism](https://exercism.org) is a free site where people learn a language by
solving small exercises, with tests that tell them when they're done and mentors who read their code. A
track there would put Moth in front of people who go looking for a new language to learn. This says what's
ready in this repository, what Exercism asks for, and the steps to take, in order. Nothing has been sent to
Exercism: everything below is yours to decide and do.

Exercism's own guide is [Building a new track](https://exercism.org/docs/building/tracks/new). It changes;
where it and this disagree, it wins. What's below is what it said in November 2026.

## What's ready

In [`exercises/`](../exercises/README.md), in Exercism's track format:

- **25 practice exercises**, more than the 20 a track needs to launch: hello-world, two-fer, leap, raindrops,
  bob, isogram, pangram, word-count, anagram, acronym, hamming, rna-transcription, grains, collatz-conjecture,
  armstrong-numbers, reverse-string, matching-brackets, clock, sieve, luhn, difference-of-squares,
  scrabble-score, nucleotide-count, prime-factors and triangle. Each has its instructions from Exercism's
  [problem-specifications](https://github.com/exercism/problem-specifications) (MIT), what it asks for in
  Moth (`.docs/instructions.append.md`), a stub, its canonical cases as tests in Moth, `.meta/tests.toml` (which
  cases those are, as `configlet` keeps it) and an example solution.
- **The track's `config.json`**: Moth's slug, blurb, files, six key features, tags, and each exercise's uuid,
  name and difficulty. `active` is `false`, as a track is until it launches.
- **The documents a track needs**: `docs/` (ABOUT, INSTALLATION, LEARNING, RESOURCES, TESTS and SNIPPET.txt)
  and `shared/.docs/` (help.md and tests.md), first drafts to read and change.
- **Tests in CI**: [`exercises.test.js`](../exercises.test.js) checks, on every push, that `config.json` and
  each exercise's files agree, that the tests cover every case `tests.toml` includes, that each example
  passes all of its tests with `moth test`, and that each stub passes none.
- **[`exercises/bin/generate.mjs`](../exercises/bin/generate.mjs)**, which made the exercises from a copy of
  problem-specifications, and adds more: a new exercise is its stub, example and how each case is tested.

A few cases are left out, each with its reason in `tests.toml`: armstrong-numbers' two numbers of 33 and 39
digits (a Moth number keeps 15), and reverse-string's two with letters written as a letter and a mark
(Moth's text is a list of code points, so it reverses the mark apart from its letter). grains' numbers are
past 15 digits too, so it asks for them as text, with big.moth.

## What Exercism asks for

From [Request a new track](https://exercism.org/docs/building/tracks/new/request-new) and the pages after it:

1. **A conversation first.** "You must post in the Support category on the Exercism Community Forum to discuss
   this with the team." Before posting, they ask you to check it's a programming language (it is), that there's
   no track for it yet, that no one has asked already, and that you'll be there to build and launch it.
2. **A lead.** "We will only create a track if there is at least one volunteer who has offered to take the lead
   on building it." That's you, and later other maintainers.
3. **To launch**: 20 practice exercises (there are 25), "continuous integration that checks that the exercises
   can be solved" (exercises.test.js does, here; the track's own repository needs a workflow of its own),
   and "a bit of configuration and documentation" (config.json and the documents above).
4. **A test runner**, so a student can solve exercises in the browser's editor and the site can say whether a
   solution passes: a Docker image, usually written in the track's own language, that runs a solution's tests
   and writes what happened as `results.json`, in the form
   [Exercism's test runner docs](https://exercism.org/docs/building/tooling/test-runners) describe.
5. **[Preparing for launch](https://exercism.org/docs/building/tracks/new/prepare-for-launch)**: a track icon
   (an issue in [exercism/website-icons](https://github.com/exercism/website-icons)), the track's documents,
   `exercises/shared/.docs/help.md` and `tests.md`, `docs/SNIPPET.txt`, and config.json's `language`, `slug`,
   `blurb` (400 characters at most), `online_editor`, `key_features` and `tags`.
6. **Syntax highlighting** on the site, through Highlight.js. Highlight.js has no Moth yet, so config.json leaves
   `highlightjs_language` out, as Exercism says to; a Highlight.js grammar could be written from
   [Moth's tree-sitter grammar](../editors/tree-sitter-moth) later.

## The steps

1. **Read** [Building a new track](https://exercism.org/docs/building/tracks/new) and its pages, to check
   nothing above has changed.
2. **Post in the forum**, in its Support category, as it asks. Something like:

   > **A track for Moth?**
   >
   > I'm Samyak, and I made Moth, a programming language that reads like plain English
   > (https://github.com/samyyy2423/moth): small enough to learn in an afternoon, with a compiler written in
   > Moth that makes Windows and Linux programs, a playground in the browser, and a standard library from JSON
   > to web servers. It's at 1.11, open source under Apache 2.0, with a stability promise for 1.x.
   >
   > I'd like to build an Exercism track for it, and lead it. I have 25 practice exercises from
   > problem-specifications ready in the track format, with tests in Moth, example solutions that CI checks
   > pass, and first drafts of the track's documents. Moth's test runner, `moth test`, is part of the
   > language, so a Docker test runner would run it and turn what it says into results.json.
   >
   > Would a Moth track be welcome? If so, what would you like to see first?

3. **If they say yes**, the track gets a repository in Exercism's GitHub organization (`exercism/moth`, as
   each track has one, and as their test runners are `exercism/<track>-test-runner`); ask in the thread how
   they'd like it set up. Copy what's here into it:

   | Here | In the track's repository |
   |:--|:--|
   | `exercises/config.json` | `config.json` |
   | `exercises/practice/` | `exercises/practice/` |
   | `exercises/shared/` | `exercises/shared/` |
   | `exercises/docs/` | `docs/` |
   | `exercises/bin/generate.mjs` | `bin/generate.mjs`, if you keep making exercises with it |

   Then run Exercism's `configlet lint` there, which checks a track's files against their rules, and fix what
   it says. It wasn't run here: it's a tool of theirs, to fetch when you start.
4. **CI in the track's repository**: a workflow that downloads moth (a release's `moth-linux`), then for each
   exercise copies `.meta/example.moth` over the stub and runs `moth test`, as exercises.test.js does here.
5. **The test runner**: a repository of its own (`exercism/moth-test-runner`, as Exercism names them). Its
   Dockerfile puts
   `moth-linux` in the image; its script copies the solution beside the tests, runs `moth test`, and turns
   what it says into results.json: each `✓ test_name` passed, each `✗ test_name` failed with the lines under it
   as its message, and a mistake that stops the file before any test runs as an error. Exercism's
   [test runner docs](https://exercism.org/docs/building/tooling/test-runners), and the interface page they
   link to, give how it's run, the format of results.json and its limits, and how to test it.
6. **Before launch**: ask for the icon, read and change the documents, check each exercise's difficulty
   (1 to 10; here 1 to 3), and find another maintainer or two if you can. `active` in config.json becomes
   `true` when the track launches, as Exercism's [launch page](https://exercism.org/docs/building/tracks/new)
   says to do it.

## Keeping it going

- **More exercises**: add one to `EXERCISES` in `exercises/bin/generate.mjs` (its stub, example, and how a case
  becomes a Moth test), run it against a fresh clone of problem-specifications, and exercises.test.js says
  whether the example passes. A list of every exercise is in problem-specifications' `exercises/` folder.
- **When problem-specifications changes** a case, `configlet sync` updates `tests.toml`; then make the test for
  the new case, or run the generator again.
- **Concept exercises**, which teach one idea at a time (Exercism's learning mode), are optional to launch, and
  can come after: Moth's Learn page's eleven lessons are a start.
- **A Moth release in the track**: the test runner pins a version of moth. When Moth releases, update it there,
  and the exercises are checked again.
