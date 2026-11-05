# foliolang: Folio from JavaScript

[Folio](https://github.com/samyyy2423/folio) is a programming language that reads like plain English.
`foliolang` runs it in Node.js, on Folio's own engine, the one its playground runs in the browser: Folio is
compiled to JavaScript as it's loaded, so there's nothing else to install.

```text
npm install foliolang
```

## Run Folio

```js
import { run } from "foliolang";

run('say "Hello from Folio"');                   // ["Hello from Folio"]
run("set total to 0\nfor each n in list of 3, 4, 5\n    add n to total\nend\nsay total");   // ["12"]
```

`run` gives back what the program said, a line each, and throws a `FolioError` for a mistake, with its
`line`, `col` and `reason`. It takes `args`, `input` (answers for `ask`), `files` and `folder` (for `use`),
`disk` (to let `read` and `write` touch files), `engine` (`"jit"`, `"wasm"` or `"vm"`) and `print`.
`runFile("hello.folio")` runs a file, whose `use` finds the files beside it. The standard library is here:
`use "json.folio"`, `use "math.folio"` and the rest.

## Call Folio from JavaScript

```js
import { load } from "foliolang";

const shapes = load(`
to area with width, height
    return width * height
end
`);
shapes.area(3, 4);                              // 12
```

`load` runs the program once and hands back what its top level made, by name, each Folio function as a
JavaScript one. Values cross as they are: numbers, strings, `true` and `false` for yes and no, `null` for
nothing, arrays for lists, `Map`s for dictionaries and objects for records.

## And the rest

- `check(source)`: the problems `folio check` finds without running it, each `{ line, col, kind, message }`.
- `format(source)`: the code written the one way Folio writes it, as `folio tidy` does.
- `test(source)`: each `test_` function run, with what it said and any mistake.

It comes with a command too:

```text
npx foliolang run hello.folio Sam      run it (--disk lets it read and write files)
npx foliolang check hello.folio        find its problems without running it
npx foliolang test                    run every .test.folio file here
npx foliolang tidy hello.folio         write it the one way Folio writes code
```

For a program of its own, with nothing else to install, use `folio build` from
[Folio's releases](https://github.com/samyyy2423/folio/releases).

Apache License 2.0.
