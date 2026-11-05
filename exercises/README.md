# Moth's practice exercises

Practice exercises in [Exercism](https://exercism.org)'s track format, from Exercism's open
[problem-specifications](https://github.com/exercism/problem-specifications) (MIT): each exercise's
instructions, the canonical cases as tests in Moth, a stub to start from and an example solution.

```text
config.json                          the track: its exercises, their uuids and difficulty, and its files' names
practice/leap/
    leap.moth                        the stub a student starts from
    leap.test.moth                   the tests, run with moth test
    .docs/instructions.md            the exercise, from problem-specifications
    .docs/instructions.append.md     what it asks for in Moth
    .meta/config.json                the exercise's files, authors and where it comes from
    .meta/example.moth               a solution that passes every test
    .meta/tests.toml                 which canonical cases the tests have, as configlet keeps it
shared/.docs/                        how to run the tests, and where to get help
docs/                                the track's own pages: about Moth, installing it, learning it
```

To try one, copy its folder somewhere, write the stub's functions, and run `moth test` in it. Every example
solution passes all of its tests, and every stub none, on each push (`exercises.test.js`).
[docs/exercism-track.md](../docs/exercism-track.md) says how to propose the track to Exercism.
