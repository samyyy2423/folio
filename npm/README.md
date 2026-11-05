# mothlang: Moth from JavaScript

[Moth](https://github.com/samyyy2423/moth) is a programming language that reads like plain English.
`mothlang` runs it in Node.js, on Moth's own engine, the one its playground runs in the browser: Moth is
compiled to JavaScript as it's loaded, so there's nothing else to install.

```text
npm install mothlang
```

## Run Moth

```js
import { run } from "mothlang";

run('say "Hello from Moth"');                   // ["Hello from Moth"]
run("set total to 0\nfor each n in list of 3, 4, 5\n    add n to total\nend\nsay total");   // ["12"]
```

`run` gives back what the program said, a line each, and throws a `MothError` for a mistake, with its
`line`, `col` and `reason`. It takes `args`, `input` (answers for `ask`), `files` and `folder` (for `use`),
`disk` (to let `read` and `write` touch files), `engine` (`"jit"`, `"wasm"` or `"vm"`) and `print`.
`runFile("hello.moth")` runs a file, whose `use` finds the files beside it. The standard library is here:
`use "json.moth"`, `use "math.moth"` and the rest.

## Call Moth from JavaScript

```js
import { load } from "mothlang";

const shapes = load(`
to area with width, height
    return width * height
end
`);
shapes.area(3, 4);                              // 12
```

`load` runs the program once and hands back what its top level made, by name, each Moth function as a
JavaScript one. Values cross as they are: numbers, strings, `true` and `false` for yes and no, `null` for
nothing, arrays for lists, `Map`s for dictionaries and objects for records.

## And the rest

- `check(source)`: the problems `moth check` finds without running it, each `{ line, col, kind, message }`.
- `format(source)`: the code written the one way Moth writes it, as `moth tidy` does.
- `test(source)`: each `test_` function run, with what it said and any mistake.

It comes with a command too:

```text
npx mothlang run hello.moth Sam      run it (--disk lets it read and write files)
npx mothlang check hello.moth        find its problems without running it
npx mothlang test                    run every .test.moth file here
npx mothlang tidy hello.moth         write it the one way Moth writes code
```

For a program of its own, with nothing else to install, use `moth build` from
[Moth's releases](https://github.com/samyyy2423/moth/releases).

Apache License 2.0.
