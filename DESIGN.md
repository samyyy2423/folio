# Design notes

Why Folio is built the way it is, what each choice costs, and what I measured.

## 1. A grammar that reads like English but parses like code

- **One statement per line, blocks close with `end`.** Newlines carry meaning, so
  no semicolons or braces are needed, and every block has one obvious ending.
  The parser checks for a new line after each statement, which turns
  `set x to 5 6` into an error instead of two silent statements.
- **Two-word comparisons** (`is at least`, `is divisible by`) live in one table.
  After `is`, the parser looks at the next two words and checks that table. Adding
  a comparison means adding one row.
- **`say` puts its pieces next to each other**: `say "Total: " total`. It reads
  naturally, but it has a catch: `say "a" -1` means subtraction. I accepted that,
  because brackets fix it and the common case stays clean.
- **Reserved words are kept to the ones that start a statement or a value** (22
  of them). Words that only appear in the middle of a statement, like `times`,
  `from`, `with`, and `than`, are still free to use as variable names.
- **Counting starts at 1** (`item 1 of fruits`), because that's what the words
  mean in English.
- **Errors teach.** A symbol from another language gets the Folio word back
  (`>` → "write 'is greater than'"), and `x is 5` on its own line suggests
  `set x to ...`. A misspelled name gets the closest real one ("Did you mean
  'total'?"). The compiler already knows every name a line can see, so it works
  this out once, using edit distance where swapping two letters counts as one
  edit. A line that starts with an unknown name also checks Folio's own words, so
  `sya "hi"` suggests `say`.

## 2. Variables are resolved when the program is read

A name inside a function means:

1. its own input, or a function it made with `to`; otherwise
2. for a name it sets, the variable of that name around it (in an enclosing
   function, or the top level) if that one is made above the function's `to`
   line, and otherwise its own local variable;
3. for a name it only reads, the variable of that name around it, wherever
   that one is set.

This gives closures for free (a counter's inner function can `add 1 to count`)
without a `global` or `nonlocal` keyword. Because it is decided at compile time,
each variable becomes a fixed (depth, slot) pair, and looking it up at run time is
an array index instead of a search by name. Until section 27, rule 2 didn't ask
where the variable was made, which was a trap.

**The one change from v1.** v1 decided this while the program ran, so the result
depended on whether a variable happened to exist yet. In this program, v1 said
`x` had no value, and v2 printed `1`; since section 27 it stops at `say x`
again, but now because f's `x` is f's own:

```
to f
    set x to 1
end
f
say x
set x to 2
```

v2's rule depends only on the text of the program, which makes it easier to
explain.

## 3. From a tree-walker to a bytecode VM

v1 walked the syntax tree with recursive JavaScript functions. That was simple,
but it had three problems:

- Folio recursion used the JavaScript stack, so it failed at about 1,000 calls deep.
- Every variable read searched a chain of scope objects by name.
- A running program couldn't be stopped, so v1 cut every program off after 10
  million steps.

v2 compiles each function to a flat array of numbers (36 opcodes, one of them only in debug builds) and runs it in
one loop with its own value stack and call stack. Best of 5 runs on a Ryzen 5
4600H with Node 24 (`npm run bench`):

| Program | v1 tree-walker | v2 bytecode VM |
|---|---|---|
| fib(25), function calls | 60 ms | 72 ms (1.2× slower) |
| sum 1 to 1,000,000, a loop | 163 ms | 61 ms (2.7× faster) |
| primes up to 5,000, lists | 320 ms | 113 ms (2.8× faster) |
| recursion 10,000 deep | fails | 6 ms |

**Calls are slightly slower.** v1's Folio calls were JavaScript calls, which V8
optimises very well. v2 has to build its own frame and variable array for every
call. That is the price of recursion up to 100,000 calls deep. Things I measured:

- Kept: avoiding `array.length = n` on the stack (calls became 27% faster) and
  a fast path for comparing two numbers (lists became 25% faster).
- Dropped, because they made no difference: storing frames as flat entries
  instead of objects, and building variable arrays with `push` instead of
  `fill` (loops got slower).

The next step for call speed would be reusing variable arrays for calls that
don't create closures.

## 4. Errors point at the exact spot

Every token records its line and column. Every syntax-tree node keeps the token it
came from, and every bytecode instruction keeps its node's token in a parallel
array. When the VM hits an error, it looks up the instruction it was running, and
`excerpt()` draws the line with a `^` under that spot.

## 5. The playground never freezes

Each run starts a fresh Web Worker. Stop calls `worker.terminate()`, which works
however busy the program is, so the playground needs no step limit. The worker
sends output every 50 ms while the program runs and shows at most 10,000 lines.
The step limit is still in `run(source, print, { maxSteps })`, because tests and
fuzzing need to run untrusted programs without a Stop button.

Share links keep the code in the URL's `#fragment`, which browsers never send to
a server. The page sets all output as text, never as HTML, so a shared program
can't inject anything into the page.

## 6. How it's tested

- **Every playground example** runs with its exact expected output.
- **Behaviour tables**: programs and their output, and broken programs and their
  exact error messages, including where the error points.
- **Fuzzing**: 5,000 programs made by randomly breaking real ones (deleting
  characters, repeating lines, swapping words). Each one must either finish or
  fail with a `FolioError` whose position is inside the code. It must never fail
  with a JavaScript error. The seed is fixed, so a failure always reproduces.
  About 15% of them finish, 30% fail while running, and 55% fail while being read.
- **Differential testing during the rewrite**: 19,001 fuzzed programs ran through
  both v1 and v2 and gave identical output and error messages. The only
  difference found was the intended one in section 2.
- **The tests were checked themselves**: I broke the interpreter on purpose
  (a wrong scope rule, a dropped `not`, missing type checks) and looked for a
  failing test each time. One got through: `-"a"` quietly gave `NaN`. That's how
  the `'-' needs a number` test got added.

## 7. The command line and the compiler

- **`vm.js` imports nothing.** The compiler (`folio.js`) and the machine
  (`vm.js`) only share the bytecode format. That's what makes `folio build`
  simple: it writes `vm.js`, the program's bytecode as JSON, and the source text
  into one `.mjs` file. The compiled program never tokenizes or parses
  anything, and it runs on any Node with no Folio installed. Tokens are reduced
  to their line and column, so a compiled program's errors still point at the
  right spot. The Counter example compiles to 16 KB.
- **The shell is a compiler session.** It keeps two things between entries: the
  compiler's map of top-level names to slots, and the machine's array of
  top-level values. Each entry is compiled as a continuation of the ones before
  it, and functions from earlier entries keep working because they hold that
  same array. An entry only changes the name map after it parses, so a typo
  leaves the session as it was.
- **"Is this block finished?"** If an error lands on the end-of-code token (a
  missing `end`, or `say 1 +` with nothing after it), the code stopped too
  early rather than being wrong. The shell then shows `....>` and waits for more
  lines, so the parser decides without a separate bracket counter.
- **Trade-off: Ctrl+C.** A Folio program runs on Node's main thread, so the shell
  can't catch Ctrl+C while a program runs. It puts the terminal back in normal
  mode during each run, so Ctrl+C ends a stuck program by ending the shell.
  Running each entry in a worker thread, like the playground does, would stop
  just the program. That isn't built yet.

## 8. The debugger

- **Pausing costs nothing when you're not debugging.** `compile(source, { debug:
  true })` adds a `LINE` instruction before each statement and at the top of
  each loop round. Normal builds don't contain it at all.
- **A machine that can stop and carry on.** The run loop lives in a `Machine`
  that keeps its state (stacks, current function, instruction pointer) between
  `run()` calls. `run()` stops when the program ends, or at a `LINE` when asked.
- **Time travel by recording, not by undoing.** Running backwards would mean
  undoing every change a program made. Instead, `timeline()` runs the debug
  build once and takes a snapshot at every `LINE`: the line, the calls, every
  variable in view, and how many lines had been said and drawn by then. Going
  back to any step just shows its snapshot, with the output and the drawing cut
  to those counts, so Back costs the same as Step, and the slider can jump
  anywhere. Recording stops at 10,000 steps, so a loop that never ends is cut
  short instead of hanging the page. The 7,673 steps of the Tree example take
  about 20 ms to record. The cost is memory: each snapshot keeps its variables
  as text.
- **Showing what a closure remembers.** Each compiled function keeps a link to
  the function it was made inside, and each variable array keeps a link to the
  array of the scope it was made in. The two chains nest the same way, so
  `inspect()` walks them together: the running function's variables, then those
  of each function around it, then the top level's. In the Counter example,
  stepping into `next` shows `count`, which lives in `counter`.
- **A slowdown, bisected.** Moving the loop's state onto an object made loops
  1.4× slower (61 → 86 ms). I tested each change on its own: closures over the
  hot variables, the slice check, the extra `LINE` case, a class method instead
  of a function, and saving state on exit. None of them mattered. What did was
  where the value stack was created. V8 makes `push` and `pop` fastest on an
  array it saw created in the same function. Each `run()` now creates a fresh
  local stack and copies in whatever a paused run left, and loops are back to
  60 ms.

## 9. Drawing

- **The turtle lives in the VM.** One `TURTLE` instruction covers `move`,
  `turn` and `pen`. The machine keeps the turtle's position, heading, pen color
  and width, and for each line it draws calls a `draw` callback with the two
  ends, the color and the width. The VM never touches a canvas, so the same
  program can draw in the browser, write an SVG from `folio run`, or be counted
  in a test.
- **Ends are rounded to hundredths.** Otherwise `cos(90°)` leaves lines ending
  at 6.1e-17, or even `-0`, which a test caught, instead of 0.
- **The canvas zooms out, never in.** A drawing that reaches past the edge is
  scaled to fit, and one that fits is drawn at actual size. During time travel
  the scale comes from the whole recording, so the picture doesn't jump while
  the slider moves.
- **Colors are the program's own text.** The canvas ignores a name it doesn't
  know and keeps the previous color. The SVG writer escapes the text before
  putting it in an attribute, so a "color" can't break the file.

## 10. The JIT: compiling Folio to JavaScript

- **Why it's fast.** The VM decodes every instruction and keeps every value on
  an array stack. The JIT turns each Folio function into a JavaScript function
  and each variable into a JavaScript variable named after its slot (`v1_2`), so
  V8 compiles the program to machine code and keeps its numbers in registers.
  Functions made inside functions become JavaScript closures, which behave the
  same way as the VM's chained scope arrays. Best of 5 on the same machine:
  fib(25) 67 → 7.2 ms, a million-round loop 56 → 7.5 ms, primes 106 → 17 ms.
- **One set of rules, two engines.** Every check and error message lives in
  `vm.js` as a small function that takes an `error` callback. The VM passes one
  that marks the instruction it was running; the JIT passes one per spot in the
  source. Both back ends build on `scope.js`, so they agree on what every name
  means. The JIT's helpers handle the two-numbers case inline and hand
  everything else to the shared checks.
- **Deep recursion.** The JIT's Folio calls are JavaScript calls, and JavaScript's
  stack runs out a few thousand calls deep. Folio programs can't read input or
  the clock, so running one twice says and draws exactly the same things. When
  calls go past 2,000 deep, the JIT stops and `run()` runs the program again on
  the VM (100,000 calls deep), passing on only the output the first run hadn't
  shown yet.
- **Why stop at 2,000, not when JavaScript runs out.** The fuzzer found that when
  JavaScript's stack ran out *inside* the callback that passes on a drawn line,
  the line had been counted but not shown, and the hand-over skipped it. A fixed
  depth of our own means the hand-over always happens at a known point. Output
  is also counted only after it has been passed on.
- **How it's kept honest.** Every table test runs on both engines, and 5,000
  fuzzed programs must give identical output, drawings and errors on both. Of
  three bugs planted in the JIT, one (a `repeat` loop not counting its steps)
  was caught only by that comparison.

## 11. The checker: mistakes found without running

- **Types for the whole program.** Each variable gets one type (number, text,
  yes/no, nothing, list or function) from every place that sets it. The
  types depend on each other, so the checker repeats until none change. If
  places disagree, the variable becomes "could be several" and the checker stays
  quiet about it. A type only ever moves from unknown, to one type, to
  "several", so this always settles. An `add` that is going to fail doesn't
  count towards the type, because the program stops there.
- **The real error, before it happens.** For each operation whose operand
  types are known, the checker calls the same shared check the engines use, on
  a sample value of each type, so a warning is word for word the error that
  line would stop with. Checks that depend on a value (dividing by zero, an item
  number below 1) only run when that value is written in the code.
- **Only what's certain.** Nothing inside the right side of `and` or `or` is
  treated as certain, since it might never run. Other warnings: names nothing
  sets (with "did you mean"), a function given the wrong number of inputs (only
  when the name is one function, made once), lines after a `return`, and
  variables and functions made but never used.
- **Tested against reality.** On 3,000 randomly broken programs, the test
  records which lines really run. A line the checker says will fail must never
  run in a program that finishes, a "never runs" line must never run, and when
  a program does fail where the checker said, the messages must match. The
  checker predicts 44% of runtime errors with no false alarms. The one known
  gap: it doesn't follow the order code runs in, so a name used before its line
  of `set` fails with "has no value yet" instead of what the checker said.

## 12. Records, `fail with`, and `load()`

- **Records are the smallest thing a compiler needs.** A syntax tree needs nodes
  with named parts, so Folio got `record with kind "set", name n`, `name of
  node` and `set name of node to ...`. A record is a JavaScript object with no
  prototype, so a field can be called anything, even `constructor`, and a
  misspelled field gets "did you mean". Both engines share the checks, and `is`
  compares records field by field, as it does lists.
- **Records with shapes.** At first a record was `Object.create(null)`, which
  V8 keeps as a slow dictionary. Profiling the neural network below showed
  records taking 40% of its time. Now a record is made by `new Record()`, whose
  prototype is an empty object with no prototype of its own: any field name
  still works, and records with the same fields share a shape, so V8 reads them
  fast. Reading a field skips the "is it really there" check, since no Folio value
  is `undefined` and nothing is inherited. Records got 2× faster on the JIT and
  the network went from 1.18 s to 0.62 s. Only the runtime changed, so the
  generated JavaScript, and the compiler written in Folio that matches it,
  stayed the same.
- **`fail with value`** stops the program with the value as its message and
  keeps the value on the error. The compiler written in Folio uses it to report
  a mistake in the code it compiles: `fail with record with at token, reason
  "..."`, which JavaScript turns back into a normal Folio error at that spot.
- **`load(source)`** runs a program and hands its top-level variables to
  JavaScript, with Folio functions as JavaScript functions. A failed call deep
  inside used to leave the JIT's call depth raised, so after a few thousand
  failed calls a short one was taken for runaway recursion. An error now resets
  the depth, since it ends every call in progress anyway.

## 13. Self-hosting: Folio's compiler, in Folio

[`compiler.folio`](compiler.folio) is a second compiler for the language,
written in the language: a tokenizer, a recursive-descent parser that builds
records, the scope rules, and a JavaScript writer. It writes exactly the
JavaScript `jit.js` writes, and stops at the same mistakes with the same
messages and positions.

- **Byte for byte, not "close enough".** Matching output means every decision
  has to be the same: the order positions are numbered in, when a temporary is
  made for `and`, how "did you mean" breaks a tie. That makes the JIT a precise
  spec, and the tests can compare whole programs with `===` instead of
  guessing what counts as the same.
- **Bootstrapping.** `compiler.folio` compiled by the JIT compiles itself. The
  compiler that makes compiles it again, and the one after that. All three
  stages write the same 94 KB of JavaScript, so the compiler has reached a
  fixed point. `folio bootstrap` runs it; each stage takes about 60 ms.
- **The language changed to make this possible, not the compiler.** Folio has no
  character codes, so the rules for reading text had to be ones Folio can
  follow with comparisons alone. Every control character now counts as a space
  (as in Wirth's Pascal compilers), comments run to the end of the line, and
  text can't hold a control character other than tab. Before, `\s` and `.` in
  the tokenizer's regular expression brought in Unicode spaces and line ends
  that Folio couldn't name. A character's width in columns (JavaScript counts
  an emoji as 2) is one comparison against the first and last characters past
  the 65,536 that fit in one unit.
- **Numbers go out as written.** The JIT used to print a number literal with
  `JSON.stringify`, so matching it would have meant writing JavaScript's float
  formatting in Folio. Now both compilers write the number as it appears in the
  source, without leading zeros (JavaScript reads `07` as octal). That turned up
  a real bug: `JSON.stringify` prints a number too big for a float as `null`,
  so a 400-digit literal was `nothing` on the JIT and `Infinity` on the VM.
- **One rule to watch.** A name a function sets belongs to the top level when
  the top level sets it too. So in `compiler.folio`, a name set at the top
  (`ats`, the tables) is never set inside a function, and the parser's helpers
  live inside `parse`, sharing its position the way the JavaScript parser's
  closures do.
- **How it's kept honest.** The tests run it beside the JIT on every example,
  every table program and 3,000 fuzzed programs. Of two bugs planted in it,
  one (the "did you mean" distance for short names) was caught only by the
  fuzzed programs. Writing it also found a crash in the real parser: a line
  starting with `constructor` looked up the turtle's words in a plain object
  and found `Object.prototype.constructor`.
- **Known gaps.** Folio sees text as whole characters, so it can't tell half of
  an emoji (a lone surrogate, which no file can hold) from a whole one. Its
  parser is 8 Folio calls deep per bracket and the JIT stops at 2,000 calls, so
  it gives up at about 245 levels of brackets, where the JIT goes past 1,000.

## 14. A neural network, written in Folio

[`neural.folio`](neural.folio) is a test of the language as much as a demo: a
real program, with recursion, records that point at each other, and thousands
of numbers, written the way a beginner would read it.

- **Autograd with records.** As in Karpathy's micrograd, every number the
  network works out is a record holding its value, how it was made (`op`,
  `a`, `b`) and its gradient. Backpropagation sorts the records so each comes
  after the ones it was made from (a recursive walk that marks what it has
  seen), then goes through them backwards, applying the chain rule for `+`,
  `*` and ReLU. The loss is micrograd's max-margin loss plus a little weight
  decay, so it needs no `exp`.
- **Its own maths.** Folio has no random numbers, no sine and no rounding. The
  program makes them: Park and Miller's random numbers (16807 × seed, mod
  2³¹−1, exact in a float because the product stays under 2⁵³), a whole-number
  part found one power of two at a time, and sine from 12 terms of its Taylor
  series. Because the random numbers come from a fixed seed, every run is the
  same, so both engines can be required to say and draw exactly the same things.
- **Two forward passes.** Training builds records so it can learn. Drawing what
  the network believes takes 1,440 guesses per picture, so a second forward pass
  works on plain numbers and makes nothing to learn from.
- **Pictures with a turtle.** The turtle only moves and turns, so the program
  keeps track of where it is and steers to each point. Each row of a picture is
  a few thick lines, one per run of cells with the same colour, which keeps four
  pictures to about 1,200 lines. The playground draws them as training goes.
- **Tested like the rest.** The test trains it on both engines and requires the
  same output and drawing, line for line, every dot on the right side at the
  end, and nothing for the checker to complain about. A bug planted in the
  chain rule for `*` left the network stuck at 50% and failed the test.

## 15. The WebAssembly engine

[`wasm.js`](wasm.js) compiles Folio to WebAssembly, the third engine. Nothing in
between: [`wasm-binary.js`](wasm-binary.js) writes the binary format itself
(LEB128 numbers, sections, the GC proposal's struct and array types), and keeps
a readable listing as it goes, which `folio wasm` and the playground show.

- **Folio's values, inside the module.** A number is a struct holding an f64,
  yes and no are `i31` values, nothing is null, and lists, records and
  functions are GC structs, so V8's garbage collector looks after them. A
  variable's slot starts as a shared `unset` struct, so "has no value yet"
  works as in the other engines.
- **One set of rules, three engines.** The common cases run in WebAssembly:
  arithmetic on numbers, comparisons, list items, fields, calls, loops. The
  rare ones and every mistake call out to the same checks in `vm.js` the VM
  and the JIT use, with the values copied out to JavaScript. So the error
  messages match by construction, and the fuzzer checks everything else.
- **Text stays a JavaScript string.** At first, text was an array of UTF-16
  units, and each trip to JavaScript copied it one letter at a time. The
  fuzzer found a program that doubles its text every round: JavaScript joins
  long text without copying, so the other engines reach its length limit in
  milliseconds, while this one slowed down exponentially. Now text is a struct
  holding the JavaScript string itself. Joining it costs what it costs in
  JavaScript, and it fails at exactly the same length.
- **Escape analysis.** A variable no inner function uses can't outlive its
  call, so it becomes a WebAssembly local, which the machine keeps in a
  register. Only captured variables go in a heap scope struct, and a function
  that captures nothing and makes no functions allocates no scope at all.
- **Unboxed numbers.** A variable that can only ever hold a number (every
  `set` gives it one, it counts in `for each ... from`, or `add` adds to it)
  lives in an f64 local, so `add i to total` allocates nothing. The set of
  such variables is a fixed point, as in the checker: assume all candidates are
  numbers, drop any that something else could reach, repeat. A box is made only
  when the number is used as a general value, and kept until the number
  changes. The box local starts as `unset`, which doubles as "has no value yet".
- **Divisibility, exactly.** WebAssembly has no floating-point remainder. For
  whole numbers below 2^52, a is divisible by b exactly when a equals
  trunc(a / b) × b: a quotient that is a whole number comes out of the division
  exactly, and every product here is a whole number that a float holds exactly.
  Fractions and bigger numbers call JavaScript's `%`. That took primes from 33 ms
  to 13 ms.
- **The validator as a second checker.** V8 rejects a module that breaks
  WebAssembly's type rules and names the function and the offset. It found a
  missing `ref.as_non_null` on the first run. The fuzzer found the rest: a
  loop counter in a local kept its value into the next run of the loop, since
  locals are zeroed only once per call.
- **Speed.** Best of 5 (VM / JIT / WebAssembly): fib(25) 67 / 6.8 / 4.7 ms, a
  million-round loop 55 / 7.1 / 2.6 ms, primes 104 / 17 / 13 ms, 200,000 records
  86 / 14 / 7.7 ms, the neural network 3.1 / 0.58 / 0.33 s. It is the fastest
  engine on everything that doesn't recurse past 2,000 calls, which it hands to
  the VM, as the JIT does.
- **Limits.** Browsers won't compile a module over 4 KB on the page's main
  thread without waiting, so runs compile it in the Web Worker, and the
  Compiled view only builds the bytes and the listing. It needs WebAssembly GC
  (Node 22, Chrome 119, Firefox 120, Safari 18.2).

## 16. stop, text helpers, ask and use

- **`stop`** leaves the innermost loop. The VM pops the loop's own values off
  its stack (one for `repeat`, two for `for each ... from`) and jumps to its
  end, the JIT writes `break` (every Folio loop is a JavaScript loop, and
  nothing else is), and WebAssembly branches out of the loop's block, counting
  how many blocks are open to know how far. A `stop` outside a loop, or in a
  function inside one, is a mistake the parser points at.
- **One table of built-in operations.** `uppercase of`, `lowercase of`,
  `split ... by`, `join ... with`, `number of` and `position of ... in` are
  rows in `BUILTINS` in vm.js: a name, what each input must be, and what to
  do. Each checks its inputs' kinds before anything depends on their values,
  and every engine runs the same table (the VM with one instruction, the JIT
  with one helper, WebAssembly with one import), so results and mistakes match
  by construction. The checker reads the same `needs` to warn about an input
  of the wrong kind before the program runs, and stays quiet about values,
  like `number of "abc"`, which only running can tell.
- **`ask` without giving up replay.** The JIT and WebAssembly hand deep
  recursion to the VM by running the program again, which only works if a
  second run does the same things. `ask` is the one way a program can learn
  something new, so `run()` keeps every answer, and a second run gets them
  again instead of asking. The playground uses the same idea: a Web Worker
  can't stop and wait for the page, so a question ends the run, and once it's
  answered the program runs again from the start with every answer so far,
  and the page shows only what's new. The debugger replays the last run's
  answers.
- **`use` is splicing, not modules.** A used file's statements join the
  program's top level, once, however many files use it. That keeps every back
  end unchanged: they still see one program. Tokens remember their file, so a
  mistake in one says `math.folio, line 40`, and the CLI shows that file's
  line. Files that use each other in a circle are a mistake, found by keeping
  the files being read on a stack. The cost of splicing is a shared top level:
  a library's helper variables can collide with a program's, which `use ...
  as` (section 18) fixes without giving splicing up.
- **The compiler written in Folio keeps up.** Each feature went into
  `compiler.folio` too (with `stop`, `join`, `lowercase` and `position` now
  Folio words, its own names for them changed), and it still compiles itself to
  exactly the JIT's JavaScript.

## 17. Reading handwriting

- **No dataset.** The network learns from digits Folio draws: each digit as
  pen strokes, in a few of the ways people write it, bent at random each time
  (tilted, slanted, stretched, shaky, strokes not quite meeting). Mouse
  drawings are strokes too, which is why this works at all.
- **One road to a picture.** A drawing travels as text (`"x,y x,y;x,y"`), the
  same format the shapes are written in, and both become a 16×16 picture the
  same way: scaled to fill the middle 12×12 pixels keeping their shape (so a 1
  stays thin), then drawn with a pen whose ink fades over its last pixel.
- **Speed where it counts.** Only inked pixels take part, forwards and
  backwards, which is most of the speed: 3,000 pictures, 10 rounds, about 7
  seconds on WebAssembly. Training starts from a fixed seed, so running it
  again writes the same model file.
- **Train once, read instantly.** The trained weights are printed as Folio
  (`set model_hidden_weights to list of ...`), with the training progress as
  comments, so the model is a file the reader can `use`, and each guess is
  just one pass through the network.
- **Honest limits.** It reads 99% of new drawings of the shapes it knows. The
  test draws ten digits differently (other proportions, a sloppy 8, off to one
  side) and it reads all ten, but it has never seen a person's handwriting, so
  unusual ways of writing a digit can fool it.

## 18. For real programs: try, dictionaries, bytes, files and modules

- **`try` in three engines.** The VM keeps a stack of handlers: where each
  `if it fails` starts, and how deep the calls and the value stack were, so a
  mistake deep inside calls unwinds to the right place. The JIT writes a
  JavaScript `try`/`catch` and puts its call-depth counter back. WebAssembly
  uses its own exception handling, but only JavaScript can tell a Folio mistake
  from going too deep, so a `catch_all` asks it, and passes on what isn't
  ours. Running past `maxSteps` is never caught: a loop that never ends must
  stop, `try` or not.
- **Dictionaries are JavaScript Maps,** with text or numbers for keys, so
  `"1"` and `1` are different keys and the order things were added is kept.
  In WebAssembly, a dictionary is a struct holding the Map, and the Map holds
  the module's own values, so a list put in a dictionary and changed later is
  the same list. A missing key gets a "did you mean" from the keys there.
- **Bytes are a Uint8Array,** checked on every write: a byte is a whole
  number from 0 to 255, or a mistake. Bits work on whole numbers up to 2^53 −
  1, the most a double holds exactly: JavaScript's own bit operators only take
  32 bits, so the high and low parts go through them separately, and `shift`
  is multiplying or dividing by a power of two. Nothing wraps around or rounds
  without saying so.
- **Files without losing replay.** The JIT and WebAssembly hand a program
  that goes too deep to the VM by running it again from the start, which only
  works if the second run sees the same world. `run()` already kept every
  answer to `ask`; now it keeps a log of everything from outside, in order:
  each answer, each file read, and how each write went. The second run is
  served from the log until it catches up, so it reads what the first run
  read, even if a write changed the file since, and writes nothing twice. Where
  the files are is the caller's choice: the folder `folio run` runs in, or files
  in memory that last one run in the playground.
- **Modules are renaming.** `use "math.folio" as math` still splices the file
  in, so no engine changed. But first, every name the file's top level makes
  becomes `math's sine`, which no name in a program can be. Renaming is
  careful about scope: inside the file, a function's inputs and the functions
  it makes itself hide the top level's names, so those are left alone. Using
  the same file as two names gives two separate copies. The JavaScript
  version walks the syntax tree generically; the compiler written in Folio,
  which can't list a record's fields, walks it kind by kind, and the tests
  check both rename alike.
- **One rule for messages.** The checker warns by running the real checks on
  sample values, so a message may only depend on what the checker knows: the
  kind of a value, not the value. The fuzzer found a message that showed a
  wrong value (`'bytes' needs a whole number in front of it, not (5 bytes:
  ...)`) and the checker's sample showed a different one, so wrong kinds are
  now named by kind (`not bytes`), and only a number that's wrong as itself
  is shown.

## 19. Trails, speed, tests and tidying

- **Error trails.** A mistake inside functions lists the calls that led to it,
  innermost first. Each engine already knew its calls in its own way, so each
  reads them its own way: the VM walks its frames (a frame is saved by a CALL
  with two operands, so the call it made is three instructions before where it
  returns to), the JIT keeps two arrays beside its depth counter (the function
  and the call's position, one store each per call), and WebAssembly keeps both
  in an i32 array inside the module, read through three exports when JavaScript
  builds the error. A function that called itself from one spot is one line
  with a count, so even the VM's 100,000-deep recursion is two lines. The
  fuzzer now compares trails too: the same message at the same spot isn't
  enough, the same calls must have led there. The cost is about 10% on fib.
- **WebAssembly, without the trips.** Bytes and dictionaries went to
  JavaScript for every read and write, which made a million-byte loop 20 times
  slower than the JIT. Bytes now live in the module as an array of 8-bit
  numbers, so a byte is one instruction. A dictionary is still a JavaScript Map
  (text keys can only be hashed in JavaScript), but the module hands over the
  Map and the key as a plain string or number, with nothing to convert, which
  makes it as fast as the JIT. Bit operations on numbers below 2^31 are single
  instructions, with a shift left only up to 21 places and right up to 31, so
  the answer is always exact; anything outside those edges goes to the shared
  code, and a test checks the engines agree right at each edge.
- **`expect` and `folio test`.** `expect` keeps both sides of its comparison, so
  a failure can say what they were: `expected 6 to be 5`. A test is a function
  named `test_...`, and each runs in a fresh run of the whole file, so one
  can't spoil another: the simplest isolation, which costs a run of the file's
  top level per test. The call that starts a test is left out of its trail.
- **`folio fmt` asks the parser.** Indenting by keywords goes wrong in a
  language where `to` starts a function and also ends `set x to`, and where
  `label -1` in a record is a negative number while `x - 1` is a subtraction.
  So the parser records how deep each statement starts, which bracket opens a
  call and which minus makes a number negative, and the formatter only lays
  out what it is told. It checks its own work: the tidied code must read
  exactly the same, piece for piece, or nothing is written. Every `.folio` file
  here was already tidy, the 1,500-line compiler included, which says the
  rules match how Folio was already being written.
- **Tools as tests of the language.** Writing `picture.folio`,
  `wordcount.folio` and `json.folio` found two precedence surprises in my own
  code (`read` and `shift ... by` take everything up to the next comparison),
  and the trail pointed straight at the second one. They also show a gap: Folio
  has no word for asking what kind a value is, which is why the JSON tool
  reads JSON but doesn't write it.

## 20. Hunting bugs

- **Programs from the grammar.** The fuzzer breaks programs that already
  exist, so it rarely builds anything new. `generate.js` makes new ones from
  the grammar, every feature mixed in, with a sensible value in each variable
  to start and some lines wrapped in `try`, so they get further before a
  mistake. Each must run the same on all three engines, compile to the same
  JavaScript in the compiler written in Folio, run the same once tidied, and
  get no false alarms from the checker. 12,000 of them found one bug, which
  every engine shared, so only tidying caught it: an `if` on the line after
  an `else` was read as `else if`, so ordinary nested code failed.
- **Gaps found by looking.** A list that holds itself stopped the program
  with "a value got too big" when shown (now `[1, [...]]`, and comparing two
  of them doesn't go round for ever); a file used plainly inside a module was
  read once for everyone, so the program's own use of it was skipped; and a
  built program couldn't `ask`.
- **Measure, then fix.** Typing in the playground's longest example felt
  slow, and the checker, which runs on every key, looked to blame. Measuring
  said otherwise: it took 8 ms of 120. The rest was rebuilding all 4,355
  coloured spans and Chrome laying out all 1,592 lines again, because they
  were one block of text. Now each line is its own block and only changed
  lines are redrawn: 30 ms. Tidy's freeze was the same lesson: tidying took
  50 ms, putting the result in with the browser's undoable insert took 17 s.

## 21. Apps

- **Handlers, set up once.** `when a key is pressed` and `every 100
  milliseconds` only work at the top level, so an app's handlers are a fixed
  list, made while the program sets up. Each is a function over the program's
  own variables, which is how a timer and a key share a game's state. `run()`
  hands back the app: what it waits for, and a way to send it an event. Each
  event gets its own step limit, since a game left running for an hour would
  run out of any shared one.
- **The same app on every engine.** The JIT and WebAssembly hand a program
  that goes too deep to the VM by running it again from the start. An app can
  be deep in an event when that happens, so the VM runs the set-up again, then
  every event sent so far, with the same answers, files and random numbers
  (everything from outside is logged for exactly this), and only then the event
  that went too deep.
- **Randomness comes from outside.** `random number from 1 to 6` asks whoever
  runs the program for a number: `folio run` and a built page give real ones,
  tests give a fixed sequence, and the playground picks a new start for each
  Run but keeps it while the program waits for an answer, so running it again
  up to the question gives the same numbers.
- **A picture that can be redrawn for ever.** `clear` wipes the picture, and
  the playground only keeps what came after the last one, so a game that
  redraws every frame never grows. An app's picture never zooms out the way a
  drawing does, because a click has to land where the thing was drawn.
- **The playground keeps an app running** in its worker, timers and all, no
  more often than every 10 ms, and sends it keys only while the picture has
  the focus, so typing in the editor never reaches the game. Trying it found a
  bug the tests couldn't: the picture took the focus before it was shown, so
  it never had it, and no key arrived.
- **`folio build --web`** makes one HTML file, about 70 KB for Snake: the VM,
  the bytecode, and a short script that draws and sends events. Only the VM,
  because it's the smallest of the three and never too deep. `ask` uses the
  browser's own box. Text in the program can hold `</script>`, which would end
  the page's script early, so every one is written `<\/script>`, which reads
  the same to JavaScript.

## 22. Folio without JavaScript: the Rust engine

- **Why another engine.** Every engine so far runs inside a JavaScript engine,
  so a bug in JavaScript could reach any Folio program. [`native/`](native/) is
  Folio again, from the first character to the last instruction, in Rust with no
  libraries: about 3,000 lines for the lexer, parser, compiler, virtual machine,
  turtle and command line.
- **The same bytecode, so it can be checked.** The compiler makes exactly what
  folio.js's does, instruction for instruction and constant for constant, so
  `folio-native bytecode` and `folio bytecode` print the same text. That splits
  every disagreement in two: different bytecode is a front-end bug, the same
  bytecode with a different result is a machine bug.
- **Numbers, bit for bit.** Rust's shortest float printing picks the same digits
  as JavaScript's except in a tie, where Rust rounds up and JavaScript picks the
  even digit (`-2.6916885375976562`, not `...563`): 2,719 of a million random
  numbers. Ties only happen at 16 or 17 digits, so only those are checked.
  Sine and cosine are fdlibm's, as V8 has them, ported line by line: a library
  sine can differ in the last bit, which moves a drawing's rounding. Both were
  checked against V8 on a million numbers, with no difference.
- **Text as JavaScript sees it.** Columns count UTF-16 units, so mistakes point
  at the same spot after an emoji; text compares by UTF-16 units too
  (`"！" is less than "😀"` is no in JavaScript, though its code point is
  smaller); and every character's upper and lower case is checked against V8.
- **Checked on 80,000 programs.** `native.test.js` sends programs to
  `folio-native conform`, which runs each and reports what it said, drew,
  wrote and failed with, and its bytecode, for the test to hold up against the
  JavaScript VM. On every push: the tables, the examples, 5,000 broken and
  1,500 generated programs, the bundled programs, and the compiler written in
  Folio compiling itself. Once, by hand: 80,000 more from other seeds, with no
  difference. A one-character bug planted in an error message failed two tests.
- **One bug found by timing.** Dictionaries first used a fast hash that only
  mixed the high bits, and a whole number's float has all its low bits zero, so
  300,000 number keys all landed in the same few places: 22 seconds instead of
  0.14. A final mixing step fixed it.
- **Where the engines can differ.** JavaScript stops code nested more deeply
  than its stack allows (about 900 brackets) and values held more deeply (a
  list 2,000 deep), and those limits change with the stack's size, so they
  already differed between the command line and the playground. The Rust
  engine goes further, then stops with the same message.
- **WebAssembly with no JavaScript.** The same Rust code builds for WASI, the
  standard system interface of WebAssembly, into one 750 KB file whose only
  imports are 17 WASI calls (files, the clock, standard input and output,
  random numbers, arguments), so a WebAssembly runtime runs it with no
  JavaScript anywhere. The one change is the stack: a runtime may give
  WebAssembly as little as half a megabyte, so that build stops code nested
  past 500 levels and values past 1,000 with Folio's own message, where the
  stack would have run out with a crash. CI runs it in wasmtime, a runtime with
  no JavaScript in it. Node 24's own WASI runs it too, so the tests use that
  when wasmtime isn't there, but Node 22's crashed on it with a segfault inside
  Node, even for a two-line program: a reason to test in a real runtime.
- **Folio builds itself without JavaScript.** compiler.folio gained a second back
  end, about 500 lines of Folio, that writes the bytecode folio.js's compiler
  makes, in a text format both it and the Rust engine read and write
  (`folio-native build`, `folio-native run x.folioc`). Its first run matched the
  Rust compiler byte for byte on compiler.folio's own 283,823 bytes, and the
  tests hold it to that on 630 programs and 1,500 broken ones. Then `folio-native
  bootstrap` runs compiler.folio on the Rust engine to compile itself, runs what
  that made to do it again, and again: Folio's compiler, written in Folio, run by
  Rust, building itself, with JavaScript nowhere in the loop.
- **Numbers as written.** compiler.folio keeps number tokens as text, and the
  bytecode keeps each number constant as it was written (`const number 0x1F`),
  which both compilers have, so neither has to print a float the other can
  match: Folio itself shows numbers to 15 digits (section 23), which would lose
  the rest. The reader makes the number from the text, `0x` and `0b` included,
  as JavaScript's `Number()` would.
- **The old trap, once more.** In Folio a `set` inside a function changes a
  variable of the top level with the same name, and defining a function counts.
  The new back end's helper `here` would have been overwritten by `resolve`'s
  own `set here to scope`, as `place` was before: it's `code_length` instead.

## 23. Everyday numbers and data

Seven features meant to make Folio better than Python at the things people
first program for: sums of money, trips, recipes, spreadsheets. Each runs on
all four engines, the checker and the compiler written in Folio, and the tests
hold them to agreeing.

- **Fix buttons.** A misspelled name or a symbol from another language already
  got a message saying what was meant; `suggestedFix` turns that into an edit
  (the spot, what's there, what goes there), checked against the code so it only
  replaces what the message names, and the playground puts a **Fix** button on
  the problem.
- **Inputs that say what they are.** `to area with width as a number` stores a
  kind for each input; a call checks them after it checks how many there are,
  so the message names the input: `'area' needs width to be a number, not
  text`. A function whose inputs say nothing carries no list at all, so calls
  to it cost nothing more. The checker starts each such input with that type,
  which lets it see more mistakes inside the function.
- **Numbers like a spreadsheet.** Arithmetic stays the computer's own: binary
  floats, fast. What changed is what a number counts as. `canon(x)` is x to 15
  significant digits (`Number(x.toPrecision(15))`), and a number is shown,
  compared, used as a key, an item's place or a count of times by its canon:
  `0.1 + 0.2` shows as `0.3`, is `0.3`, and finds the key `0.3`. Most
  comparisons never call it: two equal numbers, two whole numbers, or two
  further apart than 15 digits can tell are answered at once, so loops of whole
  numbers run as fast as before. The Rust engine rounds to 15 digits with
  `{:.14e}`, which breaks a tie to the even digit where `toPrecision` goes up;
  a tie only happens when the number is exactly 16 digits long ending in 5, so
  that one case is rounded by hand from all of the float's digits.
- **Units.** `5 km` is an amount: a number and a unit's place in one table,
  which every engine has in the same order. Amounts of one measure add,
  subtract and compare in the left one's unit (`5 km + 300 m` is `5.3 km`),
  `in` converts, and anything else is the same mistake as any other wrong
  kind: `can't use '+' on a distance and a time`. A unit's word only counts as
  a unit straight after a number written out (or after `in`), so `say "Day " day` still means
  the variable. In WebAssembly an amount is its own struct of an f64 and an
  i32, so it never touches the dictionary code that `T.host` values go through.
  One optimisation had to give: WebAssembly kept a variable unboxed when every
  value it got was "a number or a mistake", and `-`, `*` and `/` counted as
  that. Now `2 * x` can be an amount, so a product only counts when both sides
  are numbers; a difference or a quotient still counts when its left side is,
  since a number less (or over) an amount is a mistake.
- **Tables.** `read table "sales.csv"` is the builtin `table` around a `read`,
  so files, sites and the permissions below come for free. Each row is a
  record named by the header, folded to lower case with `_` for anything else
  (`Unit Price` is `unit_price`); headers starting with a digit get `column_`
  in front, because JavaScript puts number-like keys of an object first and
  the Rust engine keeps the order it was given. Empty cells are nothing, and
  `total of`, `average of`, `largest of` and `smallest of` skip them, as a
  spreadsheet does. `for each row in sales where ...` is only parsing: the body
  becomes an `if`, so no engine needed a change. After `total of`, `price in
  sales` is always a column, even when the second word is also a unit's (`steps
  in week`): that clash came up in the first example written with it. A row reaching WebAssembly
  from JavaScript needs ids for its field names, which only exist for names in
  the program, so a new name gets the next id when it arrives.
- **Charts.** `draw chart of` is a turtle action like `draw box`: one function
  in vm.js and one in Rust work out the bars (the longest 200 long, each 30 wide)
  and draw boxes and text, rounded as every drawing is, so the pictures match
  byte for byte.
- **Asking first.** `folio run` and `folio-native run` give a program a disk that
  asks before each file it reads or writes and each site it reads, the way
  Deno does: a person at a terminal is asked; a script gets no, unless folio was
  started with `--allow-read`, `--allow-write`, `--allow-net` or `--allow-all`.
  A refusal is an ordinary mistake, so `try` catches it. Reading a site has to
  wait for it, since `read` gives its answer at once: Node fetches it in a
  second Node and waits for that to finish, the Rust engine runs `curl`, and the
  playground's worker uses a request that waits, which only workers may do.
- **Closing the gaps.** A look at the first version found five ways round it.
  `use` read any file without asking, and a mistake in it printed its lines, a
  secret's included: now every parser refuses a name that starts at the top of
  a disk or goes up out of a folder, and the command lines refuse a link that
  leads out of the program's folder. `folio test`, and programs made by `folio
  build`, didn't ask at all: now they do, sharing one set of answers for every
  test, and `folio build` builds in the flags it's given (`disk.js`, which holds
  all of this, is copied into the program it makes). `--allow-write` was
  everywhere or nowhere: now it can name folders, checked where each file
  really is, links followed, so `data/../notes.txt` or a link inside `data` that
  leads out isn't in `data`; `--allow-net` names sites, and an address written in
  any odd way (`a.com@b.com`, a backslash) matches nothing. And a site could send
  the program on to any other: neither Node nor `curl` follows a site now; each
  new address is asked about again, ten at most. The question shows a file's
  name with anything that moves the cursor or turns text around made `?`.

## 24. Speed: a faster engine, and machine code

- **A faster Rust engine.** Built as one unit with link-time optimisation, which
  alone took 30% off. Each function's code is read out once into instructions
  that hold their operands (`Ins`), instead of each operand being looked up as
  it runs. A function that makes no functions (`is_flat`) keeps its variables
  on the machine's own list, so a call makes no environment. And a few pairs and
  triples that come up all the time run as one instruction (`fuse`): a count
  loop's next number and its variable, `n is less than 2`, `n - 1`, `a + b`, a
  `get` then an `add`. Those leave the instructions after them where they are,
  so a jump into the middle still works, and each fails exactly where its part
  would. Calls got 1.9 times faster, loops 1.7, lists and bytes 1.4 to 1.6; the
  bytecode itself didn't change, so it still matches compiler.folio's.
- **Machine code by way of Rust.** `folio-native build --exe` (exe.rs) writes the
  program as Rust and has rustc finish the job. It starts from the bytecode, not
  the program's text, so every name is already resolved and every instruction
  knows its place for a mistake. Each function's bytecode becomes a Rust
  function: the stack becomes local variables (its depth at each instruction is
  worked out first), each block of straight-line code a branch of a `match` in a
  loop, a jump a change of state, and a `try` a list of the blocks its `if it
  fails` starts. LLVM's DFA jump threading, which is off unless asked for, turns
  that loop back into jumps straight from block to block: twice as fast.
- **One set of checks.** Every instruction's work, with its checks and its
  messages, moved out of the machine's loop into functions the machine and the
  compiled code both call (`got`, `compare_values`, `add_to_value`, `said` and
  thirty more), so the two can't say different things. The machine got no slower.
- **Numbers as numbers.** What a stack place holds is worked out for each
  instruction: a number, yes or no, an iterator, or anything. A number lives in
  an `f64` and yes or no in a `bool`, made into a value only where one is
  needed. A variable is a number for good if no inner function sees it, every
  `set` gives it a number (an `add` to a number gives one or fails), and it isn't
  an input, unless it says it's a number, which every call checks. A million-round
  loop then takes 2.5 ms, faster than WebAssembly's 6.5. A `for each` keeps its
  own copy of the items and a place in them, as the machine's iterator does but
  with nothing shared to borrow at each step, and moves each item out instead
  of copying it: lists got twice as fast.
- **Checked as everything else is.** A test builds one program holding 700
  compiled programs, which answers `conform`'s jobs as the engine does, and holds
  each to the engine's output, drawings and mistakes, trail and all; Folio's own
  compiler, compiled to machine code, compiles itself to the same bytecode.
- **What's still slow.** A call checks its inputs and finds its function by name
  each time, and lists, records and dictionaries are the engine's own values
  behind reference counts and borrow checks: about twice the Rust engine's speed,
  but behind V8, which inlines, guesses types and keeps objects in shapes. A big
  program is slow to build: compiler.folio is 1.3 MB of Rust, and rustc takes
  minutes over it.

## 25. Machine code from Folio alone: machine.folio

- **Why.** Every engine so far stands on JavaScript or on Rust, and the machine
  code from §24 needs rustc. machine.folio is a compiler written in Folio that
  writes the machine code itself, so once it takes the parts of Folio its own
  code uses, it can compile itself and Folio needs neither.
- **The same front.** It starts with `use "compiler.folio" as front`: the same
  tokenizer, parser and scope rules, so a name means what it means in every
  other engine, and a mistake in the program is reported as `folio run` would.
- **Its own assembler.** An encoder for the x86-64 instructions it needs (one
  function for the ModRM byte, one for each instruction), labels, and 32-bit
  distances filled in once everything has its place. Code that only runs when
  something goes wrong goes into a separate `cold` list, placed after the rest,
  so the code that runs stays together.
- **Values.** Every value is 8 bytes: a number is itself, and nothing, no and
  yes are NaNs that arithmetic never makes. `a + b` is one `addsd`, then one
  check of whether the answer is NaN; only then does it look closer, and either
  stop with "can't use '+' on nothing and a number" or carry on with the NaN. A
  variable with no value yet holds another NaN, so reading one is one compare.
- **Frames and trails.** Main's variables live in the data, a function's in its
  frame. Every call puts its number just under where the new frame's rbp points,
  so a mistake walks the frames and turns each into "in 'f', called from line 3",
  a run of the same call into one line. r15 counts the calls in progress, which
  stop at 100,000 as every engine's do.
- **Showing numbers** as JavaScript does after rounding to 15 digits, which took
  four ways: a whole number below 2^53 as its digits; any other number from its
  first 16 digits, worked out exactly with a 128-bit fraction and rounded half
  up as `toPrecision` rounds; a whole number from 2^53 up with the fewest digits
  that read back as it (Steele and White's method, as Burger and Dybvig put it),
  with 1,280-bit whole numbers; and a number below 2^-1021, which has fewer
  digits than 15, as the shortest digits of the double nearest its 15 digits.
  That last one was found by testing against the engine: the first version gave
  4.94065645841247e-324 where Folio says 5e-324.
- **Comparing numbers** to 15 digits: two numbers far apart compare as they are;
  two close ones as 17-digit decimals, which is exact, since different 15-digit
  numbers are always different doubles; and two below 2^-1021 as their doubles.
- **The files.** For Windows a PE32+ file whose imports are six kernel32
  functions: `WriteFile`, or `WriteConsoleW` after `MultiByteToWideChar` for a
  console, so every character shows. For Linux an ELF file with two segments, a
  256 MB stack of its own, and the `write` and `exit_group` system calls. Output
  waits in a buffer, and goes out after every line at a terminal.
- **A trap.** A function in a file used `as front` that sets a name the program
  also sets at the top level changes the program's: compiler.folio's `resolve`
  has `set here to scope`, which replaced machine.folio's function `here`. It's
  named `mark` now.
- **Speed, and what's next.** Values wait on the stack and a comparison is a call
  into the runtime, so there's room left, but fib(30) takes 0.08 s from start to
  finish, against 0.21 s with `folio run` and 0.42 s with `folio-native run`, and
  30 million rounds of a loop 0.16 s against 0.33 s and 1.05 s. Next it needs
  text, lists and records, which need memory that grows.
- **Memory, text and lists.** A value that lives in memory is a pointer whose top
  16 bits say what it is, which makes it a NaN arithmetic never makes, so a sum
  of two numbers still costs no more than before. A text is its length in
  bytes and in characters, and where its UTF-8 bytes are, which have a block of
  their own, after how many of its bytes are used and how many it has room
  for: a text that ends where its block's used bytes end grows in place, so
  `add c to text` in a loop copies each character a few times at most, not the
  whole text each time. A character of a text is a text that shares its bytes.
  What `say` says, what `+` joins and a mistake's message are all put together
  in one builder that grows as it needs to. Text sorts by its UTF-16, as
  JavaScript's does, and stops at JavaScript's longest text with the engines'
  mistake.
- **Records and dictionaries.** A record keeps its fields in order, each named
  by one of the program's own texts, so finding a field compares pointers. A
  dictionary keeps its entries in the order keys came, with an index beside
  them to find one by its hash; a removed entry keeps its place, marked. A
  number key is the number to 15 digits, as the engines' are, which needs the
  double nearest a 15-digit decimal: one exact division when the power of ten
  is 10^22 or less, and big whole numbers below that. A misspelled field or key
  gets the engines' "Did you mean ...?", from the same edit distance over
  UTF-16.
- **`try`.** A `try` puts a record on the stack: the calls in progress, the
  frame, where its `if it fails` starts, and the try further out. A mistake
  checks for one before it writes anything: the message without its place, or
  what `fail with` gave, becomes the caught value, and the stack and frame go
  back to the try's. A `stop` or `return` inside one takes it off first.
- **The helpers, and bytes.** `number of` reads text as JavaScript's `Number()`
  reads Folio's numbers: up to 2^53 times or over a power of ten up to 10^22 is
  one exact step, and anything else is a first guess on the x87, at its 64-bit
  precision, then moved a step at a time with big whole numbers until it's the
  nearest double. Bytes read as text the way TextDecoder reads UTF-8, each
  broken part a U+FFFD.
- **Functions as values.** A function is a value like any other: where its
  code is, the variables it was made among, and a description of its inputs.
  A function that makes functions keeps its variables in memory, not in its
  frame, with a link to the variables further out, so the functions it makes
  can still use them after it returns; one that makes none keeps them in its
  frame as before. A function made once at the top level, whose name nothing
  else sets, is still called straight; any other call checks the value is a
  function, then its description checks the inputs, with the engines'
  mistakes. Every frame now holds the function's number as well as the call's,
  so a trail names the function that ran, not the name it was called by.
- **A garbage collector.** At first memory came from the system 64 MB at a time
  and was never given back, which was enough for programs that run and end,
  but machine.folio compiling itself took 9 GB and ran out. Now blocks come in
  38 sizes, from 16 bytes to 32 KB, a 64 KB page holding blocks of one size and
  anything bigger getting whole pages; a bitmap beside them, a bit for each 16
  bytes, says where a block that's been handed out starts. After 64 MB of new
  pages, or as much again as was live after the last collection, it marks
  everything it can reach from the stack, the registers, the program's
  variables and the runtime's own, looking through every word of every block
  that can hold values, and gives the rest back. It's conservative: any word
  that could be where a block is counts, a tagged value or a plain address, so
  the runtime's code needs no maps of where its pointers are, and nothing
  moves. Blocks that never hold values (a text's bytes, a dictionary's index)
  aren't looked through. machine.folio now compiles itself in machine code in
  1.9 s and 535 MB, into exactly the bytes it makes on Node.js.
- **The trap, a third time.** The first try at that ran out of memory even with
  the collector, which looked like the collector keeping what it shouldn't. It
  was the test: the program that used machine.folio had top-level variables
  called `total` and `k`, and since a file used `as` a name shares its
  functions' variables with the program's top level, machine.folio's own loops
  counted with them and never ended.
- **Long lines.** Each place a mistake can happen kept its own copy of its line,
  for the excerpt under the message, so the trained handwriting network, whose
  weights are lines of 8,000 numbers, each `-` a place, made hundreds of
  megabytes and broke the compiler. Now a line and its marker are kept once,
  and each place keeps only how many of the marker's bytes go before the `^`:
  4,000 negative numbers on a line went from 53 MB of program to 419 KB. The
  digit reader then runs as a program of its own, 3.5 times as fast as `folio
  run`, and training it 2.3 times.
- **Upper and lower case.** JavaScript's toUpperCase and toLowerCase know all of
  Unicode, and machine code has nothing of the kind, so tools/case-tables.mjs
  asks Node.js what each character past ASCII becomes and writes the answers
  into machine.folio as runs (a first character, a last, a step of 1 or 2 and
  what to add): 197 for upper case and 184 for lower, the 102 that become more
  than one character (ß becomes SS), and the ranges of cased and
  case-ignorable characters. ASCII changes on the spot, anything else is found
  by halving. A Σ in lower case is ς at the end of a word, when a cased
  character comes before it and none after, skipping case-ignorable ones, as
  ICU decides it. Tested on every character there is, both ways, against the
  JavaScript engine; only a program that changes case carries the tables. The
  Rust engine's tables are a Unicode version behind, so it differs on 56.
- **Files, questions and arguments.** `read`, `write`, `ask` and `arguments`
  do what they do in a program `folio-native build --exe` makes, which `folio
  run` matches. A file is read or written, or a site read, only once the
  program may: the `--allow` flags it was built with, kept in its data, say
  what it may do without asking; otherwise a person at a terminal is asked,
  once for each file or site (or for all of them, with `a`), and anywhere else
  the answer is no. A flag that names files or folders allows them and what's
  in them, once each is where it really is: on Windows from
  `GetFinalPathNameByHandleW`, on Linux from the link `/proc/self/fd/N` the
  system keeps for a file opened with `O_PATH`. On Windows a file's name
  becomes the path Rust's own library opens (`GetFullPathNameW`, then `\\?\`),
  so a name ending in `/` or `.` means the same as there. A file that can't be
  read or written says what folio-native says: Node's words for a folder, a
  missing file and one the program may not have, and the system's own for the
  rest (`FormatMessageW`, or glibc's words on Linux). Input comes a line at a
  time through a buffer that keeps what came after the line, for `ask` and
  for a question alike, and from a Windows console as UTF-16, through
  `ReadConsoleW`, as Rust reads it. Linux's arguments come from the stack the
  program starts on, Windows' from `GetCommandLineW`, split as Rust's
  `std::env::args` splits it. File bytes come from `rt_alloc_raw`, and the
  values the runtime keeps (the file's name, why it failed, and what a person
  answered) sit among the collector's roots. It couldn't go online at first,
  so a site the program might read said it couldn't be reached; §33 is how it
  goes online now.
- **folio.exe.** folio.folio is the command line, in Folio: `folio build file.folio`,
  with `--target` and the `--allow` flags. It reads the program, then every
  file a `use` line names, and the files those use, gives them all to
  machine.folio's `compile_allowing`, and writes what comes back; a mistake is
  shown as `folio run` shows it. Made into machine code with `--allow-read
  --allow-write`, it builds itself into the bytes Node.js made it, in 2.8 s,
  and so does what that builds; a Linux one and a Windows one build each other
  byte for byte. It finds which system it's on by whether it can read
  /proc/version. On Linux, bytes that start like a Linux program are written
  so they can run, as `folio build --exe` makes them.
- **The trap, a fourth time.** The first folio.exe stopped after reading
  machine.folio, sure compiler.folio wasn't there. Its top level counted through
  the arguments with `cli_k`, so every function's `cli_k` was that one, and
  the function that reads a file's `use` lines counted with it too, up to
  400,000. Everything folio.folio does is in functions now, and the test for
  such names covers folio.folio.
- **A trap, twice.** In Folio a `set` inside a function changes a top-level
  variable of the same name, and a file used `as` a name shares its functions'
  variables with the program's top level. A label called `here` in machine.folio
  was overwritten by compiler.folio's `resolve`, and a label called `bits_made`
  overwrote machine.folio's own marker, which showed only when one compiler made
  two programs. A test now checks that no function sets such a name.
- **Checked.** 400 random programs made from what it takes, 120 written for what's
  easy to get wrong, and every test program and 300 broken ones it can take, on
  the system the tests run on, against the JavaScript engine's output, mistakes,
  trails and exit codes; and programs that read, write, ask and take arguments,
  built with and without `--allow` flags, against `folio run` and `folio-native
  run`, each in a folder of its own, down to the files they leave there.

## 26. Standalone, and what was dropped

- **Why.** Once folio.exe built itself, the Rust engine and the Node.js command
  line were two more copies of Folio to keep in step, and neither was needed to
  make or run a program any more. Both went in one change; the JavaScript
  engine stayed, because the playground, its debugger, drawing, apps and the
  handwriting demo run on it.
- **What went.** `native/` (the Rust engine, its WebAssembly build and its
  machine code through `rustc`), `cli.js` (`folio run`, `test`, `fmt`, `check`,
  the shell, and builds to JavaScript and web pages), `disk.js` (its files and
  permissions) and their tests. They're all at v1.5.1 for anyone who wants them.
- **What the tests lean on now.** Machine code is held to the JavaScript
  engine, as before. The two tests that ran `folio build --exe` and `folio run` as
  processes now build folio.exe from the source, once, and have it build the
  programs; for the program that reads, writes, asks and takes arguments under
  six sets of `--allow` flags, what `folio run` did was written down first, on
  Windows from `folio run` itself and on Linux from its machine code, which CI
  had held to `folio run` there: the two were the same, so the test checks both
  systems against one record. Tidying and Folio's own tests, which CI ran with
  `folio fmt --check` and `folio test`, are in folio.test.js through `format()` and
  `test()`, for every Folio file here, tools/ and apps/ included.
- **The first folio.exe.** `node bootstrap.mjs` makes it from the source with
  the JavaScript engine, the same bytes folio.exe makes of itself; the release
  starter-1 has one for Windows and one for Linux.

## 27. The naming trap, fixed

- **The trap.** A `set` in a function changed a top-level variable of the same
  name, even one the top level only set further down the file, and a file used
  `as` a name shared its functions' variables with the program's top level. It
  bit four times (sections 22 and 25): machine.folio's `here`, overwritten by
  compiler.folio's `set here to scope`; a test driver whose `total` and `k` made
  machine.folio's loops count forever; and folio.folio's `cli_k`, which a function
  that reads files counted up to 400,000. Each time the fix was a new name, and
  a test that looked for clashes.
- **A function changes only what's made above it.** When a function sets a name,
  adds to it, loops over it or catches a mistake with it, the name means a
  variable outside the function only if that variable is made above the
  function's `to` line: by the top level earlier in the file, or by an enclosing
  function earlier in its code, or as one of its inputs. Otherwise the function
  gets a variable of its own. Names it only reads are found as before, wherever
  they're set, so a function at the top can still read a setting made at the
  bottom; calls are reads. A counter (`set total to 0`, then `to bump` with `add
  5 to total`) still counts, and so does a closure's `add 1 to count`.
- **A file used `as` a name keeps its own top level.** Every name in it becomes
  `math's x`, not only the ones its top level makes. A function's inputs, and the
  functions a function makes, stay as they are, since nothing outside the
  function can reach them. So the file's names work out as if it ran alone: a
  variable only its functions set is theirs, and a name it never makes isn't the
  program's, which reaches the file only through `math's ...`. The same file
  used as two names is still two copies, and `use` without `as` still puts a
  file in with the program, on purpose.
- **Still decided when the program is read.** "Above" is a matter of the text.
  Each function's code is walked once, in order, counting the functions it
  makes: a name is made above a function when fewer functions come before it
  than before the function. A function's own name counts from its `to` line,
  and a try's `with` name from its `if it fails`. The JavaScript side finds a
  function by its code; compiler.folio, which can't tell two equal lists apart,
  numbers each function as it parses it. Both give every variable the same slot,
  and the tests hold compiler.folio to the JIT, byte for byte, as before.
- **Two copies in machine code.** machine.folio found each top-level function by
  the line and column of its `to`, which two copies of one file share, so a file
  used as two names lost one copy's functions and the build stopped. It goes by
  the parser's number for each function now, and a test builds two copies.
- **What changed.** One test program said `1` and now stops: f sets `x`, the top
  level calls f, says `x`, and only then sets it. f's `x` is its own, so `say x`
  finds the top level's, which has no value yet. Of everything written in Folio
  here, only tools/picture.folio had functions (`whole` and `escape`) that set a
  name the top level makes below them, its loop's `n`; nothing relied on it, and
  the picture is the same. Of the 1,500 programs the tests generate, 255 now
  give a function a variable of its own where it used to change the top
  level's, as their functions come before most of the top level's code; the
  engines and compiler.folio agree on every one, and machine code on the 10 of
  its own 400 that changed. The self-compiling test's driver counts with `total`
  and `k` again, made before it uses machine.folio, and the test that looked for
  clashes between files now only looks inside machine.folio and folio.folio, where
  a function setting a top-level name would still be a mistake.
- **What it costs.** A variable of a function in a file used as `math` shows as
  `math's x` in a mistake, as the file's own top-level names already did. A hint
  in the checker for each function that changes a top-level variable was weighed
  and left out: snake.folio alone would get 16, for game state that's meant to
  change, and neural.folio and json.folio 8 each.

## 28. Drawing, apps and the pad in machine code: a window on Windows

- **The same picture as the playground's.** The turtle and its shapes run in
  machine code as Turtle in vm.js runs them, numbers to hundredths and mistakes
  word for word, so the list of things drawn is the same on every engine. At
  the end of a program that drew something, the window draws that list as the
  playground's canvas does: 500 by 500, (0, 0) in the middle and y going up,
  made smaller when a drawing reaches past 240 from the middle but never for an
  app, lines with round ends, text with its baseline on the point. GDI+ draws
  it, smoothed, because it ships with every Windows and needs no font or image
  code of Folio's own; text is Segoe UI, which is what the playground's
  system-ui is on Windows.
- **Colours as a canvas reads them.** The CSS names, all 148, are a table in
  the program, and `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa` are read in the
  runtime. A colour a canvas wouldn't know keeps the one before, as the canvas
  does. `rgb(...)` and `hsl(...)` weren't read yet; §31 reads them.
- **Apps call their handlers from the window.** Windows calls the window's
  procedure with each key, click, drag and timer, and the procedure calls the
  handlers waiting for it, in the order the program set them up. A handler's
  call is the first in progress, so a mistake in it lists only the calls under
  it, as on the JavaScript engine. Keys get the playground's names: arrows,
  space, enter and the rest by key code, other keys as the character typed, in
  lower case, and none while Ctrl or Alt is down. Timers go off every so many
  milliseconds, 10 at the fastest, as the playground's do. A handler that
  says `stop the program` ends it there: the window goes, and the number
  is the one the program ends with. The end of a program comes back to the
  window's code once more when that happens, so it remembers it has already
  begun: without that, the first try opened a second window inside the first,
  and with `FOLIO_EVENTS` it went through the events again, for ever.
- **The pad.** `ask` with a question that starts with "Draw", as the
  playground decides it, opens a 440 by 440 pad at a terminal. Each stroke
  comes back as the playground's pad gives it: points from 0 to 100, y going
  down, none closer than 1.5 to the one before, so handwriting.folio reads the
  same text from both. Enter answers, Escape wipes the pad, and closing it ends
  the program. Away from a terminal, the question is asked as any other is.
  Only a program that may ask for a drawing gets the pad: one whose questions
  are all texts that don't start with "Draw" doesn't.
- **Only a program that needs it pays.** The window's code, GDI+ and the
  colour table go into a Windows program that draws, sets up an app, or may
  ask for a drawing. Any other is the same bytes as before.
- **How it's tested.** With `FOLIO_PICTURE=file.bmp`, the window isn't opened:
  the program draws into that file instead, after the events `FOLIO_EVENTS`
  lists (`key left;click 10 20;drag 11 21;tick 0`). The tests check the colour
  of the picture at chosen points, and that an app given the same events says
  and fails exactly as the JavaScript engine's `app.send` makes it. The window
  itself was tried by sending it Windows' own mouse and key messages and
  reading back what it showed: the paint app, a timer, and handwriting.folio,
  which read a drawn 1 and a drawn 2.
- **Linux has no window yet.** A program there draws into the list and shows
  nothing, and an app sets up and ends.

## 29. The folio command, complete

- **What it was missing.** folio.exe could only `folio build`: a program's
  mistakes went to the normal output, it couldn't end with a code of its own,
  and running, tidying and checking a program had gone with the Node.js command
  line in 1.6. All four needed something Folio itself couldn't do, so the
  language grew first.
- **Two ways to end, in words Folio already has.** A new reserved word breaks
  every program that used it as a name, so both phrases are built from words
  Folio already keeps: `say "oops" to the error output` is `say` with a target,
  the way `write ... to` has one, and `stop the program with 2` is `stop`
  followed by words that could never have meant anything else (`stop` alone
  still only leaves a loop, and `the` and `program` are still names). The
  number is a whole number from 0 to 255, which is all Linux keeps of it, so a
  program ends the same way on both systems. Nothing catches it: a `stop the
  program` inside a `try` ends the program, as running out of steps does.
- **Starting a program.** `run program "git" with (list of "status")` gives
  back the number it ended with. `run program` reads like the two words it is,
  and `run` on its own is still a name, so only `run program` together starts
  one; it gives a value, so a line of its own that starts with it says to write
  `set code to run program ...` instead. `remove the file "old.txt"` is
  `remove`, which already removes a dictionary's keys, with `the file` after
  it. Every phrase works the same in all three JavaScript engines, in the
  compiler written in Folio (whose JavaScript and bytecode are still byte for
  byte what folio.js makes), and in machine code; in the playground and the
  tests the error output is shown the way a mistake is, an exit code just ends
  the run, and starting a program is a mistake that says only a program
  `folio build` makes can.
- **In machine code.** The error output goes out at once, after whatever the
  normal output has waiting, so the two stay in the order they were said.
  `stop the program` flushes and ends through one ending the runtime shares
  with a program that just finishes, so what was drawn still gets its window.
  A program is started with `CreateProcessW` and waited for with
  `WaitForSingleObject` and `GetExitCodeProcess` on Windows, where the command
  line is put together and quoted as Rust's `std::process` does it; on Linux
  with `fork`, `execve` and `wait4`, where a name with no `/` in it is looked
  for in each folder of PATH first, as `execvp` does, since a bare `execve`
  searches nothing. A signal that ends it gives 128 and the signal's number, as
  a shell does. The program it starts gets this program's own input and output,
  so what it says goes where this program's words go.
- **Asked for, like a file.** Starting a program is a fourth thing a program
  may do, beside reading a file, writing one and going online: `--allow-run`
  (Deno's name) lets it without asking, `--allow-all` covers it, and otherwise
  a person at a terminal is asked "folio: let this program run 'git'?" once for
  each program, or for all of them with `a`. Away from a terminal the answer is
  no, and the refusal is a mistake a `try` can catch. `--allow-run` names
  nothing: a program may start programs, or it may not. folio.exe itself is
  built with it, since `folio run` starts what it built.
- **`folio run`.** It builds the program into a file beside its source
  (`hello-run.exe`, or `hello-run` on Linux, with `./` in front when the source
  has no folder, so the system looks for it there and nowhere else), starts it
  with whatever was written after the file, waits, removes the file, and ends
  with the program's number. A number no system can end with (Windows gives a
  crash a huge one) becomes 1.
- **`folio tidy`.** `format()` in folio.js, in Folio. It needed two things from
  the parser, which only the parser knows: how deep in blocks each statement
  starts, and which pieces are written with no space after them (a negating
  minus, a call's bracket). compiler.folio's parser now writes both into the
  `reading` record when it's asked to, as folio.js's does, and machine.folio
  hands them to the command line. The rest is in folio.folio: one line's pieces
  as they were written, counted in the columns the parser counts, then the
  lines joined the one way Folio writes them. After tidying, the pieces are
  read again and must be the same pieces in the same order, as folio.js checks;
  a mistake in the code is a mistake, and the file is left alone.
- **`folio check`.** checker.js finds two kinds of problem: what the scope rules
  know (a name nothing ever sets, a line that can never run, a name set or made
  and never used), and what its types know, which it gets by trying an
  operation on sample values of the types it worked out — every one of Folio's
  operations, through the same code the VM runs. The first kind is the scope
  rules compiler.folio already has, so `folio check` does those, in the checker's
  words (the same `undefined_message`, with the same "Did you mean") and in the
  checker's order. The second kind would mean writing all of vm.js in Folio
  again; the playground's Problems pane has it. A call to a name nothing sets
  doesn't look at what it was given, as the checker doesn't, so the same
  "never used" warnings come out.
- **`expect` in machine code.** It was the last thing `folio build` turned away.
  It is the comparison the engines make, and when it doesn't hold, their
  message, which says what each side was: both values wait on the stack, so the
  message can show them after the comparison has used them, and the mistake
  points at the `expect`, as the engines' does. `expect done` on its own asks
  only whether the value counts as yes.
- **Keeping what a program says.** `run program ... keeping its output` gives a
  record of the number it ended with, what it said, and what it said went
  wrong, which is what a test runner needs. Each of the program's two outputs
  gets a pipe, and neither read waits: on Windows `PeekNamedPipe` says how much
  is there before `ReadFile` takes it, and on Linux the read ends are
  `O_NONBLOCK`, with a millisecond's sleep when nothing came. So a program that
  fills one pipe while this one reads the other is never stopped by a pipe
  nobody is emptying: 1.2 MB on one output and 600 KB on the other come back
  whole, the same bytes on both systems. What came goes into a block of its own
  for each output, which doubles as it fills, and both blocks are among the
  collector's roots, since nothing else holds them.
- **`folio test`.** The file is built once, with lines at its end that call the
  test whose name the program is started with, and then started once for each
  test: a run of its own, so one test can't spoil another, which is what
  folio.js's `test()` gives by running the file again for each test. What it
  says is kept, so a test that failed can show the mistake, the calls that led
  there and its own output under it, indented, exactly as the Node.js command
  line showed them. The call the runner adds comes after the file's own lines,
  so the one trail line pointing past them is dropped, as `test()` drops it. A
  file with no `test_` functions is one test itself, named after the file.
- **Checked.** Every command runs as a process against what folio.js does:
  `folio tidy` on every Folio file here and on programs broken on purpose, each
  tidied to exactly the bytes `format()` makes and tidy again the second time;
  `folio check` against `check()` with its type warnings taken away, word for
  word and in order; `folio run` passing arguments, input, output and the number
  a program ended with through, and leaving nothing behind; `folio test` against
  `test()`, tick for tick and line for line, with tools/json.test.folio passing
  under folio.exe; and a program that starts another, with and without
  `--allow-run`. The phrases themselves are held to the three JavaScript
  engines, the compiler written in Folio, and machine code, on Windows and on
  Linux.
- **What's left.** `folio test` needs its files named: machine code can't look
  through a folder yet, so it doesn't find every `.test.folio` file itself.
  `folio check` leaves out the checker's type warnings. And `folio build` still
  turns away units, tables, `random number` and `draw chart of` (random numbers
  came next, §30, and the rest after them, §31, with `folio test` finding its
  files).

### Asking which Folio this is

- **Why.** A bug report or an install check needs the release version of the
  program actually running. `folio --version` and `folio version` each say one
  line, `folio MAJOR.MINOR.PATCH`, on standard output and end with 0.
- **One source, carried along.** `package.json` already has the release
  version. bootstrap.mjs includes that file in the executable, and cli_main
  reads it only for a version command. Built-in files are read before disk
  files, so an installed folio needs no manifest beside it, and another
  project's package.json cannot change its answer. Building folio with itself
  includes package.json too, just as it includes folio-debugger.folio.
- **Arguments.** Only a version command on its own takes this path. Extra
  arguments use the usual wrong-usage message and exit code 2. The existing
  `folio build --version` flag still sets the built program's version.
- **Tested.** machine.test.js runs both commands from a renamed copy in a
  folder without the source or manifest, then with a different manifest and
  invalid JSON. It checks exact output, empty standard error and exit code 0,
  rejects extra arguments, and checks that folio built by itself has the same
  bytes and reports the release version away from the source folder.

## 30. Random numbers in machine code

- **The same numbers as the engines.** `random number from 1 to 6` in machine
  code picks as `randomWhole` in vm.js does: both ends made whole to 15 digits
  first, the same mistakes in the same words, and the number is
  `low + floor(r * (high - low + 1))`. `r` comes from the same small generator
  the engines use when they aren't given real randomness (mulberry32), worked
  out in 32-bit steps, so a seed gives exactly the same numbers everywhere.
- **Where they start.** If `FOLIO_SEED` is set to a whole number, they start
  there, which is how the tests compare machine code with the JavaScript
  engine: both start from 1. Otherwise they start from the processor's cycle
  count, so each run of a game is different. That's random enough for games
  and dice, not for secrets.
- **Only a program that uses it pays.** The generator, and on Windows the
  import it needs to read `FOLIO_SEED`, go only into programs with a
  `random number`. With it, apps/snake.folio builds into a program of its own
  and plays in the window.

## 31. The rest of Folio in machine code

- **What was left.** `folio build` turned away amounts with units, tables and
  `draw chart of`; the window didn't read `rgb(...)` or `hsl(...)`; and
  `folio test` needed its files named, because a program in machine code
  couldn't look in a folder. Now machine code takes every phrase Folio had
  before `the time`, `wait`, `in order`, `save` and `load` came, and each of
  these says, fails and ends exactly as the JavaScript engine does.
- **An amount is a value of its own.** `5 km` is 16 bytes, the number and which
  of vm.js's units it is, and its kind is a seventh one beside text, lists and
  the rest, so the collector keeps it and `say`, `is`, the comparisons, `+`,
  `-`, `*`, `/`, `add ... to`, `number of` and `in` all know it. A unit's
  factor is the same double the engines use, and a conversion multiplies and
  then divides, as theirs does, so `1 mile in km` is the same number, digit for
  digit. An amount the program writes is kept with the program's own texts and
  numbers, so `5 km` costs nothing when it runs.
- **Only a program with amounts pays.** The arithmetic is quick because a sum
  of two numbers is one instruction, and only a result that isn't a number
  goes the slow way. The slow way has to look for amounts, but code is written
  before the compiler has seen every line, so it can't know yet whether the
  program has any. So it writes the program once, and if it found an amount,
  writes it again, knowing. A program with none is the same bytes as before,
  and so is everything else that doesn't use what's new: tables, charts and
  folders each bring their code only into the programs that use them.
- **Tables.** `read table` parses the CSV text as vm.js's `tableOf` does, cell
  by cell: quotes, `""` for a quote, line breaks in quotes, blank lines, `\r\n`,
  and the header made into field names the same way, `column_` and `_2` and
  all. One thing was harder in machine code: a record finds a field by its
  name's text being the very same text, not text with the same letters, which
  is what makes `price of row` one comparison. A table's names come from a
  file, so each is looked up among the program's own texts first, and if the
  program never wrote it, it is made once and kept, so two tables read from
  the same file have the same fields, and `is` says they're the same.
  `total of`, `average of`, `largest of`, `smallest of` and `price in sales`
  work on any list, amounts and text included, as the engines' do.
- **Charts.** `draw chart of` draws what vm.js's Turtle draws for it: a bar and
  its value for each number or amount, a label for each, the longest bar 200
  long. It was checked by drawing the same things one by one, with
  `draw box` and `draw ... at`, and comparing the two pictures byte for byte.
- **Colours.** The window reads `rgb()`, `rgba()`, `hsl()` and `hsla()` as a
  browser's canvas does: the old way with commas, the new way with spaces,
  `none` and an alpha after a slash, percentages, exponents and the angle
  units, each part held to its range and rounded, and `hsl` worked out as
  Chrome works it out. White space either side of any colour is let go, as CSS
  lets it go.
- **Looking in a folder, in words Folio already has.** `read the folder "tests"`
  gives the names of what's in a folder, in Folio's order for text, a folder's
  name with `/` after it, so `folder + name` is the path either way, and a
  program can tell what to go into. It is `read`, followed by words that could
  never have meant anything else after it, as `remove the file` is: `the` and
  `folder` are still names. It works in every engine, through whatever holds
  the files (in memory, the files' names are the folders), in the compiler
  written in Folio, the checker and the folio command's checking, and in machine
  code with `FindFirstFileW` on Windows and `getdents64` on Linux, the names
  sorted by a merge sort. It is reading, so it needs `--allow-read` or a yes,
  as reading a file does.
- **`folio test` on its own.** It finds the tests as the Node.js command line
  did: every file ending in `.test.folio` here and in the folders inside, but
  not hidden ones or `node_modules`, each folder's in turn, sorted as
  JavaScript's `localeCompare` sorts them (case after the letters themselves,
  marks before digits before letters), with `\` between folders on Windows.
  A failing test's mistake names its file's path, as that command line did.
- **Checked.** Every new phrase and helper is in the programs machine.test.js
  holds to the JavaScript engine, mistakes included, on Windows and on Linux;
  tables and folders are read from real files in a folder of their own;
  colours and charts are checked pixel by pixel in pictures drawn through
  `FOLIO_PICTURE`; and `folio test` with no files is held to the old command
  line's own way of finding them.

## 32. Faster machine code

- **Where the time went.** Before, every variable lived in memory, every value
  went through the value stack, and every `+` checked both sides were numbers.
  On the counting loop that made Folio 8 times as slow as C.
- **What the compiler knows.** As machine.folio writes a function's code, it
  keeps what each variable is sure to hold: a whole number, a number, or at
  least a value. It works this out in the order the code runs: a branch keeps
  what both sides agree on, a loop or a `try` only what stays true all through
  it, and a call forgets main's variables. A check that can't fail is left out:
  a variable sure to have a value, a sum of two numbers, a number negated.
- **Loops in registers.** A loop that calls no function and has no `try` keeps
  the variables it uses most in xmm8 to xmm15 as well as in memory, and its
  count and limit in registers alone. Two numbers compare right there, as the
  runtime would (it still settles two so close that 15 digits can't tell them
  apart), and `is divisible by` on two whole numbers is one division.
- **Whole numbers as whole numbers.** A loop whose body only works out whole
  numbers (`set`, `add`, `if` and `stop`, with `+`, `-`, `*`, comparisons and
  `is divisible by`) also runs as 64-bit whole numbers in rsi, rdi and r8 to
  r11, scaled by 1024 so that a sum past 2^53 sets the processor's overflow
  flag. Every variable must be a whole number from -2^53 to 2^53 on the way in;
  a sum that goes past, or dividing by 0, puts the registers back in their
  variables and carries on in the loop's ordinary code from the start of that
  statement, so the answer and any mistake are what they always were.
- **Calls.** `return` goes straight back, and a function whose frame holds
  nothing needs no room made for it.
- **What it gave.** About as fast as C on the counting loop, primes and decimal
  maths, and 1.4 times as slow on function calls (see the README). The tests
  hold it to the JavaScript engine on programs written to break it: a variable
  that is a number and then isn't, sums past 2^53, dividing by 0 inside a fast
  loop, more variables than registers, close numbers, infinities, NaN and -0.

## 33. Going online in machine code

- **What was missing.** A program built with `--allow-net` got past the
  question, then said it couldn't reach the site: machine.folio had no way to
  connect. Now `read "https://..."` and `read bytes` fetch the page, on Windows
  and on Linux, over http and https.
- **The same as before.** Both old command lines went online: disk.js fetched
  the page in a second Node, and the Rust engine ran `curl`. Where they
  differ, machine code does what the Rust engine did, since `folio run` is
  machine code now and keeps folio-native's words:
  - the page as the site sent it. Its text is read as a file's is, as UTF-8
    with U+FFFD for what isn't; its bytes as they came.
  - no move made by itself. An answer from 300 to 399 that says where to go is
    a new address, asked about again as any site is, by its `--allow-net`
    names or a person at a terminal. Ten moves at most, then "it moved too
    many times". A move to something that isn't http or https: "it moved to
    'ftp://...', which isn't a site". A move the program may not make: "it
    moved to '...', and this program isn't allowed to go online (start it with
    --allow-net)". The mistake names the address the program read.
  - any other answer from 300 up is a mistake: "can't read
    'https://example.com/nothing': the site answered 404". So is a 3xx that
    says nowhere to go.
  - 60 seconds for a site, in all, as `--max-time 60` gave curl. disk.js left
    it to Node's fetch, which waits minutes.
  - `--allow-net=example.com` allows that host exactly, with any port or only
    the one named, as the Rust engine had it. disk.js allowed any host with the
    name inside it, `example.com.evil.net` too. machine.folio already did this.
  - what went wrong: "couldn't reach it (...)", with curl's words inside. The
    Rust engine passed on whatever curl printed, which changes with curl's
    version and holds times ("after 3 ms"), and for a bad certificate ran to
    five lines. Now each kind of failure has one fixed phrase in curl's words,
    the same on both systems: "Could not resolve host: nosuch.invalid",
    "Failed to connect to 127.0.0.1 port 1: Couldn't connect to server",
    "Operation timed out after 60000 milliseconds", "SSL connect error",
    "Failure when receiving data from the peer", and "URL using bad/illegal
    format or missing URL". Anything else is curl's own first line on Linux,
    without its "curl: (N) ", and "WinHTTP error N" on Windows.
- **Windows: WinHTTP.** It comes with Windows, does https with the system's
  certificates and proxy, and is a DLL like any other, imported through
  `more_imports` as the window's DLLs are. The request makes no move by itself;
  the program reads the answer's number and its Location, then the page, into
  memory that doubles as it fills. Before each step the request gets what's
  left of its 60 seconds. The address goes out as curl sends it: in the path a
  byte above 127 becomes `%xx`, the query goes as it is, and nothing else is
  changed. A Location that isn't a whole address is made one from the address
  it came from (`//host...`, `/path`, `?query`, or a name in the same folder),
  as curl makes `%{redirect_url}`.
- **Linux: curl.** A program machine.folio makes is static: it calls no
  library, so there is no TLS library to call, and TLS written by hand is not
  worth the risk. So it starts the system's `curl` the way `run program`
  starts a program: found in PATH, then `fork` and `execve`, its arguments
  given straight to it with no shell between, the page and curl's mistakes
  read through two pipes as `keeping its output` reads them. curl gets `-q`, so
  a `.curlrc` can't make it follow moves itself, past the questions; `-sS`;
  `-g`, so `[` and `{` in an address are only characters; `-A folio`;
  `--max-time 60`; `--proto =http,https`; and `-w`, which writes the answer's
  number and where it moves to after the page. Its exit code says what went
  wrong. With no curl: "couldn't reach it (on Linux a Folio program goes online
  through curl, and there is no program called 'curl')".
- **One address, read one way.** A `\` before any `?` or `#` is a `/`, as a
  browser reads it, so the host the `--allow-net` names were checked against is
  the host gone to. curl alone reads `http://example.com\@evil.com/` as a visit
  to evil.com. An address with a space or a control character in it isn't one.
  Both systems split the address the same way, for their words.
- **Only a program that reads.** Any name a program reads might be a site's
  address, so a program with `read` or `read bytes` in it has all of this, and
  on Windows imports WINHTTP.dll. A program that never reads has none of it,
  and is the same bytes as before. folio.exe reads files, so it has it too.
- **Checked.** A test starts a server of its own on 127.0.0.1, over plain
  http, so nothing needs the internet: text with a broken UTF-8 byte in it,
  bytes, moves (to a path, to a name in the same folder, to another host, in a
  loop, to ftp:), a 3xx that says nowhere, 404, 500, an empty 204, a 3.2 MB
  page, a port nobody listens on, and two addresses that can't be, with seven
  sets of `--allow` flags, and through `folio run`. Another test checks that a
  program that never reads is the same bytes, and imports no WinHTTP. The same
  program built for Linux said the same, against the same answers, in WSL. By
  hand, on both systems: https://example.com, a 404, http://github.com moving
  to https, a host that doesn't exist, expired and self-signed certificates,
  Wikipedia and a Gutenberg book (about 700 KB each), an image's bytes, a site
  that never answers, an IPv6 address, and Linux with no curl.
- **What's left.** On Windows a site that stops answering can take a few
  seconds more than its 60 (64 in a test), since WinHTTP's own timer runs
  late; curl stops at 60. A name and password in an address (`user:pw@host`)
  go with curl, not with WinHTTP. A move with `../` in it is followed as it is
  on Windows, while curl works the `..` out first. A program can only fetch a
  page, with no headers of its own.

## 34. The time, waiting, putting things in order, saving and loading

- **Words that were names stay names.** `the time`, `wait 2 seconds`,
  `scores in order`, `save x to "f"` and `load "f"` are each a phrase only in
  the one shape they have: `the` followed by `time`, `date`, `year`, `month`,
  `day`, `hour`, `minute`, `second`, `weekday` or `clock`; `wait` followed by an
  amount of time; `in order` after a value; `save` with a `to` after its
  value; `load` followed by a file's name. Anywhere else each word is a name as
  it was, and a line that only looks like a phrase (`wait 5`, `save 5`) is a
  call again. With no function of that name, its mistake says what the phrase
  needs (`to wait, say how long: 'wait 2 seconds'`), instead of guessing at a
  Folio word that's spelled alike.
- **The clock comes from outside, like random numbers.** A run is given a
  clock: what time it is where the program runs, the milliseconds since it
  started, and a way to wait. Unless it's given a real one, a run gets one that
  starts at Friday 2 January 2026, 03:04:05.678, whose waits take no time but
  move it on, so every engine and every test says the same times. The
  playground gives the real one, and shows what was said and drawn before each
  wait; run() keeps what the clock said, so a run handed over to the VM gets
  the same times and doesn't wait again. In machine code, FOLIO_NOW (milliseconds
  since 1970, as the local time) does what the made-up clock does, and is how
  the tests hold machine code to the engines.
- **The time where it runs.** The JavaScript engines take the local time from
  the browser or Node.js. On Windows, machine code asks the system for the time
  and turns it into local time with FileTimeToLocalFileTime. On Linux a program
  has no library to ask, so it reads /etc/localtime (a TZif file) once when it
  starts, and takes the offset in force then; checked against `date` in six
  zones, summer time and quarter-hour zones included. The date comes from the
  days since 1970 with Howard Hinnant's civil_from_days, in whole numbers.
- **In order is a new list.** Sorting the list in place would make `say scores
  in order` change `scores`, which a beginner wouldn't expect. Numbers go by
  size, as `is less than` compares them (equal to 15 digits is equal), and text
  by each character's number in turn: the same on every engine and in machine
  code, where it's the order of the text's bytes, and the same whatever the
  computer's language is, unlike `localeCompare`. Equal ones keep their order,
  which machine code gets with a merge sort; `in reverse order` keeps it too.
  A list that mixes numbers and text is a mistake, not a guess.
- **Saving writes a value as Folio shows it.** `save` writes what `say` would
  show for the value inside a list (text in quotes, records as `(record with
  ...)`), and `load` reads exactly that back, with spaces and new lines allowed
  between parts. So a saved file is readable, the format needs no explaining,
  and `save` is `write` of that text: the same permissions and the same
  mistakes when the file can't be written. Functions, bytes, amounts with units
  and a list that holds itself can't be saved, and say so. A record read back
  uses the program's own text for each field's name, since machine code finds a
  field by which text its name is, so `name of person` works on a record that
  `load` made.

## 35. Sound

- **Three phrases, no new reserved words.** `play note "C4" for 0.5 seconds`,
  `play note 440 for 200 milliseconds` and `play a beep`. `play` starts a
  phrase only when `note`, or `a beep`, follows it on the same line, so `play`,
  `note`, `a` and `beep` stay names. `play beep` or `beep` alone, with no
  function of that name, says how a sound is made, instead of guessing at a
  name that's spelled alike.
- **A note is a name or a pitch.** A to G in either case, maybe `#` or `b`,
  maybe an octave from 0 to 9 (4 if none, so `"C"` is middle C), or `"rest"`
  for silence; a number is a pitch in hertz, from 20 to 20,000. The twelve
  notes from middle C up are written out in hertz rather than worked out with a
  power of 2, so every engine and machine code have exactly the same numbers;
  another octave is those doubled or halved, which is exact. A sound lasts
  from 0 to 60 seconds, given as `wait` and `every` take a time.
- **Sounds take turns, and the program goes on.** Each sound starts when the
  one before it ends, and `play` returns at once, as `draw` does: a tune is
  `play` after `play`, and `wait` is how a program waits for one to finish. So
  a sound in an app's handler never holds up its picture.
- **Sounds come out of a run, as drawings do.** An engine hands each sound, as
  { hertz, seconds }, to whatever runs the program, in order, and never touches
  a speaker itself. run() counts them, so a run handed over to the VM plays
  nothing twice.
- **One wave, worked out the same everywhere.** A sound's samples, 44,100 a
  second and 16 bits each, are worked out by soundSamples with only + − × ÷ and
  floor: close to a sine wave (two parabolas, refined), a quarter as loud as
  it could be, and fading in and out over 10 ms so it starts and stops without
  a click. JavaScript's Math.sin isn't the same to the last bit everywhere, and
  machine code would need one of its own; this way machine code works out the
  same numbers by the same steps, so a test can compare its sounds byte for
  byte, and the playground and a built program sound alike.
- **In the playground** the browser's Web Audio plays them, each made into
  samples only shortly before its turn, so a long tune doesn't fill the page.
  Stop and Run silence them.
- **In machine code** a Windows program at a terminal plays them through
  winmm.dll's waveOut, and waits for them before it ends, unless it showed its
  window, whose closing ends them too. Only a program that makes a sound
  imports winmm.dll. Away from a terminal it's silent, as it opens no window
  there, and Linux has no sound a program of its own can count on, so there it
  makes none. FOLIO_SOUND=file.wav writes every sound into that WAV file
  instead, with its sizes put right after each sound, so the file is whole
  even when the program stops with a mistake.
- **Tested.** Every way of writing a note, and every mistake, the same on all
  three engines, in the checker and in the compiler written in Folio; a hand-over
  to the VM; and 19 programs whose sounds machine code writes with FOLIO_SOUND,
  byte for byte the WAV of the sounds the JavaScript engine played, up to the
  same mistakes, on Windows and on Linux, with each note's pitch measured where
  its samples cross zero, and an app's handlers making theirs as its events
  come.

## 36. Buttons and text boxes

- **Six phrases, no new reserved words.** `draw button "Start" at 0, 0` and
  `when the button "Start" is clicked` are the owner's own. A text box follows
  them: `draw text box "Name" at 0, 50`, `when enter is pressed in the text box
  "Name" with words`, `the text in the text box "Name"`, and `clear the text box
  "Name"`, which empties it. Every one starts with a word Folio already keeps
  (`draw`, `when`, `clear`) or is a run of words that meant nothing before:
  `draw button "Start"` was a mistake (a value can't follow `button`), and so
  were `draw text box`, `clear the` and `the text in the text box`. So `button`,
  `text`, `box`, `the` and `enter` are still names, and `draw button at 0, 0`
  still draws what a variable called `button` holds.
- **A button or a box is its label.** The label is shown as `say` shows it, and
  two with the same label are one: a click on either runs the same handlers,
  and two boxes called "Name" hold the same text. A handler's label is worked
  out once, when the program sets it up, as `every`'s time is.
- **Sizes come from the label, not the font.** A button is 30 high and 20 wide
  plus 10 for each letter of its label; a text box is 200 by 30. A click has to
  land in the same place on every engine and in machine code, and the
  playground's font and Windows' measure text a little differently, so neither
  is asked. `at x, y` is the bottom left corner, as for `draw box`.
- **Clicks.** A click inside a button runs that button's handlers and nothing
  else: `when the mouse is clicked` doesn't get it, so a paint program's
  "Clear" button doesn't also paint a dot. A click inside a text box gives it
  the focus, and doesn't reach `when the mouse is clicked` either. Where they
  overlap, the one drawn last wins, as it's the one on top. A click anywhere
  else takes the focus away and goes to `when the mouse is clicked`, as before.
  A click on a button leaves the focus where it was, so you can type, click
  "Add", and go on typing. Drags are as before.
- **Typing.** While a box has the focus, every key goes to it, and none to
  `when a key is pressed`. Backspace takes off the last letter, Enter runs the
  box's `when enter is pressed` handlers with its text, and other keys do
  nothing more. The letters themselves come from a new kind of event, `type`,
  which hosts send for each character typed, as it was typed (`A`, not `a`),
  after the key's own event: `app.send("type", ["A"])` in JavaScript, WM_CHAR
  in the window, `type hello` in FOLIO_EVENTS. A box holds up to 40 letters;
  more are dropped, and so are control characters. The cursor is always at the
  end: there are no arrow keys inside a box, which keeps it to one rule.
- **The text outlives the picture.** Apps draw their picture again after each
  event, starting with `clear`. If `clear` emptied the boxes, nothing typed
  would survive the next key, so a box's text is kept by its label, and a box
  drawn again shows it again. The focus goes when its box isn't on the picture
  any more. `clear the text box "Name"` empties one on purpose.
- **Where the rules live.** One place for the JavaScript engines: the Turtle in
  vm.js, which already sees everything drawn, keeps the buttons and boxes since
  the last `clear`, the texts and the focus, and `route()` decides where each
  event goes; folio.js's `app.send` asks it first. machine.folio does the same
  in its runtime. A JavaScript run handed over to the VM in the middle of an
  app replays the events, not only the handlers they ran, so the VM's turtle
  gets the same texts.
- **What's drawn.** A button is a box in the pen's colour with its label in
  white, in the middle. A text box is white with a border in the pen's colour,
  its text in black, its label in grey while it's empty, and a cursor while it
  has the focus; a text too long to fit shows its end. Typing changes a box
  without the program drawing anything, so the turtle tells the host with an
  item of its own in the list of things drawn: `{ textbox: "Name", text,
  focused }`. The playground draws each box with the last of those for its
  label; machine code draws from the texts themselves.
- **Linux.** There's no window, so buttons and text boxes are only drawn
  things, nothing types into a box, and handlers don't run, as for any app.

## 37. Pictures from files

- **The phrase.** `draw picture "cat.png" at x, y` draws a PNG or BMP with its
  bottom left corner at x, y, as `draw box` puts a box, and `size w by h`
  stretches it. It can draw bytes the program already has, too:
  `draw picture read bytes "cat.png" at 0, 0`. `picture` is still a name:
  `draw picture at 0, 0` draws the text a variable called `picture` holds.
  A picture is drawn with its pixels sharp, however big, which suits sprites.
- **One decoder of Folio's own.** pictures.js reads PNGs (zlib, every filter,
  every colour type and bit depth, palettes, transparency and interlacing) and
  BMPs (1 to 32 bits, with masks), so the playground, every engine and the tests
  get the same pixels whatever the browser is. machine.folio has the same decoder
  in machine code, written step for step as the JavaScript one, so a broken file
  stops at the same mistake in the same words: "'x.png' is a broken PNG: a
  chunk's checksum is wrong". Windows' GDI+ could have read the files, but then
  Linux, the tests and the playground would each read them their own way.
- **Reading is reading.** A picture is read as `read bytes` reads a file, with
  the same `--allow-read` rules, questions and refusals.
- **In the window.** A picture is drawn with its see-through pixels blended over
  what's under it, and made smaller with the rest of a drawing that doesn't fit.
- **The playground's files.** Files picks pictures (or any file) for a program
  to read by name, and they can be dropped on the playground too; a picture gets
  a button that puts a line drawing it in the code. They stay on the page.
- **Tested.** Small PNGs and BMPs are made in the tests, in every colour type,
  depth and kind of BMP, with the pixels each must come out as worked out apart
  from the decoder: every engine draws exactly those, machine code draws them
  pixel for pixel (blended where they can be seen through), and 350 broken
  files stop at the same mistake everywhere, on Windows and on Linux.

## 38. A security check, and what it changed

- **What was checked.** The playground, for any way a program or a shared link
  could reach the page; the JIT, for any way text in a program could become
  JavaScript; the `--allow` flags, against look-alike folder names, `..`,
  junctions and symlinks, for reading and for writing; going online on Linux;
  how programs and DLLs are found on Windows; how built programs are laid out
  in memory; and 3,000 broken pictures and saved files, on Windows and Linux,
  looking for a crash. The page escapes all it shows, the JIT writes every text
  as a JSON string, the flags held, refused writes left files as they were, and
  nothing crashed.
- **DLLs only from System32.** Windows looks for a program's DLLs beside the
  program first, and winhttp.dll, winmm.dll and gdiplus.dll aren't among the
  ones it always takes from its own folder. So a file called winhttp.dll in
  Downloads, beside folio.exe, would have run inside it. A program now carries a
  load configuration whose DependentLoadFlags say LOAD_LIBRARY_SEARCH_SYSTEM32,
  so its DLLs come only from System32 (Windows 10 1607 and later).
- **Programs from the system's folders and PATH.** `run program "git"` let
  CreateProcessW look, and it looks beside the running program first, so a
  git.exe put there would run. Now a name with no folder in it is looked for
  with SearchPathW in System32, then Windows' folder, then PATH with its empty
  entries left out (SearchPathW takes an empty one as the current folder), and
  CreateProcessW is given what it found. A name with a folder is followed as it
  is.
- **Batch files.** Windows runs a .bat or .cmd file in cmd.exe, which reads `&`,
  `|`, `%` and the rest in its arguments as commands whatever the quoting: an
  argument of `x" & echo INJECTED` ran `echo INJECTED`. Rust had the same hole
  (CVE-2024-24576). Folio now refuses an argument to a batch file that holds any
  of `" % ^ & | < > !` or a line break, rather than trying to quote for cmd.exe,
  which has no quoting that holds for all of them; and since cmd.exe looks for
  the batch file again by its name, starting in the folder the program runs
  in, one that was found on PATH is named by its whole path.
- **Not changed.** Programs still load at a fixed address (no ASLR): they never
  run their data or write their code, and Folio checks every index and every
  kind, so it would only matter with a bug in the runtime. A shared playground
  link still runs its code as it opens, in the page's worker, which can't reach
  the page.
- **A bug found on the way.** The fuzzing found that machine code couldn't
  `load` a number with an exponent, like `1e-7`, which `save` writes for very
  small and very large numbers. `load` now writes such a number out in full
  (`0.0000001`) and reads that, which is exact; past 10^310 it's Infinity and
  below 10^-330 zero, so a huge exponent costs nothing.

## 39. Sending, and JSON

- **The phrases.** `set reply to send data to "https://..."` POSTs data to a site
  and gives back the reply as text; `with headers h` adds headers, a dictionary
  of text, to a `send` or a `read`. `x as json` writes a value as JSON, and
  `json from text` reads JSON back. `send`, `json` and `from` stay names, as
  `wait` and `save` do: `send` is the phrase only with a value and `to` after it
  on its line, and `json` only with `from` after it. A `send` alone on a line is
  a mistake that says where it goes, as `run program` is: what it gives back is
  the point of it.
- **What is sent.** Text goes as it is (text/plain), anything else as JSON
  (application/json), unless a Content-Type header says otherwise. JSON is what
  sites and the programs behind them take, so it needed no choosing; writing it
  is `save`'s own walk over a value, with JSON's brackets, and `save`'s checks:
  functions, bytes, amounts with units, a list that holds itself, and Infinity
  and NaN, which JSON has no way to write, are mistakes that say so. Numbers go
  to 15 digits, as Folio shows them.
- **What comes back.** `json from` reads with `load`'s own reader, set to JSON:
  `{...}`, `true`, `false`, `null` and JSON's exponents, `1e5` and `1E5`
  included. An object becomes a dictionary, not a record: its keys are text that
  needn't be a name (`"first-name"`, `"1"`), and a field is found by its name in
  lower case. Half a pair of surrogates becomes U+FFFD, as machine code's text
  can only hold.
- **Headers are checked before anything goes.** A name is HTTP's token
  characters, and a value can't hold a line break, which would start a header
  of its own: a header can't be used to slip another into a request.
- **Nothing goes on by itself.** A `send`, and a `read` with headers, don't
  follow a move to another address: an answer from 300 up is a mistake. So data,
  and a header like Authorization, only ever go to the address the program names.
- **The engines.** A builtin that goes online gets the program's disk, whose
  `send(address, data, headers)` does it: the playground's with
  XMLHttpRequest, the tests' memoryDisk by keeping what was sent. A run handed
  over to the VM part way gets the replies it had, and sends nothing twice.
- **Machine code.** WinHTTP sends on Windows, with the headers as one block and
  the data as the request's body. On Linux curl does, with `-H` for each header
  and `--data-binary @-`, the data written into its input, which it reads to the
  end before it goes online, so a large one can't leave both waiting; and with
  SIGPIPE ignored, so a curl that stops early can't end the program.
- **A bug the tests found on the way.** After a hand-over to the VM, each call
  outside (a read, an answer, a random number, now a send) made fresh is kept
  too, but the count of what had been got again didn't move past it, so the next
  call got the one before's answer: two random numbers in a row came out the
  same. The count now moves past each one.
- **Tested.** JSON's every corner on all three engines and in machine code, on
  Windows and Linux, against vm.js; sending through the disk on every engine,
  and through a hand-over; and machine code against a site of the test's own,
  which says back what it was sent: JSON and text, the headers, a reply's bytes,
  a move and a failing site as mistakes, a megabyte sent and 20,000 records sent
  as JSON and read back, and every mistake in what's asked.

## 40. Checkboxes, text areas and lists

- **The phrases.** `draw checkbox "Dark" at x, y`, `tick the checkbox "Dark"`
  and `untick` it, `the checkbox "Dark" is ticked` (or `is not ticked`) and
  `when the checkbox "Dark" is clicked`; `draw text area "Notes" at x, y size w
  by h`, read and emptied as a text box is, with `the text in the text area` and
  `clear the text area`; `draw list "Fruits" showing fruits at x, y size w by
  h`, `the choice in the list "Fruits"` and `when an item is chosen in the list
  "Fruits" with fruit`. As with buttons, each is a run of words that meant
  nothing before, so `checkbox`, `tick`, `area`, `showing` and `choice` are
  still names: `set tick to 3` still works.
- **Sizes.** A checkbox is a box 20 by 20 with its label after it, and for
  clicks it's 28 wide and 10 more for each letter, as a button's size comes from
  its label. A text area is 300 by 120 and a list 200 by 144, six rows, unless
  they're given a size, which must be above 0.
- **Checkboxes.** A click ticks or unticks one, then runs its handlers, which
  see it as it is now; the focus stays where it was, as for a button. Ticks are
  kept by label through `clear`, as what's typed is, so an app that draws its
  picture again shows the same ticks, and `tick` works before it's drawn.
- **Text areas.** A text box with lines: Enter starts a new line instead of
  running handlers, it holds up to 2,000 letters, and it shows as many of its
  last lines as fit, a line every 20, so what's being typed is always in view.
  Long lines aren't wrapped. A text box and a text area with the same label
  share their text, as two boxes do.
- **Lists.** A list shows its items as `say` shows them, a row every 24 from its
  top. They're copied when it's drawn, so changing the program's list changes
  what's shown when it's drawn again, which an app does after each event, and a
  list never shows something half changed. A click on a row chooses that item,
  gives the list the focus and runs `when an item is chosen` with the item
  itself, not its text: a number stays a number. While a list has the focus,
  up and down choose the item before or after (down from none chosen is the
  first) and scroll to keep it in view; every other key is the list's, and goes
  nowhere. The mouse wheel scrolls the list under it without choosing. What's
  chosen and what's first in view are kept by label through `clear`; `the
  choice in the list` is nothing until something's chosen, and when the items
  drawn no longer reach it.
- **A new event, `scroll`.** Hosts send it with x, y and a number of rows,
  down: the playground for a turn of the wheel (a row for each 24 pixels it
  would have scrolled the page), the window for each 40 of a turn (3 rows a
  notch, as Windows scrolls), and FOLIO_EVENTS as `scroll x y rows`. Like `type`,
  it's only ever for the picture's controls: no handler waits for it.
- **Where the rules live.** The Turtle in vm.js again: `route()` decides, and
  it tells the host what changed without the program drawing anything with
  items of their own, `{ checkbox, ticked }` and `{ list, chosen, top, focused
  }`, as a text box's `{ textbox, ... }`. machine.folio keeps an entry by label
  for each, 16 bytes for a checkbox and 64 for a list (its items, them as
  shown, what's chosen and what's first in view), a text area's being a text
  box's, and decides the same way.
- **What's drawn.** A checkbox in the pen's colour, white inside, with a box of
  the pen's colour in the middle while it's ticked. A text area as a text box,
  its lines 16 pixels high, the size the window's font is everywhere, so that
  machine code and the playground line up. A list white in a border of the
  pen's colour, 3 wide while it has the focus, the chosen row in the pen's
  colour with its text in white, and while its items don't all fit, a bar at
  its right for where the rows in view are among them.
- **Linux.** As for buttons: drawn and read, never clicked.
- **Tested.** The phrases and their near misses on all three engines, through a
  hand-over to the VM, and in compiler.folio against the JIT; machine code's
  window against the JavaScript engine on three runs of events, clicks, keys,
  the wheel and lines typed, and its pixels; and on Windows and Linux, ticks and
  choices read before anything's clicked, and every mistake in what's drawn.

## 41. Editing what's typed

- **What it does.** A click in a text box or a text area puts the cursor between
  the two letters nearest it, and a drag from there selects. The arrows, Home
  and End move the cursor (up and down between a text area's lines, Home and
  End to the ends of a line), and with Shift they select. What's typed takes the
  place of what's selected; Backspace and Delete take it off, or the letter
  before or after the cursor. Ctrl+A selects everything, and Ctrl+C, Ctrl+X and
  Ctrl+V copy, cut and paste with the computer's clipboard. A box shows the part
  of its text the cursor is in, moving across as it goes, and a text area moves
  down too; long lines aren't wrapped. There's no undo yet.
- **A letter every 10 pixels.** For a click to land between the same two letters
  everywhere, every engine has to agree on where each letter is, and the
  playground's fonts and Windows' measure text differently. So what's typed is
  drawn a letter at a time, one every 10 pixels from 8 in, in a font whose
  letters all take the same room (Consolas in the window, the browser's
  monospace font in the playground), and where the cursor goes is worked out
  from those numbers alone, as a button's size comes from its letters (§36). A
  text box shows 18 letters at a time.
- **Keys with Shift and Ctrl.** Hosts send them as `shift+left` and `ctrl+a`:
  Shift only with a key that moves the cursor, Ctrl only with a letter. A box
  with the focus uses them. With nothing focused, a key with Shift goes to the
  program without it, so `when a key is pressed` still gets `left`, and a key
  with Ctrl goes nowhere, as before; a list with the focus ignores Shift.
- **The clipboard is the host's.** The Turtle never sees it. Copying is the host
  reading what's selected (the playground from what the turtle last drew, the
  window from the box's entry); cutting is that, then `ctrl+x`, for the box to
  take it off; pasting is the host typing what's on the clipboard, which follows
  typing's rules: a text box drops new lines, and a text area keeps them. The
  window turns Windows' CR LF into new lines and back. While the events come
  from FOLIO_EVENTS it leaves the clipboard alone, so the tests never touch the
  clipboard of the person running them.
- **What's kept.** Where the cursor is, the other end of what's selected, and
  the first column and line in view are kept by the box's label with its text,
  through `clear`, and `clear the text box` puts the cursor back at the start.
  The turtle reports them with the rest: `{ textbox, text, focused, cursor,
  anchor, left, top }`. A place is counted in letters, as JavaScript's
  `[...text]` counts them; machine code finds a letter in the UTF-8 bytes by
  walking them, and a box's entry there grew from 16 bytes to 64.
- **Tested.** A run of 76 events on all three engines, through a hand-over to the
  VM, and in the window against the JavaScript engine: moves, Shift's selecting,
  Ctrl+A, Ctrl+X, a drag, a 40-letter limit, a text area's lines and moving down
  it, and keys with Shift and Ctrl with nothing focused; the window's pixels (the
  selection's light blue, the cursor, a letter every 10); and the clipboard in a
  real window, by hand: a copy, a cut of two lines (CR LF on the clipboard), and
  a paste into a box.

## 42. Dropdowns, sliders, and choosing a file

- **The phrases.** `draw dropdown "Size" showing sizes at x, y`, with `when an
  item is chosen in the dropdown "Size" with size` and `the choice in the
  dropdown "Size"`, which are a list's: `list` and `dropdown` mean the same there.
  `draw slider "Volume" from 0 to 100 at x, y`, `set the slider "Volume" to 50`,
  `the value of the slider "Volume"` and `when the slider "Volume" is moved with
  volume`. `choose a file to open`, and `choose a file to save`. Each is a run of
  words that meant nothing before, so `dropdown`, `slider`, `moved` and `choose`
  are still names, and `set the slider` was a mistake (`set the` wants `to`).
- **A dropdown is a list that's closed.** It's 200 by 30, showing what's chosen,
  or its label in grey, and an arrow. A click opens it: its items in a list
  below it, up to 6 rows, on top of everything else, which the wheel scrolls.
  While it's open, any click closes it, and one on an item chooses that item;
  a click anywhere else does nothing more, so closing a dropdown never presses
  the button under it. While it has the focus, open or not, up and down choose,
  Enter and Space open and close it, and Escape closes it. Its items, what's
  chosen and what's first in view are kept by its label, as a list's are.
- **A slider** is 200 by 20, its value a whole number from its `from` to its `to`
  (either way round), starting at `from`. A click moves it there, and so does a
  drag from it; the arrows move it a step, and Home and End to its ends. Its
  handlers run when its value changes, with the value; `set the slider` changes
  it without running them, kept to its range while it's drawn. Whole numbers keep
  every engine and machine code on the same value for the same click, as a
  letter every 10 pixels keeps them on the same place in a text box (§41).
- **Choosing a file is asking.** `choose a file to open` asks "Which file to
  open?" and gives the answer, or nothing for an empty one. A host that can do
  better does: the playground shows a file picker for a question that starts
  that way, as it shows a pad for one that starts "Draw", and the file picked
  joins the page's files, so `read` finds it by its name; the window shows
  Windows' own Open or Save box, titled with the question, and gives the file's
  whole name. Anywhere else (Linux, or a program reading its answers from a
  file) it's a question like any other. In the playground, as with `ask`, an app
  can't choose a file once it's running; machine code's apps can, from a button.
- **Where the rules live.** Turtle.route in vm.js again, which reports what
  changed with `{ dropdown: label, chosen, top, focused, open }` and `{ slider:
  label, value, focused }`. Machine code keeps a slider's value, and the range it
  was last drawn with, in an entry of 32 bytes by its label, and gives a dropdown
  a list's entry.
- **Tested.** A run of 31 events on all three engines, through a hand-over to the
  VM, and the same events in the window against the JavaScript engine; values,
  choices and every mistake in what's drawn, on Windows and Linux; the
  playground's picker; and Windows' Open and Save boxes in a real window: a file
  chosen, a name to save with an é in it, and both cancelled.

## 43. Faster records, and timing machine code fairly

- **What was slow.** The README said machine code was slower than the
  JavaScript engines at lists, records and dictionaries, from `npm run bench`,
  whose runs are short. Made ten times as big and more, with starting up taken
  off, they say otherwise: machine code is two to five times as fast as the JIT
  and WebAssembly at lists, dictionaries and text. Only making records was
  slower than WebAssembly, which, seeing that a record made in a loop doesn't
  outlive it, never makes it at all.
- **Records in one block.** A record made in the program's own words, `record
  with x 1, y 2`, whose fields' names all differ (as they do but in `record with
  a 1, a 2`), is now one block: the record, then room for its fields and one
  more, which go straight in, not looked for one by one first as a field set
  later is. A record given more fields than that moves them to a block of their
  own, as before. Two million records made and read went from 99 ms to 64 ms,
  WebAssembly's 61. The collector finds a block from a pointer into its middle,
  so fields inside their record's block need nothing new from it.
- **Tried, and left out.** Finding a field in line, where it's read, rather than
  in the runtime: 2% quicker, for code that's bigger at every `x of point`.
- **Timing fairly.** On Windows the virus checker looks through a program the
  first times it runs, and one in the temporary folder every time: a program
  that only says 1 took 23 ms to start from there, and 6 to 15 ms from anywhere
  else. `npm run bench` and `npm run versus` built their programs in the
  temporary folder, and timed their first runs; they now build them in a folder
  of the repo's and run each once or twice first, and the bench has a row for a
  program that only starts, to read the rest against. Every compiled language
  in `versus` got quicker for it, Folio's machine code with them.

## 44. A window on Linux

- **What it lacked.** On Linux a program that drew showed nothing, and an app
  set up and ended: the window was GDI+ and Windows' own, and Linux has neither
  in every program's reach. Its X server is in reach, by a socket, and nothing
  else is needed to speak to it, so the program speaks X11 itself, as it speaks
  HTTP and WAV: no Xlib, no library at all, and still nothing to install.
- **Drawing.** What's drawn is drawn by the runtime, into 500 by 500 pixels in
  memory, as a canvas draws it: a pixel's middle half a pixel in, and each
  shape's edge smoothed by how much of each pixel it covers. A line is every
  pixel within half its width of the line between its ends, so its ends are
  round; a circle, a disc smoothed at its edge; a dropdown's arrow, a triangle,
  16 points tried in each pixel; a picture, the nearest of its pixels, as a
  canvas with smoothing off. GDI+ puts a pixel's middle on the corner, so the
  two systems' edges can differ by half a pixel; the tests ask about places
  away from edges.
- **Letters.** There's no font to ask for either, so the letters come with the
  program: DejaVu Sans, drawn by FreeType at 16 pixels to the em and at 24, and
  DejaVu Sans Mono at 16, 4 bits of ink a pixel, made into machine.folio's
  tables by `tools/glyph-tables.py`. Text 16 high, which is every button's,
  box's and list's, is drawn from the table at 16 with each letter on a whole
  pixel, as hinting puts it, which keeps its lines sharp; any other size is
  read from the one at 24 between its pixels. Latin-1 is there, and any other
  character is U+FFFD. The tables make a Linux program that draws 45 KB
  bigger, 59 KB with boxes to type in, and carry the fonts' licence, as it
  asks ([`LICENSE-DejaVu`](LICENSE-DejaVu)).
- **The window.** `DISPLAY` names the server: `:0` is its socket in
  /tmp/.X11-unix, or the same name in the abstract namespace, and `localhost:0`
  is TCP. A cookie from `XAUTHORITY`, or ~/.Xauthority, goes with the hello if
  there's one for that display. The window is 500 by 500, a size its window
  manager is asked to keep, named as on Windows, and closes as a message, not
  by the connection going. What's drawn goes to it 100 rows to a request, its
  pixels as they are, so a server whose pixels aren't 32 bits, the low byte
  first, gets no window, as one that isn't there doesn't.
- **What happens to it** is what Windows' window does, event for event: a key
  with a name by its name, a letter in lower case and then, for a box, as
  typed; Shift with the keys that move the cursor; Ctrl with a letter, for a
  box; the wheel, 3 rows a notch; Escape closing a picture. Keys come as X's
  keysyms, read from the server once, the keypad's digits with Num Lock
  included. Timers are the program's own, waited for between the server's
  messages, and the window is drawn again once nothing's left to do.
- **Timers aren't buttons.** Building it found that a timer and a button's
  handler had the same number for what they wait for, 3, so a button's handler
  was taken for a timer: in Windows' window it ran every 10 milliseconds, and
  `tick 0` in `FOLIO_EVENTS` could reach it. A timer has a number of its own
  now, after the events', on both systems.
- **Tested.** The thirteen tests of the window's, on Linux as on Windows,
  through `FOLIO_PICTURE` and `FOLIO_EVENTS`, which go through the same drawing
  and the same handling; and a real window, on WSLg's X server, sent the
  tests' clicks, keys, drags and turns of the wheel by another X client, and
  read back by it: for the to-do app, the checkboxes and lists, the dropdown
  and slider, and editing, it said and showed, pixel for pixel, what the same
  events did through `FOLIO_EVENTS`. And DISPLAY by TCP, a cookie sent for its
  display and not another's, no server, no terminal, Escape, stopping from a
  handler, and a title cut at 200 bytes between characters.
- **Not yet.** The clipboard, which X keeps by messages between programs; the
  pad; boxes for choosing a file; keysyms of the old kinds past Latin-1, such
  as Cyrillic's, which give nothing; and a Mac's window.

## 45. Libraries: calling C

- **Why.** A large program needs what's already written: a database, the
  system's own functions, compression, a window toolkit. Writing each of them
  into the runtime, as the Linux window was, doesn't scale. So a program can
  call any C library's functions itself, as a C program would.
- **Declaring them.** `use the library "sqlite3"`, then a line for each function
  the program calls and `end`: its name as the library has it, what it takes,
  and what it `gives`, in Folio's words for C's types. `a number` is a double,
  `a whole number` an int (a uint fits too), `a long whole number` 64 bits,
  `a pointer` a whole number, nothing or bytes, `text` UTF-8 and `wide text`
  wchar_t's, both ending in a 0 C sees and Folio doesn't, `bytes` the program's
  own memory, which C can fill (a pointer it gives back, say), and `yes or no`
  an int. Each line makes a function of the program's, called like any other,
  whose inputs say what they are, so a call with text for a number stops where
  it's made. Names are the library's, in their case; Folio's own words go in
  quotes with a name for them: `"remove" as remove_file(text)`. Libraries
  named with `or` are tried in turn, so `"winsqlite3" or "sqlite3"` is SQLite
  on Windows and Linux; `as` keeps a library's functions apart, as for a file.
- **Calling one.** The first call loads the library and finds the function:
  LoadLibraryExW and GetProcAddress on Windows, from System32 and then the
  program's folder, never the current one or PATH; dlopen and dlsym on Linux,
  where `"sqlite3"` is libsqlite3.so, or .so.0 to .so.9, as packages install
  it. Each input is made what C wants, with text copied into memory of its own,
  and put where the system's convention wants it: Windows' four registers,
  each a number's xmm register too, for a function that takes any number of
  inputs, and the stack; or Linux's six registers for whole numbers and eight
  for numbers, and how many of those in al. Then what it gives is made a
  value: a pointer of 0 and a text of none are nothing.
- **Linux, dynamically linked.** A Linux program had no linker: the kernel ran
  it as it was. One that uses a library is now linked by glibc's, which loads
  libc and gives it dlopen and dlsym; it's otherwise the same program, still
  speaking to the kernel itself. Every other program stays as it was.
- **Asked first.** A library can do anything the program can, beyond the
  reach of the --allow flags, so using one is asked for, as starting a program
  is: at a terminal, once for each library; anywhere else, only with
  `--allow-libraries` (or `--allow-all`).
- **Only in machine code.** The playground and the JavaScript engines can't load
  a library, so a call there is a mistake that says so, as `run program` is.
- **A library of Folio's on one.** `tools/sqlite.folio` keeps a database in a file
  through SQLite, which comes with Windows (winsqlite3.dll) and most Linux
  systems: `open`, `run` and `query`, each row a dictionary, values bound to
  `?`s, and SQLite's mistakes as `fail with`. An `out` pointer is 8 bytes C
  fills, read back in Folio.
- **Tested.** On Windows and Linux: the C library's own functions with each
  kind of input and what they give, 15 inputs to `sprintf`, past the registers
  on both systems, a function of a library's as a value, each mistake (a
  number that isn't whole, a library or function that isn't there, no
  --allow-libraries), and only a program with a library being linked; and
  sqlite.folio's database, written, read back and opened again.
- **Then structs, floats and callbacks** (§46).

## 46. Structures, callbacks and floats

- **Why.** Most of a system's own functions take a struct, and much of what
  makes a program a program, a window above all, needs C to call back into
  it: Windows calls a window's procedure for everything that happens to it.
- **Structures.** `structure point with x as a whole number, y as a whole
  number`, in a library's block, makes `a point` a type its functions can take
  and give, and its other structures and callbacks hold. A field is any of
  the types an input can be, but bytes, which are `16 bytes` or as many as the
  struct has in a row, another structure, held in it, or a callback. They're
  laid out as C lays them out: each on the boundary its size wants, and the
  whole rounded up to its largest. A function given one takes where it is, as
  C passes nearly every struct: the record is made a struct in memory of its
  own, a field it hasn't made 0, nothing a pointer of 0; and once the function
  is done, each field is made a value again and set in the record, so what C
  fills in, the program reads, as `GetCursorPos` and `mktime` want. A
  structure it gives, from where it is, is a new record, or nothing for none.
  A mistake in a field says which: "'memcpy' needs input 1's size to be a
  number, not text".
- **Callbacks.** `callback compare(a cell, a cell) gives a whole number` makes
  `a compare` a type an input or a field can be, given a function of the
  program's that takes as many inputs. C can't call a Folio function, so each
  kind of callback has 64 entries in the program, small pieces of code C can
  call, each with a slot that holds the function it calls: a function given
  for one takes the slot it had, or the first that's empty, and C is given
  its entry. The entry keeps the registers C wants kept, makes what C gave
  values, calls the function as an app's handler is called, the first call in
  progress, and makes what it gives what C wants. The slots are where the
  collector looks for values, so a function C holds on to stays. A mistake in
  one ends the program then and there: going on past C's own code, which is
  in the middle of calling it, would leave the library half done.
- **Floats.** `a float` is C's float, 4 bytes, for the functions, OpenGL's and
  the like, that take one; it's a number to Folio.
- **Tested.** On Windows and Linux: `qsort` sorting with a Folio function as
  its comparison, given records of structures; `mktime` filling in a struct it
  was given; a structure of text, bytes, another structure and a number,
  copied by `memcpy`; floats both ways; and each mistake. On Windows, a window
  class registered with a structure that holds a callback, its window made
  and destroyed, its procedure a Folio function Windows calls with each of its
  messages, and `EnumWindows` calling one for every window.
- **Not yet.** A struct passed or given by its value, whole numbers of 8 or 16
  bits, a callback called from another thread, and a Mac.

## 47. Windows' own controls, in Folio

- **Why.** An app's window draws its own buttons and boxes, the same on every
  system and in the playground, but they're Folio's and not Windows': no
  menus, no Tab between them, nothing a screen reader knows. With libraries,
  structures and callbacks, a program can use Windows' own, so
  [`tools/windows.folio`](tools/windows.folio) does, in Folio and nothing else:
  a module on user32.dll, kernel32.dll, gdi32.dll and comdlg32.dll, about 540
  lines, and a program that uses it is built with `--allow-libraries`.
- **What it makes.** `window`, then `button`, `label`, `text_box`,
  `text_area`, `checkbox`, `list_box` and `dropdown` in it, at places and
  sizes in pixels as at 100%; `menu_item`, `timer`, `message`, `ask_yes_no`,
  `choose_file_to_open` and `choose_file_to_save`; and `run`, which handles
  what happens until the first window closes. Each control is a record with
  its handle, so the module's own declarations, `ui's sendmessagew` among
  them, can be given it for anything it doesn't wrap.
- **What happens.** One window class, whose procedure is a Folio function:
  Windows' WM_COMMAND, from a control or a menu item, finds the control by
  its number and calls its handler, a button's with nothing, a checkbox's with
  whether it's ticked, a list's with what's chosen, a box's with its text;
  WM_TIMER a timer's; WM_SIZE the window's, with its size as at 100%; and
  WM_CLOSE asks the window's, which can say no. `IsDialogMessageW` in `run`
  gives Tab and Shift+Tab between the controls.
- **The look.** Windows draws controls as Windows 95 did unless a program asks
  for version 6 of its common controls, by a manifest. Folio's programs have
  none, so the module makes an activation context from the one shell32.dll
  has, resource 124, and keeps it active: buttons, checkboxes, boxes and
  lists are drawn as Windows 11 draws them. It says it knows about screens set
  larger than 100% (`SetProcessDPIAware`), makes every place and size bigger
  by the screen's dots per inch, and uses Segoe UI at 9 points, as Windows'
  own programs do.
- **Text.** A box's text goes in and out as UTF-16 (`wide text`); its line
  ends are Windows' CR LF, so `text_of` gives `\n` and `set_text` takes either.
  `lstrcatW` onto an empty string reads a UTF-16 buffer back as text, which
  Folio's types have no other way to. A box holds as much as Windows will, not
  the 32,767 characters it starts with. `on_change` is for what's typed: a
  one-line box tells its window when `set_text` changes it and a text area
  doesn't, so the module ignores the first while it's setting the text, and
  neither calls the handler.
- **Keys.** A menu item's text can end with a tab and its keys,
  `"Save\tCtrl+S"`, as Windows shows them. Windows' own way, an accelerator
  table, needs a handle made from a struct per key; instead `run` looks at
  each key pressed before it's handled, as `GetKeyState` says Ctrl, Shift and
  Alt are, and gives a menu item's handler the keys that are its. Keys it
  doesn't know are a mistake when the item is made, not when they're pressed.
- **A demo.** [`tools/notes.folio`](tools/notes.folio), a notepad in under 120
  lines: New, Open, Save and Save as with their keys, the file's name in the
  title with a `*` while it isn't saved, and a question before what's written
  is lost.
- **Tested.** A program of the test's, in a hidden window, driven by its own
  timer: typing, a click on a button and a checkbox, choosing in a list and a
  dropdown and removing from one, a menu item, a text area's lines, a resize,
  Ctrl+S and Ctrl+Shift+F5 pressed with the thread's keys set to show them
  held, a key without them typed as a key, keys that aren't keys, and closing.
  And notes.exe, driven by another program's window messages: typed into,
  saved through the Save box, saved again without it, closed with changes
  (No kept it, Yes closed it), a file opened through the Open box, one with CR
  LF opened as it was, and New.
- **Not yet.** Linux's own controls (see §49); pictures and drawing in a
  window of its own; more than one window's Tab order; and windows.folio on the
  JavaScript engines, which can't call a library.

## 48. Faster calls

- **Where the time went.** fib(32) took 33 ms against C's 20. In each call, a
  function knew nothing about what it was given, so `n is less than 2` first
  checked that n was a whole number (three instructions and two jumps), and a
  call knew nothing about what came back, so `fib(n - 1) + fib(n - 2)` checked
  the sum for a NaN that might mean text. The frame kept the number of the
  call that made it, for a mistake's trail, which took an instruction at the
  call and another in the function. And a number the program wrote, `n - 1`,
  was loaded into a register before it was used.
- **What each function is given and gives.** For a function only ever called
  by its name, and never used as a value, machine.folio works out what kind of
  value each input always gets and what it always gives back: a whole number,
  a number, or anything (the kinds of §32). Each input is first taken to be a
  whole number and the function to give one, then each guess is made less
  wherever the program says otherwise, until nothing does: so fib, given 32
  and then n - 1 and n - 2 of a whole n, is given whole numbers and gives
  them, which only a guess that holds up against its own calls finds. Going
  through the program for this is quick: each finding changes the guess there
  and then, and only the functions whose inputs changed, or that call one
  whose result did, are gone through again.
- **Checked as it's written.** That's a guess, made by going through the
  program as writing its code does, but not by writing it. So writing it
  checks it: every call notes the kinds it gives each input, every return
  the kind it gives, and every use of a function as a value. If any of it is
  less than the guess, the program is written again with what was found, and
  if that doesn't hold either, with no guess at all, which can't be wrong. So
  the code relies only on what's true: each call gives what was assumed, and
  each function, written assuming it, gives what was assumed.
- **Smaller pieces.** A number the program wrote on the right of `+`, `-`,
  `*`, `/` or a comparison of two whole numbers is used where it is in
  memory, and so is a variable sure to be a number, and `a + b` and `a * b`
  of two numbers add or multiply from the stack when the left side had to
  wait there. A frame no longer keeps its call's number: the call is followed
  by `test eax, number`, which changes nothing that's used, and the trail
  reads the number from where the frame goes back to; the runtime's own calls
  into a handler or a callback, and main's, are followed by -1, where the
  trail stops. A table of every call's return place did it first, but cost
  16 bytes a call, 589 KB of folio.exe.
- **The JavaScript engine's `is`** made a new Map every time it compared two
  values, for lists that hold themselves, even for two texts. It makes one
  only for lists, dictionaries and records now, which took a third off
  compiling folio.folio with Node.js (21 s to 14.5 s), more than going through
  the program costs.
- **What it gave.** fib(32) in 27 ms, against C's 20 and Rust's 18; the
  other three are as they were. Each of fib's calls is about 25 instructions,
  from about 35. folio.exe is 0.9% bigger.
- **Tested.** Programs written to break it, which machine code must say,
  fail and exit on exactly as the JavaScript engine does: a function given a
  whole number in one call, a fraction in another and text in a third, one
  used as a value and called with text, fib given 10.5 and text, a function
  that gives a number, text or nothing by the path it takes, infinities and
  sums past 2^53, two functions that call each other, a loop's variable
  passed on, an input changed to text, and `is divisible by` of inputs.
- **Not yet.** Inputs in registers instead of on the stack, a function's
  variables kept in registers through the calls it makes, and functions put
  in line where they're called. (The first and the last are §63.)

## 49. Linux's own controls, and one module for both

- **Why.** windows.folio gave a program Windows' own controls, and only
  Windows'. Linux has no one set of its own, but GTK 3 comes with nearly every
  desktop, GNOME's and the rest, and libgtk-3.so.0 is a library like any other,
  so [`tools/linux.folio`](tools/linux.folio) is windows.folio's functions again,
  on it, in Folio, about 600 lines.
- **How it's made.** A window is a GtkWindow holding a box: the menu bar, when
  there is one, on top, and under it a GtkFixed, which puts each control where
  it's asked, as Windows does. A text area and a list are in a scrolled window
  with a border; a list is a GtkListBox of labels, and a dropdown a
  GtkComboBoxText, each keeping its items' text in Folio as well, which GTK makes
  hard to read back. Places and sizes are as at 100%, which GTK makes bigger
  itself for a screen set larger, and it makes nothing smaller than it can be
  drawn.
- **What happens.** GTK calls a C function for each signal. Every one is
  connected with the control's number as its data, to one of four Folio
  functions, by what the signal gives: a click, a tick, a change of text, a
  menu item chosen and a window gone; a list's choice and a new size; a window
  being closed, which says whether it may; and a timer, which keeps going. So
  four callback entries are all a program uses, however many controls it has.
  A control the program changes itself doesn't tell it: as in windows.folio,
  `set_text`, `choose` and the rest are kept quiet, where GTK would signal
  them. A new size is told on Linux as the window first opens, too.
- **Keys.** A menu item's keys, `"Save\tCtrl+S"`, become an accelerator of the
  window's, which GTK shows beside the item and handles itself.
- **GTK's own text.** What GTK makes and the program must free, as a text
  view's text and a file box's name, comes back as a pointer: `strstr(p, "")`,
  which gives p, reads it as text, and `g_free` frees it.
- **One module for both.** [`tools/ui.folio`](tools/ui.folio) uses both, and as
  it starts asks Windows' kernel32 for the time: on Linux there's no library
  called that, which is a mistake it catches. Each of its functions then calls
  windows.folio's or linux.folio's. A library is only loaded when it's first
  called, so the other system's is never looked for.
  [`tools/notes.folio`](tools/notes.folio) uses it, so the notepad is one
  program for both.
- **Tested.** On Linux, linux.folio's own test, the same window as
  windows.folio's, driven by its own timer through GTK's functions for a click
  and typing, a list's choice made as a person would make it, and its menu's
  keys pressed through `gtk_accel_groups_activate`; ui.folio's, on Windows and
  on Linux; on WSLg's display here, and on CI's from Xvfb. And notes, on
  Linux, typed into by another program's X events, its Save box answered,
  saving what was typed, and closed.
- **Not yet.** A Mac's controls, which are Objective-C's and need more than
  calling C; and GTK 4.

## 50. Tabs, tables, progress bars, pictures and drawings

- **What an app was missing.** Real programs show more than buttons and boxes:
  settings on tabs, rows of data, a bar while something's being done, a
  picture, and something they draw themselves. Each is now in windows.folio
  and linux.folio, with the same functions, and in ui.folio.
- **Tabs.** `tabs` makes them, and `tab(tabs, "People")` a page, which is a
  parent like a window: controls put on it show while its tab is chosen. GTK's
  notebook has a page of its own for each; Windows' tab control is only the
  tabs, so a page's controls are the window's, put inside the tabs (where
  TCM_ADJUSTRECT says), shown and hidden as its tab is chosen, and the tabs
  kept under them for clicks to reach them. The handler is given the tab's
  title when the person chooses one, from WM_NOTIFY's TCN_SELCHANGE, or GTK's
  switch-page.
- **Tables.** `table(parent, columns, ...)` and `add_row(table, values)`, each
  value shown as `say` shows it; `chosen_row` gives the chosen row's values,
  and the handler is given them when the person chooses one. Windows' list
  view, in report view, a whole row chosen at a time, with grid lines; GTK's
  tree view on a list store of texts.
- **Progress bars** from 0 to 100, Windows' with the green of version 6 of its
  common controls, which InitCommonControlsEx makes ready under the activation
  context from §47.
- **Pictures.** `picture(parent, file, ...)`, made the size it's put at: on
  Windows by GDI+, which reads PNG, JPEG, GIF and BMP and gives a bitmap for a
  static control, the window's own colour under what's see-through; on Linux
  by GdkPixbuf. A file that isn't there, or isn't a picture, is a mistake.
- **Drawings.** `drawing(parent, ..., painter)` calls the painter whenever it
  must be drawn, and after `redraw`, with a canvas: `colour`, then `rectangle`,
  `circle`, `line` and `words`, at places as at 100%, and `on_click` gives
  where it was clicked. Windows paints it with GDI on WM_PAINT, in a window
  class of its own that shares the windows' procedure, with the DC's own brush
  and pen, whose colours change without making any; GTK with cairo, on its
  draw signal.
- **Names.** Folio's names don't mind capitals, so a function called
  `rectangle` and Windows' `Rectangle` are the same name: windows.folio calls
  GDI's `"Rectangle" as fill_box` and `"Ellipse" as fill_ellipse`, and cairo's
  is `cairo_box`.
- **What GDI gives.** A GDI handle is 32 bits, sign-extended to 64, so read
  from memory as 8 bytes it would be a number past what a pointer can be; it's
  read as 4, with its sign.
- **Tested.** On Windows and on Linux, the same window: a progress bar set,
  and set past 100; a picture shown, and a mistake for one that isn't there; a
  drawing painted (and on Windows clicked, by its message); a tab chosen as a
  person would choose it, with its handler, and one chosen by the program,
  without; a table's rows added, one chosen by the program and one by a
  person, and cleared. Each system's own look was checked by eye, from
  screenshots. And a click on GTK's drawing, sent by another program's X
  events, landed where it was sent.

## 51. A web server

- **Why.** A program could read sites and send to them, but not be one, and a
  backend, an API or a page for a phone on the same network is a site.
  [`tools/server.folio`](tools/server.folio) is one, in Folio, on the system's own
  sockets: Winsock's on Windows, libc's on Linux, the same functions declared
  in two libraries and the right one called, as ui.folio chooses.
- **What a program writes.** `web's serve(8080, answer)`, where `answer` is
  given a request, a record of its method, path, query, headers and body, and
  gives back text (a page if it starts with `<`), a list or dictionary (sent as
  JSON), or a record with any of status, body, type, headers and file, a file
  whose bytes are sent with the type its name says. `serve` answers this
  computer alone, at 127.0.0.1; `serve_everywhere` every network, which is the
  program's choice to make. `stop_serving` ends it.
- **How it reads a request.** Into a block that doubles when it must, until the
  blank line after the headers, then as many more bytes as Content-Length says,
  16 MB at most (413) and 64 KB of headers (431). The query is decoded, `%20`
  and `+` included, by hand: `number of` doesn't read hex. Every answer says
  `Connection: close`, and requests are answered one at a time.
- **When the handler fails.** The mistake goes to the error output, the request
  gets a 500 that says it, and the server goes on to the next. A connection that
  goes before it's answered is a mistake too, said the same way; on Linux it's
  sent with MSG_NOSIGNAL, so it isn't the end of the program, as SIGPIPE would
  make it.
- **Tested.** A server built from the test's program, answering another Folio
  program, which `read`s and `send`s to it as to any site: a page, a query
  decoded, JSON with a header seen, a POST's body given back with its status, a
  file, a missing file's 404, the handler's mistake as a 500 with the server
  going on, and `stop_serving`, on Windows and on Linux.
- **Not yet.** More than one request at a time, keeping a connection open for
  the next, HTTPS (a proxy in front can do it), and WebSockets.

## 52. Work in the background

- **Why.** A window whose program is busy can't be drawn or clicked: a slow
  download or a long sum freezes it. Folio's runtime has one stack, one
  collector and one set of registers it keeps things in, so it can't run two
  of its functions at once. Two programs can, so
  [`tools/tasks.folio`](tools/tasks.folio) runs the slow part as another one.
- **What a program writes.** `tasks's start(program, inputs)` starts another
  program and gives back at once; `start_self(inputs)` starts this same program
  again, which looks at its `arguments` to know it's to do the job, and says
  what it found. `done(task)` takes what the task has said so far and says
  whether it has ended, without waiting, so a window's timer can ask it;
  `wait_for` waits; `output_of` is all it said, to its output and its error
  output; `code_of` the number it ended with; `stop_task` ends it.
- **On Windows.** CreateProcessW, with an inheritable pipe for the task's
  output and error output, its reading end kept back, and no console window.
  Its inputs are made one command line by the rules CommandLineToArgvW
  undoes: one with a space, a tab or a `"` in it, or none at all, in quotes,
  with a `"` and the backslashes before it escaped. PeekNamedPipe says what's
  there without waiting for it.
- **On Linux.** fork, then in the new process dup2 of the pipe to its output
  and error output, and execvp, which finds the program on the PATH and keeps
  the environment; `poll` with no wait says what's there, `waitpid` with
  WNOHANG whether it has ended. A program that isn't there ends with 127, as
  the shell's does; on Windows it's a mistake when it's started. The inputs
  are C's strings from strdup, and argv is built from their addresses.
- **Tested.** On Windows and Linux: the program started again to sum to a
  million, asked while it ran, ending with 3; inputs with a space, quotes,
  backslashes, an empty one, é and an emoji, as they were; a task that never
  ends, stopped (1 on Windows, 137 for SIGKILL on Linux); and a program that
  isn't there.
- **Not yet.** Sending a task its input, and telling its output from its
  error output. Threads of the program's own are §62.

## 53. Shipping a program: its icon, its version and its files

- **Why.** A program to give someone is one file, and on Windows it looks like
  one of theirs: an icon in Explorer and the taskbar, and a version in its
  properties. Its pictures and data shouldn't be files lying beside it.
- **`--include`.** `folio build app.folio --include data --include logo.png`
  builds the files, and every file in a folder and the folders inside it,
  into the program's read-only data, each with its name as it was given, `/`
  between folders and no `./` at the start. `read` and `read bytes`, and what
  reads through them (a picture's file, say), look for the name there first,
  byte for byte, and then on the disk: a file that's built in is the
  program's own, so it needs no `--allow-read`.
- **`--icon` and `--version`**, on Windows, make a resource section, `.rsrc`,
  after the data: the directories Windows reads resources by (type, then
  number, then language, US English), the icon's pictures as RT_ICON, the icon
  made of them as RT_GROUP_ICON, number 1, and RT_VERSION, the fixed numbers
  and the text Explorer shows: the version, and the program's name as its
  description, product and file name. An .ico file's pictures are taken as
  they are; a .png is one picture, which Windows shows from inside an icon
  since Vista. windows.folio's windows use icon number 1 for theirs, so a
  program built with an icon has it in its title bar as well, and `set_icon`
  gives a window one from a file, on Linux too.
- **For Node.js** `machineCompiler`'s options take `icon`, `version` and
  `include`; machine.folio's `compile_shipping` takes them, and
  `compile_allowing` is it with none.
- **A mistake in what it's given** (an icon that isn't one, a version that
  isn't up to four whole numbers, a file to include that isn't there) is
  folio's, said as `folio: ...`, not a place in the program.
- **Tested.** folio.exe building a program with a folder of files, one inside
  another, a picture built in and used as its icon, and a version; the program
  moved to a folder with none of them, reading them all, and refused a file
  that isn't built in; on Windows, its RT_ICON, RT_GROUP_ICON and RT_VERSION,
  and the version as Windows' own `VersionInfo` reads it; and the three
  mistakes. On Linux, the files.

## 54. Patterns, numbers, CSV and dates

- **Why.** Programs check what's typed, pull numbers out of text, show money
  with two decimals, read and write spreadsheets' CSV, and count days. None of
  it needs the system, so [`tools/text.folio`](tools/text.folio) and
  [`tools/dates.folio`](tools/dates.folio) are Folio alone, and work on every
  engine, machine code and the playground's three.
- **Patterns** are regular expressions as most languages have them: classes,
  `\d \w \s` and their opposites, `.`, `^ $ \b`, groups kept and not, `|`,
  `* + ?` and `{n,m}`, each greedy or not, and `(?i)`. A pattern is read by
  recursive descent into a program of steps (a character, a set of ranges, a
  split between two places to go on from, a jump, a group's edge saved, and
  the tests for the start, the end and a word's edge), and run by
  backtracking, with its own stack, not Folio's calls, so a long text can't run
  out of them. A split is tried in its order, so the first match is the one
  other languages find. A step at a place in the text that has been tried
  before is not tried again: it can't do better the second time, so `(a*)*b`
  can't go round for ever and `(a|aa)*c` isn't exponential, as RE2's
  bit-state backtracker does it. Repeats are copies of the steps: `{2,4}` is
  two, then two that may be skipped.
- **Numbers.** `number_text` rounds as a person does, half away from 0, on the
  digits Folio shows (15 of them), so `number_text(2.675, 2)` is `2.68`, where
  arithmetic on the double, 2.67499..., would give 2.67. `grouped` puts a
  comma (or `grouped_with`'s separator) between each three digits.
- **CSV** as RFC 4180 has it: commas, a value in quotes when it has a comma, a
  quote or a new line, `""` for a quote, and a line ending with a new line or
  a return and one; `read table` still reads a CSV file as records.
- **Dates** are records of a year, month and day, checked when they're made.
  A date's number of days from 1 January 1970, and back, is Howard Hinnant's
  days-from-civil, which counts from March, so February's leap day is last,
  in eras of 400 years. Folio has no floor, so it's the digits before the
  point, one less for a fraction below 0. Weekdays come from 1 January 1970
  being a Thursday; months are added keeping the day, or the month's last.
  `format_date` takes the tokens from the longest, `[ ]` for words as they
  are; `today` and `now` are Folio's own `the year`, `the hour` and the rest.
- **Tested.** text.test.folio's 8 tests and dates.test.folio's 6, on all three
  engines and in machine code, through folio.exe's test runner: patterns
  matching and not, groups and the rest, finding every match and empty ones,
  replacing with `$1` and `$$`, splitting, the two that would never end, bad
  patterns' mistakes, rounding at the edges, CSV both ways and back, and
  every week of 400 years, counted as a person counts them, against both of
  the date's directions.

## 55. Files, folders, the environment and SHA-256

- **Why.** Folio reads, writes and removes files, and lists a folder, but a real
  program also moves a file, makes a folder for its data, asks how big a file
  is or when it changed, reads `PATH` or `HOME`, and checks a download against
  its hash.
- **SHA-256** is [`tools/hash.folio`](tools/hash.folio), FIPS 180-4 in Folio, so
  it works everywhere. Folio's numbers are doubles, exact to 2^53, and its bit
  operations work on whole numbers up to there on every engine, so 32-bit
  words fit, and a sum of five of them does before it's cut back to 32 bits.
  Turning a word right by n would shift it left by up to 31 bits, past 2^53, so
  it's done by multiplying what falls off by 2^(32 - n) instead.
- **Files, folders and the environment** are
  [`tools/system.folio`](tools/system.folio), on the system's own functions:
  kernel32's on Windows (GetFileAttributesExW for a file's size and when it
  changed, a FILETIME's 100 ns since 1601 made seconds since 1970; MoveFileExW,
  CreateDirectoryW, GetEnvironmentVariableW and the rest), libc's on Linux
  (`stat`, its mode at byte 24, its size at 48 and its time at 88 on x86-64;
  `rename`, `mkdir`, `getenv`, `getcwd` and the rest). `make_folder` makes the
  folders a folder is in too, as `mkdir -p`. `move` is a Folio word (the
  turtle's), so it's `move_file`, and `copy_file` to match.
- **Tested.** hash.test.folio: the empty text, `abc`, the fox, FIPS 180-4's
  448-bit one, 55, 56 and 64 bytes of `a` (where the padding takes another
  block), text and its bytes alike, and 1000 bytes against Node's crypto, on
  all three engines and in machine code. system.folio: one program, run on
  Windows and on Linux, saying the same, word for word: a file made, its size
  and time, folders made in folders and removed, a folder that isn't empty
  refused, a file copied, moved and removed, a variable set, read and
  removed, the current folder changed and back, and the mistakes.

## 56. Games

- **Why.** A game is the program people most want to make first, and it needs
  what a window with buttons doesn't: drawing again many times a second, the
  keys being held, not just typed, where the mouse is, pictures and sounds.
- **[`tools/game.folio`](tools/game.folio)** is a window that is all one drawing,
  on ui.folio, so on Windows and Linux: `run_game(update, show)` calls
  `update(seconds)` and then `show(canvas)` about 60 times a second, by a 16 ms
  timer, with how long it's been since the frame before (a quarter of a second
  at most, so a program held up takes a step, not a leap). `the clock` times
  it. `key_down`, `mouse_x`, `mouse_y` and `mouse_down` say what's held and
  where; `on_key` and `on_click` are told as it happens.
- **In windows.folio and linux.folio.** A drawing keeps the keys held, by name,
  from WM_KEYDOWN and WM_KEYUP (and says it wants all of them, WM_GETDLGCODE,
  so `run`'s dialog manager leaves the arrows to it; and forgets them when it
  loses the keys), or from GTK's key-press-event and key-release-event on its
  window; and the mouse, from WM_MOUSEMOVE and the button's messages, or
  motion-notify-event. Its keys' names are the same on both: Left, Space, A,
  F1 and the rest, whatever case they're asked for in.
- **No flicker on Windows.** A drawing is drawn into a bitmap of the window's
  size, then onto the window in one BitBlt, and WM_ERASEBKGND does nothing:
  each frame a whole new picture, as GTK's double buffering gives already.
- **Pictures** are read as bytes, so one built into the program by
  `--include` works as one on the disk does: on Windows into an IStream
  (SHCreateMemStream) that GDI+ makes a bitmap of, drawn with
  GdipDrawImageRectI, nearest-pixel so it's sharp and quick; on Linux into a
  GdkPixbufLoader, drawn with cairo, scaled to the size asked for.
- **Sounds** are WAV files: on Windows PlaySoundW plays their bytes from
  memory, kept while they play; on Linux a copy in /tmp, played by `paplay`
  (PulseAudio's and PipeWire's) or `aplay` (ALSA's), started by fork and
  execvp and not waited for. A new one stops the one before on Windows.
- **Tested.** A game that plays itself, the same on both but for how a person
  is made: a picture's size read, a sound played, a key pressed (by its
  message on Windows; on Linux by GTK's own test call, which needs X11's core
  events), held for 17 frames and let go, moving what it held and then not,
  the mouse moved, pressed and let go, at least 30 frames a second, and a
  frame painted. And `tools/catch.folio`, a game of falling stars, played.

## 57. A value's own functions and fields

- **Why.** A record keeps a thing's values together, but the functions that
  work on it are written `bark(rex)` and `name of rex`, inside out from how
  it's said: rex's name, rex barks. Folio already had `'s`, for a file used `as`
  a name, and it reads the way people talk.
- **What it means.** Any `x's` that isn't a name the file used `as` is the
  value's own: `rex's bark()` is `bark(rex)`, the value given first and any
  other inputs after it, and `rex's name` is `name of rex`. They chain, `rex's
  owner's name`, and a bracketed value works too, `(item 2 of dogs)'s name`. On
  its own line a call needs no brackets, as any call: `rex's bark`, `rex's
  rename "Max"`. `set rex's age to 4` sets a field, and `set rex's bark() to 1`
  is a mistake that says so.
- **Only a way of writing.** The parser turns `'s` into the call or the field
  it stands for, so the VM, the JIT, WebAssembly and machine code have nothing
  new to do, and the function is found by its name as any other: two kinds of
  record can't each have their own `bark`, as in D's and Nim's uniform calls.
  No program that ran before changes: `'s` after any other name was a mistake.
  Only the mistake for `say x's y` with no `x` changes: x has no value yet.
- **A file's name wins.** Which `'s` it is is decided as the file is read:
  `use ... as` and `use the library ... as` note the name, and from then on
  `math's sqrt` is the file's, as before; compiler.folio keeps the same list.
- **Tested.** Two programs on the three engines and in machine code (calls
  with and without brackets, fields read, set and chained, a list's items, a
  number's own function); three mistakes; and compiler.folio held to folio.js,
  byte for byte, on every case.

## 58. Values in text

- **Why.** `say` joins its pieces, `say "Hi, " name "!"`, but text made to
  keep, a label or a line for a file, took `"Hi, " + name + "!"`, quotes
  opened and shut around every value.
- **What it means.** `"Hi, {name}!"` is `"Hi, " + name + "!"`: any value, as
  `say` would show it, since `+` with text on one side shows the other. The
  joining starts from text, so `"{a}{b}"` is text even when both are numbers.
  Inside the braces is any value: `{age + 1}`, `{rex's name}`, `{length of
  fruits}`.
- **What stays as it was.** Folio's own code is full of `{`: the JavaScript
  compiler.folio writes (`") {\n"`), patterns (`"\\d{3}"`), JSON (`"{\"a\":
  1}"`). So only a `{` right before a letter, `_` or a bracket starts a value,
  and it ends at its own `}`; any other `{` is itself, and so is `\{`, which
  already meant `{` (a `\` before any other character is that character). A
  value that starts with a number goes in brackets, `{(3 * n)}`, as `{3}` in a
  pattern is a count. Of every
  string in the repository's Folio, one changed: machine.folio's curl format,
  `%{http_code}`, now `%\{http_code}`.
- **In the tokenizer and the parser.** A text's token keeps its parts: text,
  and each value's own tokens, read from where they are in the line, so a
  mistake in one points at it, ending with a `}`. The parser reads each the way
  it reads a bracket and builds the `+`s, so the VM, the JIT, WebAssembly and
  machine code have nothing new to do. A mistake inside one says how to write
  a `{` itself. compiler.folio does the same, with each part a record of its
  text or its tokens, since Folio can't ask what kind a value is.
- **Text inside a value.** `"{join words with ", "}"`: a `"` inside a value
  starts text of its own, which can have values in it too, so where text ends
  is no longer the next quote. The tokenizer's pattern finds only an opening
  quote, and a scan finds the end: past a `\` and the character after it, and
  past each value, to its `}`, past any text inside it. Tidying, in folio.js and
  in folio.folio, and the playground's colouring find the end the same way. If
  the line ends inside a value, even inside text in it, the mistake is the
  value's `{`, which nothing ends, not the quote of the text in it.
- **Tested.** A program of values in text, on the three engines and in machine
  code on Windows and Linux: numbers, a sum, a call, `'s` and `of`, a list,
  nothing and yes, text as an item's key, and every `{` that stays as it was;
  another of text inside values, inside text inside values, and values in
  brackets; nine mistakes; compiler.folio held to folio.js on all of them;
  folio.exe tidying text with text in it as format() does; and the playground
  colours a value in text as code, the text inside it as text.

## 59. A debugger for built programs

- **Why.** The playground can step a program both ways and show every variable,
  but a program built into machine code could only `say` what it was doing.
- **`folio debug file.folio`** builds the program as `folio run` would, with a
  debugger in it, and runs it. It stops before the first line, and before each
  line it's told to, says where it is, and takes commands from its input,
  typed or not: `step`, `next`, `out`, `go`, `break 12` or `break math.folio 12`,
  `clear`, `breaks`, `show x`, `vars`, `where`, `list`, `quit` and `help`.
- **The debugger is Folio.** [`folio-debugger.folio`](folio-debugger.folio) is used
  `as folio_debugger`, read before the program so its functions are numbered
  first, and its code goes before the program's. Before each line of the
  program, and of the files it uses, machine.folio asks `wants(line, file, depth,
  function)` whether to stop, and if so calls `here` with the variables too.
  Stepping, breakpoints, the calls in progress (`wants` sees how deep each line
  is, so one more than the line before means that line made a call), and
  reading commands with `ask`, are all ordinary Folio; only the hook is machine
  code. folio.exe carries the debugger as a file built into it, `--include
  folio-debugger.folio`, and builds it into the programs it debugs.
- **What the hook needs.** How deep in calls the line is, r15, as
  `debug_depth`; and for each variable the line can see, nearest first (its
  own, then each function out to the top, but not the functions the program
  makes once, nor a file's names), what it holds and whether it has a value
  yet, `debug_value` and `debug_set`, which read it where it lives and never
  fail on one with no value.
- **Nothing kept where the debugger can't see.** A debug build keeps no loop's
  variables in registers, as the loop analysis never saw the hooks' calls, and
  makes no guesses about calls (§48). Near the most calls there can be, the
  hook doesn't call the debugger, so a program that recurses too far stops at
  its own line, as it would built the usual way.
- **Tested.** Three sessions word for word, on Windows and Linux; every test
  program built to be debugged and told to `go`, against its usual build; and
  `folio debug` through folio.exe.

## 60. Packages

- **Why.** A Folio file someone else wrote was a file to copy by hand, and copy
  again when it changed, with nothing to say which version a program needs.
- **A package is a Git repository** of Folio files, its main file named after it.
  `folio add <repository> [name]` clones it into `packages/<name>`, from a site
  (`github.com/someone/thing` gets `https://` put before it) or a folder, and
  writes a line to `folio.packages`: its name, where it came from, and the
  commit it's at. `folio get` makes `packages/` match the list, cloning what's
  missing and checking each clone out at its commit, fetching first if it hasn't
  that commit; `folio update` checks out `origin/HEAD` after a fetch, and writes
  the new commit down; `folio remove` takes the folder away, with the system's
  own `rmdir /s /q` or `rm -rf`, as a clone's files can be read-only. A package
  with a `folio.packages` of its own brings those packages too, at their commits,
  into the same `packages/`, unless one of that name is there already.
- **Git, not a registry.** Every program that needs packages is a program
  people already keep in Git, and a commit names the exact code, so the list
  needs no versions or hashes of its own. folio runs `git`, as it runs any
  program (`run program ... keeping its output`), and says what git said when
  it fails. It passes `core.longpaths=true` on Windows, where a package's
  files can be deeper than 260 characters.
- **Finding a package's files.** A file used to be found from the program's
  folder, even when another file used it; now a file uses files from its own
  folder (from the parser's `folder`, as `within` is kept for names), so a
  package's `use "helpers.folio"` is its own. `use the package "json"` is
  `packages/json/json.folio`, from the program's folder wherever it's written,
  so a package that uses another finds it where `folio add` put it. Nothing in
  the repository used a file from a folder, so nothing that ran changes.
  Both parsers do this, and folio.folio's list of the files to read before a
  build (`cli_used_by`) finds them the same way. compiler.folio's `use_file`
  had kept the wrong list of files being read after a file used one, which
  only mattered now.
- **Tested.** Git repositories made by the tests: a package with a file of its
  own, added, run, updated, fetched again after `packages/` was deleted, and
  one that uses it brought along at its listed commit; every mistake; and
  `remove`, through folio.exe, on Windows and Linux. Files in folders and
  packages on the three engines, and compiler.folio held to folio.js.

## 61. VS Code

- **Why.** The playground colours code, finds problems as it's typed and tidies
  it, but most people write programs in an editor, and VS Code is the one most
  of them use.
- **[`editors/vscode`](editors/vscode).** The colours are a TextMate grammar:
  comments, text, numbers, `to name`, calls, `'s`, and the words the playground
  colours, the same list, which a test holds them to (`package` was added to
  both). Text's values are a begin/end rule inside text that includes the
  whole grammar again, so text inside a value inside text is coloured as the
  tokenizer reads it. The rest is `extension.js`: it runs `check()` from
  folio.js a quarter of a second after each change, the files a program uses
  read from beside it, or from the editor where one is open and not saved,
  and shows each problem on the word at its column, red for a mistake or a
  line sure to fail and yellow for the rest; a mistake in a used file goes on
  the line that uses it. `suggestedFix` is its Quick Fix, `format()` is
  Format Document, `to` lines are the outline (by their indents, so it works on
  code with a mistake in it) and where Go to Definition goes, and Run, Debug
  and Build start `folio` (or `folio.path`) on the file as a terminal's own
  process, so nothing is quoted for a shell.
- **The engine goes with it.** `make-vsix.mjs` packs the extension, with
  folio.js and the seven files it needs as `engine/`, beside a package.json that
  makes them modules, into a .vsix: a zip with a manifest and a list of
  content types, written by the script itself (deflated, every file dated
  1980, so the same files make the same bytes), so there's nothing to install
  to make it.
- **Tested.** The grammar through a TextMate tokenizer the tests have, enough
  of one for this grammar; the extension against a stand-in for VS Code's API;
  the .vsix unzipped and compared, file for file; `code --install-extension`
  with a profile of its own; and, with FOLIO_VSCODE=1, VS Code 1.142 itself,
  running the extension in its extension host: the problems, the Quick Fix,
  Format Document, the outline and the commands.

## 62. Tasks: threads of a program's own

- **Why.** §52's tasks are other programs: they share nothing, and what they
  find comes back as text. A program that wants a long sum done while its
  window still answers, or several files read at once, needed its own
  functions to run alongside it.
- **What a program writes.** `set job to start count(10)` starts the call on a
  thread of its own and gives back a task at once, `(record with task 1)`;
  `wait for job` waits for it to end and gives what it returned, as often as
  it's asked. `start count(10)` on a line of its own starts one and keeps
  nothing. A task shares the program's names: what it sets, the program sees.
  `start` alone, or before anything but a call, is still a name, so a program
  that called something `start` still runs, and `start 5` is a mistake that
  says how to start a task. A mistake in a task ends the program, as one in
  the program does, its trail ending at the line that started it.
- **On the JavaScript engines** a task runs to its end when it's started, so
  a program says the same each time it runs, and the playground's step and
  rewind work as they did. `wait for` gives what it gave back.
- **In machine code, one turn at a time.** The runtime has one heap and one
  collector, so its threads take turns: one holds the turn, as Python's
  threads hold its global lock. A thread lets the turn go every 200,000 loop
  rounds and calls (a count taken down at each loop's end and each function's
  start), and whenever it waits: for a time, a line typed, a program it runs,
  a site, a window's next message, or a library's function. So a task works
  while the program waits, and the program while a task does; and as a thread
  only lets the turn go at a loop's end, a call or a wait, `add 1 to total` in
  three threads at once loses nothing.
- **On Windows** the turn is a semaphore that's at most 1; a task is
  CreateThread, its stack 256 MB reserved, as the program's own is; a thread
  finds its slot through thread-local storage (TlsAlloc). `wait for` waits on
  an event of the task's slot.
- **On Linux** the turn is a ticket lock: a thread takes a number and sleeps on
  a futex until it's served, so turns go in order. A task is a `clone` with a
  stack from mmap, or, in a program that uses a library, `pthread_create`,
  found with dlsym, so the C library has the thread's own state; a thread
  finds its slot through gs (arch_prctl). `wait for` waits on a futex of the
  slot.
- **More tasks than threads.** What a task gave is kept by its number, in a
  list among the runtime's own, so `wait for` gives it however long after.
  There are 255 slots, and one is free for another task once its task has
  ended and nothing waits for it; on Linux, once its thread has left its
  stack too, which the system says by clearing the thread's id (clone's
  CHILD_CLEARTID), as the next task in the slot has the same stack. A task
  started while every slot is in use is made there and then, by the thread
  that starts it, as the JavaScript engines make every task, so tasks that
  start tasks never wait for a slot that can't come free.
- **What a thread keeps.** Its slot: where its stack starts (for the collector
  and for a mistake's trail), the innermost `try`, the text being built, and,
  while it hasn't the turn, its stack pointer. Taking the turn puts these where
  the runtime has them, and letting it go saves them back. A thread that lets
  the turn go keeps a copy of every register on its stack, or, in a library's
  function, in its slot, as C may need the stack where it is; the collector
  looks through each other thread's stack, from there to where it starts.
- **What changes in a program that starts a task.** machine.folio makes it
  twice: once to find that it starts one, then with threads. The second time it
  keeps no name of the program's in a register through a loop, and takes
  nothing as known about one from line to line (§48), as another thread can
  set it in between. A program that starts no task has none of this, imports
  nothing more, and is the same bytes as before.
- **One at a time.** Reading a line typed, running a program (and on Linux
  reading a site, through curl), and on Windows WinHTTP's requests are each
  claimed by a thread until it's done, so two threads asking at once are
  answered one after the other.
- **C calling back.** A function C calls back on a task's thread takes the
  turn for that thread first, and lets it go before going back to C. A thread
  the program didn't make has no slot, and ends the program, with 70.
- **Tested.** On Windows and Linux: what tasks say, fail with and give back,
  against the JavaScript engine, with names shared, a thousand tasks one after
  another, two thousand started before one is waited for, tasks starting tasks
  past the slots there are, five threads making far more than they keep, and
  files read and written by tasks at once; a task counting while the program
  waits for a line typed half a second late, a task running a program, one
  sleeping 300 ms in a library's function while the program counts to 3
  million, `qsort` calling a task back, and a window's timer ticking while a
  task sums to 50 million; and, by hand at the time, every example and table
  program that starts no task made to the same bytes as before. A thousand
  tasks start and end in about a tenth of a second.
- **Not yet.** Two threads running Folio at the same moment, which needs a
  collector that can stop them all. (A lock a program can take, and asking
  whether a task has ended without waiting for it, came in §94.)

## 63. Functions put in line, and inputs in registers

- **Why.** A loop that called a function kept nothing in registers (§32), as
  the function could use them, and every call cost about 25 instructions: a
  helper as small as `return x * x`, called in a loop, made it 2.5 times as
  slow as the sum written out.
- **What's put in line.** A function made once at the top of the program, and
  called by its name, whose code is one `return` of a small value (24 pieces
  at most) of its inputs: numbers, text, yes, no and nothing written out, `+`,
  `-`, `*` and `/`, comparisons, `and`, `or` and `not`, `-x`, `length of`, a
  field and an item; or a few `if ... return x ... end` before such a `return`,
  or with an `else` that returns. A name in it must be one of its inputs, so it
  means the same wherever it's put. Not in a program built to be debugged,
  where every line of the function is a line to stop at.
- **The call's checks stay.** That the function has been made by now, its
  inputs worked out in order and each kept in the caller's frame, checked if
  the function says what they must be, and that there's room for one more
  call (§48's 100,000): each as the call made it, at the call. Then the
  function's code, each input read from where it's kept. A mistake in there
  shows the trail it would have if the call had been made: the code that
  writes the mistake notes which function it's in and where it was called
  from (`err_fake_fn`, `err_fake_site`), and rt_e_end, before it goes
  through the frames, makes one for that call, going back to a call's number
  as a real call does. A mistake caught by a `try` leaves nothing noted.
- **Everywhere code is looked at before it's written.** What a loop does
  (`scan_expr`), what kind of value something gives (`expr_kind`), the guess
  at what each function is given (§48), and whether a loop can run as whole
  numbers (§32) all see such a call as its code, each input the expression
  given for it, and see no call. So a loop with one keeps its variables in
  registers, and in a loop of whole numbers `add square(i) to total` is
  `i * i` in whole numbers, the call's checks going the ordinary way if
  they'd fail.
- **Inputs in registers.** A function only ever called by its name (never
  used as a value, started as a task, or called back by C), with one to four
  inputs that don't say what they must be, and that makes no functions, gets
  its inputs in xmm0 to xmm3: the last isn't pushed at all, and the others are
  popped into their registers just before the call. It keeps them in its frame
  as its first variables. Whether a function is only called by its name is
  guessed with the rest of §48's guess, and checked the same way as its code
  is written, the program written again if it was wrong.
- **A value stored and read straight back** isn't read again: a load of what
  the instruction just before stored, from the same place, is no load at all
  (or a move between registers). A label marked in between, where code could
  jump in, forgets it.
- **What it gave.** A loop calling `square(i)` 20 million times went from 74
  ms to 30; one calling a function of three inputs from a function's loop,
  from 142 ms to 24; one calling a function with early returns and another,
  from 77 ms to 50; fib(32), from 27 ms to 24.5, against C's 19 (each a whole
  program, started up and all).
- **Tested.** Programs written to break it, said, failed and exited on as the
  JavaScript engine does them, trails and all, on Windows and Linux: sums
  past 2^53 in loops of whole numbers, mistakes in a function put in line
  with and without a `try`, one called before it's made and at the most calls
  there can be, inputs that say what they must be and ones with no value yet,
  fields, items, lengths, comparisons and text, early returns, an input that
  hides a name of the program's, a function also used as a value, and the
  wrong number of inputs; one to five inputs in registers, worked out by
  calls; and every other program the tests have.
- **Not yet.** A function that calls another put in line in it, and a
  function's variables kept in registers through its calls.

## 64. Lists, text and records, where the code is

- **Why.** `item i of xs`, `set item i of xs to v` and `add x to xs` went to
  the runtime each time, which works out what kind of value it was given;
  joining two texts went through the builder, copying both twice and counting
  every character again; and `x of p` looked through the record's fields one
  by one, which for the compiler's records, of 30 fields and more, was much of
  its work.
- **Lists.** If it's a list and the number is a whole number from 1 to its
  length, the item is read or set right there; anything else goes to the
  runtime as before, which says what's wrong. `add x to xs` puts x at the
  list's end itself when there's room. `set item` finds the item again after
  the value is worked out, as working it out may have moved the list's items.
- **Text.** Two texts, or text and a whole number below 10^15, are joined
  without the builder: the second's bytes after the first's, in the first's
  block if it ends there and has room (§25), else in a new block with room to
  grow, and the characters, both counts added up. A number's digits come from
  multiplying by a tenth's reciprocal rather than dividing, `x as text` of a
  whole number writes its digits out the same way, and the builder copies
  short bytes eight at a time and counts characters eight bytes at a time (a
  byte that isn't a character's first is 10xxxxxx: its top bit and not the one
  below, added up across the eight by one multiplication). `join` puts each
  text in as it is, not as `say` would show it.
- **Records.** Each place the program reads or sets a field has 8 bytes of its
  own saying where among the record's fields it found it last time. If the
  record has a field there, and it's that one, it's read or set there and
  then; else the runtime looks for it, and notes where.
- **What it gave.** Adding 3 million items and reading them back, 61 ms to
  about 45; setting 5 million, 82 ms to 34; joining a text to a text a million
  times, 87 ms to about 60; adding to one 2 million times, 122 ms to 60; text
  joined to a number a million times, 113 ms to 63; `as text`, 95 ms to 60
  (each a whole program, started up and all). And folio.exe builds itself in
  9.2 seconds, from 10.9, as the compiler reads fields all the time. With
  §63, it's 4.6% bigger: 19,020,288 bytes.
- **Tested.** Items read, set and added, with every number that isn't one of
  a list's (0, a fraction, one past the end, text, nothing) and a value worked
  out that grows the list being set; text joined to text, to digits (0, -0,
  the most digits, past them, fractions) and to anything else, in place and
  not, with characters past one byte; joins of every kind of value; records of
  other shapes at the same place, fields added later, and every mistake; on
  Windows and Linux, against the JavaScript engine.

## 65. The Folio shell

- **Why.** Python's first lesson is typing `2 + 3` and seeing 5. folio.exe
  could only build files; the shell Folio had, on the Node.js command line, went
  with it in 1.5.
- **What it does.** `folio`, or `folio shell` with `--allow` flags for what its
  entries may do, reads Folio an entry at a time: a line, or a block once its
  `end` is typed (the compiler says when what's typed ended too soon: its
  mistake is at the end of the code), with `....>` while it waits for more,
  and two empty lines dropping what isn't finished. An entry that's a value
  (`x + 1`, `xs`, `p's name`) is said; a call to one of the functions made
  (`square(4)`) shows what it gives, unless that's nothing. `quit`, `exit` or
  the end of the input ends it.
- **Each entry is a program.** folio.exe has no interpreter in it, only the
  compiler, so each entry is built into a program, run and removed, as `folio
  run` does, in about 35 ms. The program is what the entries before it left,
  then the entry: each entry before is a file of its own, `[1]`, `[2]`..., which
  the program uses in order, holding that entry's `to` blocks and `use` lines
  as typed, and in place of each other statement, a line giving each name it
  first gave a value to the value it had after the last entry, then blank
  lines. So line numbers are the ones typed, a mistake in a function made
  earlier says which entry it's in (`[3]:2:14`, `called from [4], line 1`), and
  a function changes the names it would have if the entries were one program
  (a name it sets that wasn't made before it is its own, §27).
- **Values in between.** After the entry, the program saves every name's value
  to `.folio-shell-state` with `save`, which the next program loads, so the
  program may read and write that one file whatever the flags say. A value
  `save` can't keep (a function, bytes, a list that holds itself) is said to
  be lost, and is nothing in the next entry. An entry that ends with a mistake,
  or stops the program with a number other than 0, keeps nothing it set, nor
  the functions it made; one that stops it with 0 keeps its functions only.
- **Not as one program.** Two names holding the same list hold copies of it
  after the entry, as each value is saved by itself; a task started doesn't
  outlive its entry; a file used runs its own lines again in every entry; and
  Ctrl+C ends the shell with the program, as no Folio program can catch it.
- **Tested.** A session through folio.exe, on Windows and Linux, typed into its
  input: values shown, functions made and called, a function's own name kept
  apart from the program's, lists added to, a loop's names, a file used, a
  mistake in a function made earlier, with its trail, a function that can't be
  kept, text past one byte, a block dropped, `quit`, and no file left behind.

## 66. Inputs left out, functions with no name, lists built from lists

- **Why.** Next to Python, Folio had no default inputs, no lambdas, no list
  comprehensions, no slices and no `**`: each a line of Python that took a
  loop or a helper function in Folio.
- **Only the parsers.** Each is written in terms of what Folio already had, so
  the VM, the JIT, WebAssembly and machine code needed nothing new: folio.js
  and compiler.folio make the same tree, and every back end compiles it as it
  compiles the rest.
- **Inputs left out.** `to greet with name, greeting or "Hello"`. Once the
  whole program is read (files it uses too), each call by the function's name
  that gives fewer inputs gets the rest written in, each a copy, so a list
  given this way is a new one each call. A name made more than once: its last
  `to`. A call through a variable (`set f to greet`) isn't seen by name, so it
  gives every input. After `or` only values written out, as anything else
  would be worked out where the call is, not where the function is.
- **Functions with no name.** `function with x gives x * 2` is a `to` block
  put before the statement it's in, named `function on line 3` (then `(2)`,
  and so on), a name no program can write, and the value is that name: so it
  remembers the variables around it, as any function does, and a mistake in
  it says where it is. One inside another's value goes inside that one, where
  its inputs are.
- **Lists built from lists.** `list of x * 2 for each x in xs where x is
  greater than 1` makes three such functions: one for an item's value, one
  for whether to keep it, each with x as its own input, so x is nobody else's,
  and one that goes through the list, adding each kept value, which the
  statement calls with `xs`. `for each` on the next line is a loop, as it was.
- **Items from one to another, and powers.** `items 2 to 4 of xs` (a list,
  text or bytes) and `x to the power of n` are builtins, as `in order` is:
  items 3 to 2 are none, and past the end is the mistake `item` makes. Powers
  are whole ones, worked out by squaring, so `2 to the power of 10` is exactly
  1024; math.folio's `power(x, y)` takes any, through `exp` and `ln`, which it
  has now, with `log10`, `log2`, `tangent`, `arctangent`, `arcsine`,
  `arccosine`, `angle_of`, `ceiling`, `round`, `absolute`, `radians` and
  `degrees`, tested in math.test.folio.
- **compiler.folio's numbers.** Functions are numbered in the order they're
  written, once the program is read, as scope.js counts them (§27), since
  the ones a statement's values make are read before the statement but go in
  front of it; and on from the last program's, so a build that reads two
  (the debugger's and the program) has no two functions of one number.
- **Tested.** Each, and each mistake (a power that isn't whole, of 0 below 0,
  items of a number or past the end, an `or` that isn't a value written out,
  an input after one with `or` without, a list built with a mistake in an
  item, and where it says it is), on the three engines and in compiler.folio,
  in machine code on Windows and Linux, and in the randomly broken programs.

## 67. Rounding, remainders, and whole numbers of any size

- **Why.** Folio had no `//`, `%`, `round` or `floor` of its own: math.folio
  found a number's whole part a power of two at a time, and nothing gave a
  remainder. Python's whole numbers have no size limit; Folio's are exact to
  2^53.
- **Rounding.** `x rounded down`, `x rounded up` and `x rounded` come after
  the sum they round, as `in miles` does, so `total / count rounded` rounds
  the quotient. They round x as Folio shows it, to 15 digits, so `(0.1 * 30)
  rounded down` is 3, like `item (0.1 * 30)`; a half rounds away from 0, as a
  spreadsheet's does, and none gives -0. `rounded` followed by a bracket is
  still a call, so math.folio's `rounded(x)` works as it did; a variable called
  `rounded` after a value in `say` now rounds it.
- **Remainders.** `remainder of a divided by b` has b's sign, as Python's `%`
  and a spreadsheet's MOD do. Of two whole numbers it is exact: a 64-bit
  `idiv` below 2^53 and the x87's `fprem` above, as `is divisible by` works it
  out; of anything else it is 0 whenever `is divisible by` says so, and else
  a - b times a / b to 15 digits, rounded down. `remainder of r` is still a
  field, as the phrase needs `divided by`.
- **Machine code.** `roundsd` rounds; each routine first takes the number to
  15 digits with the routine `say` uses (§25), keeping its sign.
- **big.folio.** Whole numbers of any size, as text, so `say`, `is`, `save` and
  JSON need nothing new. Inside, a sign and parts of 7 digits each, the lowest
  first, so two parts multiplied, with what's carried, stay below 2^53, and
  each carry is a remainder, so none is rounded. Division is a part at a time
  by a one-part divisor, else a digit at a time, each the most multiples of
  the divisor that fit; quotients round down and remainders take the
  divisor's sign, as Python's do.
- **Tested.** Rounding every kind of number (halves both ways, 15-digit
  neighbours, whole numbers past 2^53, fractions, infinities) and remainders
  of whole numbers below and above 2^53, fractions and mixed signs, with each
  mistake, on the three engines, in compiler.folio, and in machine code on
  Windows and Linux, 600 random ones too; big.folio's own tests, and 800
  random sums against BigInt, on each.

## 68. A record's own functions

- **Why.** Python's classes give each kind of object its own methods, and a
  subclass its own versions of some. Folio had records and `rex's bark()`,
  which is `bark(rex)`: one function for every record.
- **What it does.** `rex's speak()`, in a program that makes nothing called
  `speak` (no function, input or variable, in any file it uses), calls the
  function rex's `speak` field holds, with rex first, and the rest after it.
  A record's functions are any functions: made with `to`, or `function with
  self gives ...`. So two records, made by two functions, answer the same
  call two ways; one made by calling another maker can set its own `speak`,
  keeping the old one in a variable to call from the new; and a record can
  be given one later with `set speak of rex to ...`.
- **Where a name is made, the function wins.** If anything is called
  `speak`, `rex's speak()` is `speak(rex)` as it always was, so no program
  that ran before means anything new. A field that isn't a function says so
  (`'sound' is text, not a function`); a record without the field, or a value
  that isn't a record, fails as a call to a function nobody made did, with
  the same "Did you mean", from every name the program makes.
- **Only the parsers.** Once the whole program is read, each such call is
  given a function of its own at the program's top, `speak of the record on
  line 3`, which takes the field in a `try`, failing as above if it can't,
  and calls it; so every engine and machine code run it as any function, and
  a mistake in it shows that function in its trail.
- **Tested.** Two kinds of record answering one call, a function with inputs
  given later, one replaced that calls what it replaced, one said on its own
  line, two in a row on what the first gave, a function of that name winning,
  and each mistake, caught and not, on the three engines, in compiler.folio,
  and in machine code on Windows and Linux.

## 69. Lists as sets

- **Why.** Python has sets: each value once, `in` that's quick, and `&`, `|`
  and `-`. Folio had `is in` and dictionaries, whose keys are once each.
- **What's new.** `xs without repeats`, after the sum before it as `rounded`
  is, keeps each item where it first is, by `is`, so lists and records count
  as the same when they hold the same, and `0.1 * 30` is a repeat of 3. It
  is a function of the program's, made as list building's are (§66), so
  nothing else changed. What's in both, in one only, or in either is list
  building with `is in`, which the README shows.
- **Not added.** A set as a value of its own: the dictionaries Folio has are
  one already, for text and numbers, and finding a list in a list by `is`
  can't be quicker than looking at each.
- **Tested.** Repeats of numbers to 15 digits, of letters in text, of lists
  and records, none at all, and what isn't a list, on the three engines, in
  compiler.folio and in machine code on Windows and Linux.

## 70. XML

- **Why.** Python reads XML with `xml.etree`; feeds, office files, SVG and
  much of what older services send are XML.
- **What it is.** tools/xml.folio, in Folio alone, so it works on every engine.
  An element is a record with kind "element", its name, its attributes in a
  dictionary, in the order written, and its children, in order: elements, and
  text as records with kind "text", so a program tells them apart by `kind`.
  Text next to text (across a comment, or a CDATA section) is one piece.
  `text_of`, `first_named`, `all_named` and `attribute` find things;
  `element` and `text_node` make them, and `written` writes XML back, with
  `&`, `<`, `>` (and `"` in a value) as entities, so writing and reading
  again gives the same records.
- **As XML says.** Line ends are `\n` alone; in an attribute's value a tab or
  a line end is a space; the five named entities and `&#...;` and `&#x...;`
  are the letters they stand for, past one byte too; the `<?xml?>` line, a
  `<!DOCTYPE>` (with a `[...]` of its own), comments and `<?...?>` are passed
  over. A DOCTYPE's entities aren't used, and namespaces are just names with
  a `:`.
- **Mistakes** are a `fail with` saying the line: a closing tag that doesn't
  match, one missing, an attribute twice or without quotes, an entity Folio
  doesn't know, anything after the element.
- **Tested.** Its own tests, on the three engines and in machine code; and
  800 random documents (attributes in either quote, entities, CDATA,
  comments, text past one byte, nesting), read the same as Python's
  ElementTree reads them, and written and read back the same.

## 71. gzip and zip

- **Why.** Python has `gzip`, `zlib` and `zipfile`; downloads, logs and
  office files come squeezed.
- **What it is.** tools/zip.folio, in Folio alone, so it works on every engine:
  `deflate` and `inflate` (RFC 1951), `gzip` and `gunzip` (RFC 1952, every
  member of a file, its name, comment and extra field passed over, its check
  and size checked), `zipped` and `unzipped` for archives, and `crc32`.
  Each takes text or bytes and gives bytes.
- **Reading** is zlib's puff.c, a bit at a time: stored blocks, the fixed
  code, and codes a block brings, each code taken from its lengths in the
  canonical order. Data that can't be DEFLATE is a mistake that says why;
  DEFLATE has no check of its own, so damage it can still read is caught by
  gzip's and zip's CRC.
- **Writing** finds each place's longest match in the 32768 bytes before it,
  from the last 32 places with the same 3 bytes, and, as zlib does, writes a
  byte on its own when the next place has a longer match. Each 16384 matches
  are a block, written the shortest of three ways: with the fixed code, with
  Huffman codes made for it (from how often each symbol comes, none longer
  than 15 bits, or 7 for the lengths' own code, halving the counts until
  none is), or as it is. Its gzip came out 4% smaller than zlib's default
  level, in all, on the test's samples.
- **Archives** are version 2.0 with names in UTF-8, each file squeezed unless
  that makes it bigger, at 1980-01-01 0:00 so the same files make the same
  bytes. Reading takes the list at the end, so a file with a data
  descriptor, extra fields or a comment reads too; one locked with a
  password, ZIP64 or a method other than DEFLATE says so.
- **Tested.** Its own tests, on the three engines and in machine code: what
  zlib made at every level (so stored, fixed and own-code blocks), round
  trips of empty, short, repeating, random and every-byte data, archives
  with a folder, an empty file and a name past one byte, and each mistake.
  And 46 random samples of four shapes, up to 60 KB: zlib reads Folio's gzip
  and Folio reads zlib's, crc32 agrees, and the machine code on Windows and
  Linux writes the same bytes as the JIT; Windows' tar and Python's zipfile
  read Folio's archive, and Folio reads one with data descriptors and a
  comment. 400 gzip files damaged at random each stop with a mistake, or,
  where the damage is somewhere gzip doesn't look, read right: none gives
  wrong bytes.

## 72. Sockets

- **Why.** Python's `socket` is how a program talks to any other over a
  network: its own protocols, a database's, a game's. Folio had `read` and
  `send` for the web, and server.folio for answering it.
- **What it is.** tools/sockets.folio, on the system's own sockets through
  `use the library` (ws2_32 on Windows, the C library on Linux), so a
  program `folio build` makes, with `--allow-libraries`, can use it.
  Connections out (`connect`) and in (`listen`, `listen_everywhere`,
  `accept`), each a record with its handle and `peer`, the host and port at
  the other end; `send` sends all it's given; `receive` gives what has come,
  up to so many bytes, and no bytes once the other end has closed;
  `receive_line` a line, without its `\n` or `\r\n`; `receive_all` until the
  end; `finish_sending` (shutdown) ends the other end's `receive_all` while
  this end can still receive; `wait_at_most` makes a receive that waits
  longer fail. UDP: `open_messages`, `send_message`, `receive_message`.
- **Names** are looked up with getaddrinfo, IPv4 only, so the hosts file and
  DNS both work. What it gives is a list C made: its first entry is copied
  into the program's bytes with memcpy, and the address taken from where
  each system keeps it (Linux puts ai_addr before ai_canonname, Windows
  after), then the list is freed.
- **With tasks.** A library's function lets the turn go while it waits
  (§62), so a task can wait in `receive` while the program goes on, and a
  server can give each connection a task of its own.
- **Not added then.** TLS for sockets, IPv6, and `select`: §82 and §83.
- **Tested.** In machine code on Windows and Linux: a task of the program's
  own connecting to it by name, lines with `\r\n` and without an end, a reply
  after `finish_sending`, a message and where it came from, waiting too long
  for one, a port with nothing on it, a name no DNS has, a port past 65535,
  and 300 KB through `listen_everywhere`, read back the same.

## 73. HTTPS for server.folio

- **Why.** A server a browser reaches over the internet needs TLS; Python's
  `http.server` gets it from the `ssl` module, which is OpenSSL.
- **What it does.** `serve_secure(port, answer, certificate, key)` (and
  `serve_secure_everywhere`) answers as `serve` does, after a TLS handshake
  with each connection, through OpenSSL 3 by `use the library`: the
  certificate (and its chain) and key from PEM files, then `SSL_accept`,
  `SSL_read` and `SSL_write` where `recv` and `send` were. A connection that
  can't agree on TLS (one that doesn't trust the certificate) is said to the
  error output, and the server goes on. A certificate or key it can't use,
  or no OpenSSL at all, is a mistake that says which.
- **Where OpenSSL is.** Linux has libssl.so.3. Windows has none of its own:
  an MSVC build's libssl-3.dll and libcrypto-3.dll (Python's, in its DLLs
  folder) or libssl-3-x64.dll and libcrypto-3-x64.dll (the Win64 OpenSSL
  installer's) go beside the program, or Git for Windows' own, from its
  mingw64 folder: those, built with MinGW, once failed in a program of
  Folio's (no randomness to seed them, then a crash), until a library's own
  libraries were found in System32 too (below; §81).
- **A library beside the program** now finds what it needs from System32
  too: the second place a name is looked for was LoadLibraryExW with
  LOAD_LIBRARY_SEARCH_APPLICATION_DIR, which looks for the library's own
  libraries in the program's folder alone, so Python's libssl-3.dll couldn't
  find VCRUNTIME140.dll; it is LOAD_LIBRARY_SEARCH_DEFAULT_DIRS now.
- **Bodies in chunks.** HTTP/1.1 lets a body come as chunks, each its length
  in hex, then its bytes, until one of none, with trailers after it, and
  servers must read it: Node sends a body it's given in pieces that way.
  server.folio does now, over HTTP and HTTPS; chunks it can't read are 400.
- **Not added.** TLS for sockets.folio's own connections, and HTTP/2.
- **Tested.** In machine code on Windows and Linux, with a certificate the
  test makes: a page, a body in chunks and one with a length, a page that
  isn't there, a client that doesn't trust the certificate, and a
  certificate and a key it can't use.

## 74. The standard library, everywhere

- **Why.** Python's `import json` works in any folder. Folio's libraries were
  files in tools/, so a program used one only with a copy beside it.
- **What it does.** folio (the command, folio.folio) carries math.folio and the
  libraries in tools/ (not their tests or the example programs): when a file
  a program uses isn't beside the file that uses it, and has a standard
  library's name, folio uses its own copy, and so do the files that copy
  uses. A file beside the program comes first, as Python's own modules shadow
  its library's.
- **stdlib.folio** holds them, each file's text as a Folio text in a function
  that gives it by name, and folio.folio uses it as it uses machine.folio. It is
  made by make-stdlib.mjs, so folio still builds itself from its source
  alone, into the same bytes. Not `--include`: a file built into a program
  is found before the disk, so a program's own math.folio would lose to folio's,
  and a folder built in would take whatever else is in it.
- **Tested.** stdlib.folio is what make-stdlib.mjs makes of the files as they
  are, and holds each one exactly; and through folio.exe, in a folder with
  nothing else, a program that uses json.folio, math.folio and big.folio, and
  big.folio's own tests, and a math.folio beside the program used instead.

## 75. Every core at once

- **Why.** A task (§62) is a thread of the program's own, and the threads
  take turns, as Python's do under its lock, so a long sum is no quicker in
  four of them than in one. Python's answer is multiprocessing: copies of
  the program, each a process with a core to itself.
- **What it is.** tools/cores.folio, on tasks.folio's `start_self`, which
  starts the same program again with other arguments. `each_at_once(work,
  items)` shares the items out into as many parts as there are cores
  (GetActiveProcessorCount on Windows, sysconf on Linux), or
  `each_at_once_on(n, work, items)` into n; saves each part to a file;
  starts a copy for each, with the work's name, `<function work>`, and its
  files as arguments; waits for them all; and gives back what each gave, in
  the items' order. In a copy, `work_here(work)` finds its part, does it,
  saves what it gave, and stops the copy; a `work_here` for any other
  function does nothing, so a program can have several.
- **What it asks of a program.** Each copy runs the program from the top,
  so the `work_here` lines go after the functions they name and before
  anything that should run once, as Python wants `if __name__ ==
  "__main__"`; and what goes between them is what `save` keeps.
- **Mistakes.** A part that fails ends its copy; each_at_once waits for the
  rest, takes their files away, and fails with what the copy said, its line
  and trail. Where processes can't be started (the JavaScript engines), it
  does the items one after another, in the program, giving the same.
- **What it gave.** Counting the primes below 3 to 4.1 million, 12 items:
  24.8 s in one part, 5.1 s in a part a core, on a computer with 12.
- **Tested.** In machine code on Windows and Linux: one part and a part a
  core give the same, more parts than items, no items, and a part that fails
  in its copy; and nothing left behind.

## 76. A profiler

- **Why.** Python has cProfile: which functions a slow program's time goes
  to. Folio had the clock, and guessing.
- **What it does.** `folio profile file.folio args` runs the program as `folio
  run` does, then says on the error output how long it took and how many
  lines ran; each function's own time (its lines', not what it calls), as a
  share of the whole, and how often it was called; and the 15 lines that
  took longest, with how often each ran.
- **How.** It builds the program as `folio debug` does (§59), with
  folio-profiler.folio in the debugger's place: before each line, `wants`
  counts it and gives the time since the line before to that line and its
  function, and never stops; a line one call deeper than the one before
  starts a call. The debug build now calls the debugger's `finish` when the
  program ends or stops itself, which for the profiler says what it found
  (and for the debugger does nothing). The profiler is in the standard
  library (§74), so folio carries it and builds itself as it did.
- **Time** comes from `the clock`, which moves a millisecond at a time, each
  call about 40 ns: so each millisecond goes to the line that was running
  when it passed, which over a run worth profiling is where the time is, and
  counts are exact. A program profiled runs several times slower.
- **Not yet.** A program that ends with a mistake says nothing (the runtime
  has no Folio code to call there); nor does an app, whose handlers run after
  its last line.
- **Tested.** Through folio.exe: a program with a slow function and a quick
  one, its output and arguments as folio run gives them, every line's count,
  each function's calls, the slowest line first, a program that stops
  itself, and nothing left behind.

## 77. Notebooks

- **Why.** Jupyter is how much of Python is written: code in pieces, with
  words between them and what each piece said beneath it, kept in one file.
- **What it does.** `folio notebook notes.md` runs each ```folio block of a
  Markdown file in turn, as the shell runs entries (§65), so a block has what
  the blocks before it made, and writes what it said, its output and then
  its mistakes, beneath it in an ```output block, in place of the one there
  was; everything else in the file stays as it is. A block whose last line
  is a value shows it, as a cell's does. A mistake says the block and line
  (`block 3:1:7: can't divide by zero`), and, as in the shell, a block that
  fails keeps nothing it made. folio then says how many blocks ran and how
  many had a mistake, and ends with 1 if any did.
- **Plain Markdown.** The file stays one any editor, GitHub or a site shows
  as it is, its outputs as code blocks, and running it again gives the same
  file when the code does the same.
- **The shell, fixed.** A line whose value makes functions of its own (a
  list built from a list, a function with no name) gives them the line's
  number, and the shell kept every `to` block's lines for the entries after,
  so the whole line ran again in each. It keeps only the program's own.
- **Tested.** Through folio.exe: a notebook with a value, a function, a block
  that ends in a value, an old output to replace, a mistake, and a block
  after it, run twice to the same file, with nothing left behind; and the
  shell running a list built from a list once.

## 78. A package index

- **Why.** Python has PyPI: `pip install requests` finds a package by its
  name. Folio's packages (§60) are Git repositories, fetched by where they
  are.
- **What it is.** An index is a JSON file: each package's name, its
  repository as `folio add` takes it, and a line about it. `folio search
  [words]` lists its packages, or those with every word in their name or
  line, in no case; `folio add greeter` takes the index's greeter. A name
  alone (no folder, address or site, and no folder of that name here) is the
  index's; anything else is as it was. `--index` gives another, an address
  or a file.
- **Where it is.** By default
  raw.githubusercontent.com/samyyy2423/folio-packages/main/index.json, read
  with curl, which Windows 10 and later and Linux have, so folio needs no new
  permission: a package is added there by a pull request to that
  repository. Until it's made, the default address answers 404, which `folio
  search` says.
- **Tested.** Through folio.exe, with an index in a file: every package, words
  in any case, none, a package added by its name and used, a name the index
  hasn't, an index that isn't there, and one that isn't JSON.

## 79. Programs as web pages

- **Why.** A program anyone can run with nothing to install: a link, or a
  file sent. The playground runs Folio in a browser already; folio.exe made
  only programs for Windows and Linux.
- **What it does.** `folio build --web app.folio` writes app.html: the
  playground's page with Folio's engine in it, in app mode, holding the
  program and every file it uses (beside it, or from the standard library,
  §74), which runs it as soon as it opens and shows only what it says and
  draws, its buttons, text boxes and questions, taking keys and clicks as
  the playground does. It works from the file itself or from any site, with
  nothing else beside it. A program with a mistake in reading it says so,
  and makes no page.
- **One file.** Each of the engine's modules is in the page as text, and
  made a module from a blob: URL the first time it's imported, its own
  imports pointing at the others', so folio.js, vm.js and the rest, and the
  worker a run goes in, are as they are here; the page's own imports wait
  for them. The program goes in as JSON, with every `</` made `<\/`, so no
  text of its ends the page's script.
- **webpage.folio** holds the page, made by make-web.mjs from index.html and
  the modules, as stdlib.folio is made, so folio builds itself as it did; a
  test says when it's behind them. About 520 KB a page.
- **Tested.** The page's loader, run as a browser runs it, makes modules
  that find each other and run a program as folio.js does, with each
  module's text exactly its file's; through folio.exe, a page with a file of
  the standard library's in it, a `</script>` in the program, and a program
  with a mistake; and in a browser, a drawing, a question answered, and
  Snake, with its keys and timer.

## 80. A text a letter at a time

- **Why.** folio building itself went from 10 seconds to almost six minutes
  once it held webpage.folio, whose page is one line of half a million
  letters: folio.folio looks through each line with `item k of line`, and
  finding letter k of a text with letters past one byte meant counting from
  its start, so going through a line that way took its length squared.
  `folio tidy` did the same. Any program going through a long text by `item`
  did.
- **In machine code**, a text whose letters are a byte each goes straight to
  the letter, as it should have; and the routines that find a letter
  (`item`, and `items ... of`) remember the last one they found: where the
  text's bytes are, the letter's number and its byte. For the same bytes
  and that letter or one further, they count on from there. The collector
  makes them forget, since a text's bytes, once it's gone, can be another's;
  a view of fewer bytes than the remembered letter's counts from the start.
- **In JavaScript**, the engines turned the text into its letters for every
  `item`, `length of` and `items ... of`; they keep the last text's letters
  now.
- **What it gave.** folio builds itself in 10 seconds again, into the same
  bytes; `folio tidy --check` of the biggest files takes 3; 20,000 letters
  one at a time take 15 ms on the JIT.
- **Tested.** A text with letters of one to four bytes, every letter in
  turn, then out of order; views of its bytes; and 3,000 lookups at random
  across six texts and views, with the collector running between them, the
  same on the three engines and in machine code on Windows and Linux.


## 81. The profiler's last word, however a program ends

- **Why.** `folio profile` (§76) said nothing when a program ended with a
  mistake, and for an app it spoke too soon: its report was a call put after
  the program's last line, so a mistake never reached it, and an app, whose
  handlers run after its last line, had its report before any of them ran.
- **What it does now.** The runtime calls the debugger's `finish`, once,
  when the program ends however it does: after its last line and any window
  it left open, at `stop the program`, after a mistake's report, and when
  the pad it asked with is closed. It's called as a handler is, the first
  call in progress, so a mistake in it ends the program with no second last
  word. The debugger (folio debug, §59) has nothing to say then.
- **Waiting.** The runtime also calls the debugger's `waits` before an app's
  window loop and after each handler. The profiler gives the time from
  there to the next line to a row of its own, "(waiting for events)",
  instead of the line before, and the next line starts a call, so a
  handler run twice shows two calls.
- **Not yet.** Calls are counted by depth: when tasks (§62) take turns, a
  task's first line one call deep after another task's isn't counted as a
  call of its own.
- **Also.** server.folio's HTTPS test runs with Git's OpenSSL too, built
  with MinGW, when it's there. It was thought not to work in a Folio program
  ("entropy source strength too weak", then a crash), but built again with
  each commit's compiler, the same program fails only before §73's change
  to where a library's own libraries are looked for: a program built before
  it was what failed.
- **Tested.** Through folio.exe: a mistake, then the profile up to it; an
  app driven by two keys, with its handler's two calls and lines and the
  wait; on Windows and Linux.

## 82. Secure connections

- **Why.** Python's `ssl` wraps a socket in TLS: HTTPS by hand, mail
  (STARTTLS), databases, anything on the internet that isn't plain. Folio's
  sockets (§72) were plain, and only server.folio spoke TLS (§73).
- **What it does.** `connect_secure(host, port)` connects, then `secure`s
  the connection; `secure(connection, host)` makes one secure after it
  began, as STARTTLS does; `secure_as_server(connection, certificate, key)`
  is the other end, for a connection `accept` took. After that `send`,
  `receive` and the rest go through TLS, `finish_sending` sends TLS's last
  word, and `close` ends it. All through OpenSSL 3 by `use the library`,
  found where server.folio finds it.
- **What's checked.** The other end's certificate, against those the
  system trusts, and that it's for the host asked for, a name (also sent
  with SNI, for a server with many) or an address (SSL_set1_host takes
  either). Linux's are OpenSSL's default places; on Windows, OpenSSL has
  none of its own, so the certificates in Windows' ROOT store are read with
  crypt32 (each one's DER bytes, through d2i_X509) into OpenSSL's store.
  `trust(file)` adds a PEM file's, as for a certificate of one's own. A
  failure says why, as OpenSSL does: "self-signed certificate", "hostname
  mismatch".
- **The context** is made once, at the first secure connection (or
  `trust`), so the system's certificates are read once.
- **C's nothing.** A library function giving a pointer of 0 gives
  `nothing`, not 0: the loop through Windows' certificates waited for a 0
  that never came, and read from address 0.
- **Tested.** In machine code, with the HTTPS test's certificate and
  OpenSSL (on Windows, Python's and Git's): a task of the program's
  connecting to it, not trusting the certificate, then trusting it, by name
  and by address; a connection made secure after a line in the clear; one
  for the wrong name; and each mistake. By hand, example.com, on Windows
  and Linux.

## 83. IPv6, many at once, and addresses raced

- **Why.** Python's `socket` takes IPv6 addresses and names that have them,
  and `select` waits on many sockets at once, so one thread can serve many.
- **IPv6.** A name's addresses come from getaddrinfo for both families now,
  each as the sockaddr it gave (so an address's scope comes too), and an
  address written out, as "::1", is read by it with AI_NUMERICHOST.
  `listen_on(host, port)` listens on any address: "::1", or "::", which
  takes IPv4 too (IPV6_V6ONLY off, as Linux has it already and Windows
  doesn't). A peer's IPv6 address is written as RFC 5952 has it, with an
  IPv4 one mapped into it as `::ffff:127.0.0.1`. `open_messages_on` is UDP's.
- **Raced.** On Windows "localhost" is ::1, then 127.0.0.1, and a refused
  connection on ::1 takes two seconds, so connecting to a server listening
  on 127.0.0.1 alone took two seconds longer. A host with more than one
  address is tried as RFC 8305 has it now: each address a quarter of a
  second after the one before, without waiting for those to give up, the
  first connected kept and the rest closed. Each try is a socket that
  doesn't wait (FIONBIO), polled for being writable; it's connected if it
  has another end (getpeername), and waits again once it's kept.
- **ready(sockets, milliseconds)** gives those of a list of listeners,
  connections and sockets for messages that have something to take now, in
  the order given: through WSAPoll on Windows and poll on Linux, whose
  tables differ (an 8-byte SOCKET first on Windows). A secure connection
  whose bytes OpenSSL has read already is ready without asking.
- **Tested.** In machine code on Windows and Linux: a connection over ::1,
  one in IPv4 to "::", `ready` with nothing, with a connection waiting on
  the second of two listeners, bytes to receive, and an end; and
  "localhost" found within a second and a half.

## 84. Email

- **Why.** Python sends mail with `smtplib` and writes it with `email`: a
  report, an alert, a password reset. Folio had no way to.
- **What it is.** tools/email.folio, in Folio over sockets.folio (§82), in the
  standard library. `message(sender, recipients, subject, text)` is a
  record whose cc, bcc, reply_to, html, attachments and headers can be set;
  `attach(m, file)` and `attach_bytes(m, name, data, type)` add files;
  `server(host, port)` is a record of how to reach one, `log_in` adds a
  user and password, and `send(server, m)` sends it. `message_text(m)` is
  the message as it's sent.
- **The message.** Headers, then the body, in MIME: text alone; text and
  HTML as multipart/alternative; with files, multipart/mixed around them.
  Text in plain ASCII lines goes as it is; any other, as its UTF-8 in
  base64, so every byte arrives. Headers that aren't ASCII are RFC 2047's
  encoded words, of whole letters, a line each; a name with marks a header
  gives a meaning to goes in quotes; a file's name that isn't ASCII is RFC
  2231's `filename*`. Date is the time in UTC, from the C library's clock
  (`_time64` on Windows, `time` on Linux); Message-ID and each boundary are
  part of a SHA-256 (hash.folio) of the time, a count and a random number. A
  line end in an address, subject or header is a mistake, so none can add
  a header of its own (a Bcc, say). Bcc's addresses are sent to and never
  written.
- **SMTP.** The server's 220; EHLO, and what it offers; STARTTLS, then
  `secure` and EHLO again, for "starttls" (the default but on 465, which is
  "tls", secure from the start; "none" sends in the clear), and a mistake
  if it isn't offered; AUTH PLAIN, or LOGIN, if logged in; MAIL FROM, RCPT
  TO for each address, DATA, the message with a dot before each line that
  starts with one, and a dot alone; QUIT. An answer it doesn't want fails
  with what the server said, but not what was sent to log in.
- **base64** both ways: `base64_of` and `bytes_of_base64`.
- **Tested.** In machine code, against a mail server of the test's own in a
  task: after STARTTLS, logged in with PLAIN, to, cc and bcc, a subject over
  two encoded words, a name in quotes, a line that starts with a dot, HTML
  and three files; secure from the start, logged in with LOGIN; a password
  it won't take; a server with no STARTTLS; and messages it can't write.
  Python's email module reads the message back with no defects, each part
  and file as it was. On Windows (with Python's and Git's OpenSSL) and
  Linux.


## 85. A task's thread, gone back to its own start

- **What went wrong.** On Linux, a program that uses libraries starts each
  task's thread with pthread_create (so the C library has its own for that
  thread), and the thread goes back to where pthread began it when the
  task is done. Where that is was kept in the task's slot, and read after
  the task had said it was done and let go of the turn. By then the slot
  could be the next task's, and on one core it was: the thread went back on
  the next task's stack, and the program crashed, or the C library said
  "free(): invalid pointer". Secure connections' test (§82), which starts a
  task for each connection, did it on every run on one core.
- **Now** the thread takes where it goes back to onto its own stack before
  it says it's done. Windows' threads end with ExitThread, which needs
  nothing of the slot, and a thread made with clone waits for the last one
  to have gone, so neither did.
- **Tested.** The secure connections' test runs on one core too, with
  taskset, where Linux has it.

## 86. Hashes, base64 and secrets

- **Why.** Python's `hashlib`, `hmac`, `base64` and `secrets`: checking a
  download, signing a request to an API, a token in an address, a password
  kept safely. hash.folio had SHA-256 alone, base64 was inside email.folio, and
  `random number` is made to repeat when a program asks it to.
- **hash.folio** has SHA-224 (SHA-256 from other starting words), SHA-512 and
  SHA-384, SHA-1 and MD5, each by its own name or through `digest(name,
  data)`; `hmac(name, key, data)` (RFC 2104); `pbkdf2(name, password, salt,
  rounds, size)` (RFC 8018); and `hex_of` and `bytes_of_hex`. All in Folio, so
  on every engine. SHA-512's words are 64 bits, past what a number holds
  exactly, so each is two halves of 32 bits, every sum carried from the low
  half to the high; its constants were made from their definition (the cube
  and square roots of the first primes) and checked against FIPS 180-4's.
- **base64.folio** writes base64, its URL-safe kind, and base32 (RFC 4648),
  and reads them back passing over what isn't their alphabet, as Python
  does. email.folio uses it.
- **secrets.folio** asks the system: BCryptGenRandom on Windows, getrandom on
  Linux, through `use the library`. `random_bytes(n)`, `token_hex`,
  `token_url`, `below(n)` (each number as likely: bytes drawn again when
  they'd favour the smallest), `choice`, `shuffled` and `same_secret`, which
  compares two secrets taking as long however much of them is the same.
- **Tested.** Every hash, HMAC and PBKDF2 against Node's crypto, on texts and
  bytes of every length around a block's edges, on the three engines and in
  machine code on Windows and Linux; base64 and base32 against RFC 4648's
  and Node's; secrets on Windows and Linux.

## 87. Asking web servers: http.folio

- **Why.** `read` and `send` ask sites through the system (WinHTTP, curl),
  and only `read` and POST: no PUT, PATCH or DELETE, and a redirect isn't
  followed. Python's urllib.request does any method.
- **What it is.** tools/http.folio, in Folio over sockets.folio (§82), in the
  standard library. `request(method, url, body, headers)` and `head`, `get`,
  `post`, `put`, `patch`, `delete`; a body is text, bytes, or a record, list
  or dictionary sent as JSON; the answer is a record of status, reason,
  headers (each name in small letters), body, text and url. A 404 is an
  answer like any other: `check` makes one a mistake; `get_json` reads JSON.
- **What it does on the way.** Connection: close, so the answer ends when
  the connection does; Accept-Encoding: gzip, undone with zip.folio; a body in
  chunks put together; redirects followed up to 10, as browsers do: a 303,
  or a 301 or 302 to a POST, goes on as a GET with no body; a 307 or 308
  keeps both; Authorization isn't sent on to another host. A header with a
  line end in it is a mistake. `encoded`, `decoded` and `form_of` write and
  read what goes in an address or a form.
- **Where.** HTTPS uses OpenSSL as sockets.folio does, so on Windows its DLLs
  go beside the program; `read` and `send` need nothing there.
- **Tested.** In machine code on Windows and Linux, asking server.folio in a
  task of the program's: each method, a header of its own, JSON both ways,
  bytes, each redirect, one to another host, gzip, a 404, a loop of
  redirects, chunks, and each mistake. By hand, example.com over HTTP and
  HTTPS.

## 88. WebSockets

- **Why.** A page that's told things as they happen (a chat, a game, a
  dashboard) talks to its server over a WebSocket; Python has the websockets
  package. Folio's server.folio answers one request at a time and closes.
- **What it is.** tools/websocket.folio, over sockets.folio, both ends.
  `connect(url)` asks for one (ws:// or wss://) with a key of 16 random bytes
  (secrets.folio) and checks the server's answer: base64 of the SHA-1 of the
  key and RFC 6455's own text (hash.folio, base64.folio). `accept(listener)`
  answers such a request, and says 400 to any other. Each connection keeps
  the path and headers it was asked with.
- **Messages.** `send` sends text as text and bytes as bytes, a frame each,
  with a 7, 16 or 64-bit length; a client's are masked with 4 random bytes,
  as RFC 6455 says. `receive` gives the next message, putting pieces
  together, answering a ping with a pong, and passing over pongs; a close
  frame is answered and gives (record with kind "close", code, reason).
  `close` sends one and waits up to 2 seconds for the answer. A message is
  up to 16 MB.
- **Tested.** In machine code on Windows and Linux: an echo server in a task
  and the program connecting to it, with text, a ping, 70,000 bytes, 300
  letters, and a close; and Node's own WebSocket client, as a browser's,
  asking a server of Folio's.

## 89. Reading mail

- **Why.** Sending is half of Python's mail: `email` reads messages, and
  `poplib` and `imaplib` fetch them from a mailbox.
- **read_message(raw)** reads MIME, as text or bytes: headers (lines folded
  back into one, each name in small letters, RFC 2047's encoded words
  decoded, in B and Q, the space between two of them dropped), then the
  body. A multipart body is split at its boundary, part by part, inside each
  other; base64 and quoted-printable are undone; UTF-8 and Latin-1 (with
  ASCII and Windows-1252 taken as it) become text, with plain line ends. The
  first plain text and the first HTML that aren't files are the message's
  text and html; every other part is a file, its name from
  Content-Disposition (RFC 2231's `filename*` too) or Content-Type. Address
  headers are split at commas outside quotes and < >.
- **POP3.** `pop_open` (port 995 secure from the start, 110 after STLS),
  USER and PASS; `pop_count` (STAT), `pop_get` (RETR, its dots taken off),
  `pop_delete` (DELE), `pop_close` (QUIT).
- **IMAP.** `imap_open` (993, or 143 after STARTTLS), LOGIN in IMAP's
  quotes; `imap_folders` (LIST), `imap_select`, `imap_search` and `imap_get`
  by UID, the message fetched with BODY.PEEK[] so it isn't marked seen,
  `imap_mark` (STORE +FLAGS), `imap_close`. Each command has a tag of its own;
  an answer that carries bytes ({n}, then n bytes) is read exactly.
- **Tested.** In machine code on Windows and Linux: a message email.folio
  made, read back as it was; one another program wrote, in
  quoted-printable and Latin-1, with Q words and folded headers; and POP3
  and IMAP servers of the test's own, in tasks, with what each was told.

## 90. TOML, command lines and logging

- **Why.** Python reads settings with `tomllib`, its command line with
  `argparse`, and says what happened with `logging`; Folio had none of them.
- **toml.folio** reads TOML 1.0 into dictionaries and lists: bare, quoted and
  dotted keys; [tables] and [[arrays of tables]]; basic strings with every
  escape, literal strings, and both multiline kinds (a line end after the
  opening dropped, a \ at a line's end joining it to the next); whole
  numbers in hex, octal and binary, with _ between digits; decimals with
  exponents, read as their digits times a power of 10, so rounded once
  (`number of` doesn't take an exponent); true and false; arrays over many
  lines; inline tables. Dates and times stay text, as written. inf and nan
  are mistakes, as Folio's numbers have neither. `toml_of` writes a
  dictionary back: its plain values, its tables, then its arrays of
  tables. A mistake says which line.
- **options.folio** reads `arguments`: `option` (--name value, -n value,
  --name=value; a number if its default is), `flag`, `positional`, and
  `rest`; `--` ends the options; a negative number is a name, not an
  option. `--help` says the usage, the program's description and each
  name's and option's help, and stops the program; a mistake says the usage
  and why on the error output and stops it with 2, as argparse does.
  `parse_or_fail` fails instead, for a `try`.
- **log.folio** writes a line for each thing, with the date and time, its
  level (debug, info, warning, error, critical), a name if one is set, and
  the message, in a format of the program's own (%time%, %level%, %name%,
  %message%, as `{` starts a value in Folio's text), for those at the level
  set or above, to the error output or added to the end of a file.
- **system.folio's append_to_file** adds to the end of a file, making it if
  it isn't there: CreateFileW with FILE_APPEND_DATA on Windows, open with
  O_APPEND on Linux.
- **Tested.** TOML against Python's tomllib on a file with each of its
  kinds, and toml.test.folio and options.test.folio, on the three engines and
  in machine code; logging and adding to a file in machine code on Windows
  and Linux.

## 91. Collections, lists, statistics and time zones

- **Why.** Python's `collections`, `heapq`, `bisect`, `itertools`,
  `functools`, `statistics` and `zoneinfo`: each saves a program writing the
  same loops again, and the last one can't be written without the world's
  zone data.
- **collections.folio.** `counted` and `most_common` (most first, and those
  counted the same in the order they came: sorted by the count below 0,
  as Folio's sort keeps order); `grouped` by a function; a queue whose
  things are in a dictionary by place, from `first` to `last`, so both ends
  are quick, as Folio's lists can't be shortened at their end (`remove` takes
  a key from a dictionary); a heap in a list, with its own count, as a list
  only grows; and `where_sorted`, `where_sorted_first` and `insert_sorted`.
- **lists.folio.** chunks, windows, paired, numbered, flattened, product,
  permutations, combinations, running totals, total, folded, mapped,
  kept_by, dropped_by, split_by, taken_while, dropped_while, every_one,
  some_one, sorted_by (by a key, those the same kept in order),
  smallest_by, largest_by and repeated. A list given before another input
  goes in brackets, as `list of` takes what comes after it.
- **stats.folio.** mean (summed with Kahan's way), median and its low and
  high, mode and modes, variance and standard deviation of a sample and of
  a population, quantiles (Python's "exclusive" way), covariance,
  correlation, a straight line by least squares, and the geometric and
  harmonic means, with math.folio's square root, logs and powers.
- **zones.folio.** A moment is seconds since 1970 in UTC. On Windows, ICU's
  calendar in icu.dll (Windows 10 1903 and later): the zone's name checked,
  then its offset and summer time's at that moment. On Linux, the zone's
  zoneinfo file (TZif): its changes, the offset before the first, and the
  POSIX TZ rule after the last (EST5EDT,M3.2.0,M11.1.0), which says when
  summer time starts and ends in years past the file's, north or south of
  the equator. A negative 64-bit moment is read from its bytes flipped, so
  it's exact. `moment_of` a time in a zone tries the offsets on either side,
  as Python's zoneinfo does: of a time that's there twice, the first; of
  one that's skipped, as if the clocks hadn't changed yet. `local_zone` is
  ICU's default on Windows, and TZ or where /etc/localtime points on Linux.
- **Tested.** collections, lists and stats with their own tests on the three
  engines and in machine code; zones against Node's own (ICU's), in nine
  zones at nine moments, on Windows and Linux.

## 92. More of C: small whole numbers, structures by value, any thread

- **Why.** Python's ctypes has every C type, passes structures by value, and
  lets C call back on any thread; Folio's library blocks had whole numbers of
  32 and 64 bits, structures only by where they are, and callbacks only on
  the program's own threads.
- **Whole numbers.** `a byte`, `a signed byte`, `a short whole number`, `an
  unsigned short whole number`, `an unsigned whole number` and `an unsigned
  long whole number`, from one table (machine.folio's c_wholes): as inputs,
  checked from their least to their most; as what a function gives, made
  from their low bytes with or without their sign (an unsigned long from
  2^63 up as half of it, doubled); as fields, as many bytes as they have, on
  their own boundary, as C lays them out; and as a callback's inputs and
  what it gives. Both parsers know the same names.
- **By value.** `a point by value`, for an input or what a function gives.
  On Windows a structure of 1, 2, 4 or 8 bytes goes in its place's register
  (or stack slot), and any other as where a copy of it is; one given back of
  any other size comes through memory the program gives as a first input.
  On Linux each 8 bytes of one up to 16 is sorted as the System V convention
  says, into a whole number register if anything in it isn't a number or a
  float and an xmm register if it is, while there are enough of each; any
  other goes on the stack, 8 bytes a slot; one given back comes in rax and
  rdx, or xmm0 and xmm1, as it was sorted, and past 16 bytes through memory
  given first, in rdi. Each input's place says which 8 bytes of the
  structure's memory it takes, so one structure can be two registers or
  three stack slots. A structure by value can't be nothing.
- **Any thread.** A program whose library block has callbacks takes turns as
  one with tasks does (§62), so a thread C made has a turn to take. On
  entry, a thread with none of the program's slots takes one of the last 16,
  with lock cmpxchg so two can't both have it (waiting, with pause, while all
  are in use; tasks keep to the slots before them); its thread's own storage
  (TlsSetValue, or on Linux its GS base) is set to it; a count in it goes up
  for a callback inside a callback. On Linux the GS base is asked for first
  (arch_prctl), as gs:0 with none is address 0. Going back out of its first
  callback, the turn is let go, its storage cleared, and the slot free.
- **Tested.** In machine code on Windows and Linux: each new whole number in
  and out of C, and through a structure laid out as C does; C's div giving a
  structure by value, and on Linux, with gcc, a library of the test's own
  with every shape the conventions sort; and three of C's threads calling a
  callback at once (and 24, and on one core, by hand).

## 93. Tools: stopping at a mistake, coverage, and versions of packages

- **Why.** Python's pdb stops where an exception happened (`pdb.pm()`), coverage.py
  says which lines ran, and pip and uv take a package at a version.
- **At a mistake.** In a program built to be debugged, each mistake's stub
  (stub_start and fail_stub, which every mistake goes through) first tells
  the debugger where it is and every variable the line can see, as the hook
  before a line does (`failing`), with debugging off while that call is
  written, so a mistake of its own isn't told too, and what the code around
  it knows of its variables kept as it was; the debugger keeps the last.
  After the mistake's report the runtime calls `failed` (rt_dbg_failed),
  once, before the last word: the debugger says where it stopped and takes
  `show`, `vars`, `where` and `list` until another command ends it. With no
  more commands (the input over), it ends at once.
- **folio coverage.** As `folio profile`, with folio-coverage.folio in the
  debugger's place, from the standard library: `start` is told now every
  line a statement is on, in the blocks inside others too (with_debugger
  walks the program for them), and `wants` notes each line that runs; at
  the end, however the program ends, it says how many of each file's ran,
  the program's own first, and those that didn't, as runs (5-7).
- **Versions.** `folio add thing@v1.2`: what's after an @ in a source's last
  part is a tag, branch or commit, checked out after the clone, and kept in
  folio.packages with the source, so `folio get` fetches the same commit as
  before and `folio update` moves a branch's to its newest and leaves a tag's
  or a commit's where it is.
- **Tested.** Through folio.exe: coverage of a program and a file it uses; a
  package at a tag, which update leaves, on a branch, which it follows, and
  at a version that isn't there; and a program built to be debugged
  stopping at its mistake, with its variables, its calls and its lines.

## 94. Concurrency: asking whether a task has ended, locks and queues

- **Why.** Python has `future.done()`, `threading.Lock`, `Semaphore` and
  `Event`, `queue.Queue`, and `concurrent.futures`' `map`; Folio could start a
  task and wait for it, and nothing else (§62's "not yet").
- **`job has ended`.** A test, as `is` is: after a value, `has ended` on the
  same line, parsed by folio.js and compiler.folio alike into the builtin `has
  ended`, last in vm.js's BUILTINS. `has` alone is still a name. In machine
  code it finds the task's number as `wait for` does and looks through the
  slots (rt_task_ended): a slot running that task means no, and a number no
  task has had is the same mistake as `wait for`'s. On the JavaScript engines
  a task has always ended, as it ran to its end when it was started.
- **sync.folio, in Folio alone.** One thread runs Folio at a time and only lets
  the turn go at a loop's end, a call or a wait (§62), so between those
  nothing else runs: `take` sees the lock is free and marks it held with no
  call in between, and `receive` sees a value is there and takes it off the
  same way, which is why neither calls a function of its own to do it. They
  wait by `wait 1 millisecond` and looking again, which lets the turn go. A
  lock is a semaphore for one: a record with how many places are free and how
  many there are, so letting go of one that's free is a mistake. `holding`
  calls a function with the lock held and lets it go even if the function
  fails. The queue is collections.folio's, a dictionary from `first` to
  `last`, with `queue_holding(n)` making `send` wait while n are waiting.
  `take_within`, `wait_for_flag_within` and `receive_within` give up after so
  many milliseconds of `the clock`, which on the JavaScript engines moves on
  with each `wait`, so they give up there too. `run_each` starts a task for
  each thing and waits for them in order; `run_each_at_most(f, things, n)`
  waits for the oldest before starting more than n.
- **Tested.** sync.folio's own tests on every engine and in machine code;
  through tasks that really wait, on Windows and Linux: `has ended` before and
  after a task ends, three tasks adding to one total through a lock (which,
  without it, ends at 20 of 60), fifty values through a queue that holds 3, a
  task waiting on a flag, a wait for any, and a queue that gives up.

## 95. finally, inputs by name, unpacking, match and steps

- **Why.** Next to Python, Folio had no `finally`, no keyword arguments, no
  `a, b = b, a`, no `match`, and no `range` with a step: each a few lines of
  Python that took a helper variable or a loop by hand in Folio.
- **Only the parsers, again.** As in §66, each is written in terms of what
  Folio already had, so the VM, the JIT, WebAssembly, machine code, the
  checker and the shell needed nothing new; folio.js and compiler.folio make
  the same tree, and compiler.folio still writes the JIT's JavaScript byte for
  byte. A statement that becomes several (`several`) is put in its place in
  the block, as a used file's code is. The variables they need have names no
  program can write: `the step on line 3`, with `of shapes.folio` in a file the
  program uses, and `(2)` for a second on one line; the debuggers leave a name
  with "on line" in it out of what they show. A number they write in has a
  token of its own, with the number as its text, as the JIT writes numbers as
  they were written.
- **Steps.** `for each k from 10 to 1 by -2` keeps where it starts and the
  step, fails if the step is 0, and counts from 0 to `(10 - start) / step
  rounded down`, setting k to `start + count * step` each time round: so it
  ends before an end it doesn't land on, a step the wrong way runs no times,
  `stop` works as in any loop, and `by 0.25` lands on 1 exactly, as the
  division is rounded as it's shown.
- **Unpacking.** `set a, b to x` keeps x, fails if its length isn't 2 (`can't
  set 2 names from a list of 3`), and sets each name its item; with values
  after `to` (`set a, b to b, a`) they make a list first, so a swap works, and
  as there are as many as names there's no length to check. `for each name,
  age in people` is a loop over a variable of its own, unpacked first, before
  any `where`. `set a, b` used to be a mistake, so no program changed.
- **match.** `match x`, then `when` lines, is the statement only when the
  next line starts with `when`; `match` alone is still a name, and `match x`
  without it still calls `match`. Each clause is an `if` of x, kept in a
  variable of its own, the next in its `else`: `when 1, 2` (or `1 or 2`) is
  `is` to each, deep equality as `is` always is; `when is greater than 5`
  and the rest are what `is` takes after it, with x before it, so comparing
  text to a number is the mistake it always is; `else` is the rest. A `when`
  in a clause starts the next clause, so an app's handler can't be inside one.
- **Inputs by name.** `greet("Sam", mark "?")`: a name followed by a value,
  in a call, was always a mistake, so it can mean this. The parser keeps them
  among the call's inputs, and once the whole program is read, before the
  inputs left out get their `or` (§66), each goes in its place, by the
  function's last `to`; one left out before them gets its `or`, or the call
  is the mistake that it needs it. A call through a variable, or by a name no
  `to` made, can't give one, as there's nothing to say where it goes; nor can
  one come before an input given in order, or be given twice.
- **finally: `either way`.** After a try's statements, or its `if it fails`,
  `either way` alone on a line starts what runs however the try ends. The try
  goes inside another, whose `if it fails` keeps the mistake and notes that
  there was one; then what's after `either way` runs, then the mistake is
  passed on with `fail with`, so a `try` around it sees the same value, a
  record as a record. A `return` in the try, or a `stop` of a loop around it,
  would skip all that, so each becomes: keep the value, note how it left, and
  `stop` a loop that runs once, put around the inner try for it (a loop
  inside, with a return in it, stops the loop it's in too, after it ends).
  After what runs either way, the noted return or stop is made. A `return` or
  a `stop` after `either way` itself is left as it is, so it ends what it
  ends, as Python's `return` in a `finally` does. The mistake passed on is
  reported at the `try`, with its message: what's lost is where it was, since
  Folio has no way to fail again with the same mistake.
- **Tested.** Each, on the three engines, in compiler.folio against the JIT,
  in machine code on Windows and Linux: the order inputs are given in, a swap,
  steps down, by fractions and the wrong way, every kind of clause, a try left
  by a return in a loop, by a stop, by a mistake caught and one passed on, a
  try with `either way` inside another, and each mistake they can make; and
  `folio format` lays out `match` and `either way` as it does `if` and `else`.

## 96. Kinds, give, and numbers of any size

- **Why.** Python has classes, generators, and whole numbers of any size (and
  `fractions`, and `math.gcd`, `isqrt`, `comb`, `pow(a, n, m)`). Folio had a
  record's own functions (§68), lists, and big.folio.
- **Kinds, only in the parsers.** `kind dog with name, sound or "woof"`, then
  `to` lines, then `end`, is the statement when a name follows `kind` and
  then `with` or `from`, or a `to` starts the next line; `kind` alone is
  still a name. Its functions are made as `dog's speak`, with dog used as a
  file is (`dog's speak(self)` calls it by that name), and then a function
  `dog` with the kind's inputs, made as a `to` is, so inputs left out and
  given by name work: it sets a variable of its own to `record with kind
  "dog"` (or, with `from pet(name)`, to what that gives, and then its kind),
  gives the record a field for each input and each function, and returns it.
  `rex's speak()` is then §68's call of the function rex's `speak` field
  holds. A kind holds only functions; an input called `kind`, or a function
  called as an input is, is a mistake.
- **give.** Once the whole program is read, if nothing in it is called
  `give`, each function with a `give x` statement in it (not in a function
  inside it) starts by setting a list of its own to empty; each `give x`
  adds x to it, and each `return` returns it, as the end does. So the values
  come all at once, when it returns. A `return` with a value in one is a
  mistake. A real generator's laziness would need a function to stop and go
  on again, which only tasks can do here, and the JavaScript engines run a
  task to its end when it's started.
- **Numbers of any size.** big.folio has `gcd` (Euclid's, with its own
  remainder), `lcm`, `square_root` (Newton's way, from 10 to the power of
  half the digits, rounded up, which is never below the root), `factorial`,
  `choices` (each step's product divided at once, as each is whole),
  `power_mod` (squaring, and the remainder after each multiplying, so the
  power can have hundreds of digits), `absolute`, `negated`, `in_base` and
  `from_base`. fractions.folio keeps a fraction as text in lowest terms, the
  sign on top, read from "3/4", a whole number, or a decimal as it's
  written (a number as it's shown, so 0.1 is 1/10, not the binary fraction
  Python's Fraction(0.1) is); each sum is big.folio's, then the gcd.
  `as_decimal` rounds a half away from 0, as Folio's `rounded` does.
- **Tested.** Kinds, one from another, a function of the kind it's from,
  inputs by name, a kind with no inputs and one with no functions, `give` in
  loops, after a return and in a try with `either way`, a program with its
  own `give`, and each mistake, on the three engines, in compiler.folio and in
  machine code; big.folio's new functions and fractions.folio against
  JavaScript's BigInt on 400 random numbers, and their own tests on every
  engine and in machine code.

## 97. The language's own functions: decimals, and how a kind is shown

- **Why.** Python writes a number to so many places with `f"{x:.2f}"`, and a
  class says how it's printed with `__str__`. Folio had text.folio's
  `number_text`, a call away, and showed a kind's record as a record.
- **Written in Folio.** Both need code that runs, not just a new shape of tree,
  and every engine and machine code run Folio. So folio.js has `LANGUAGE`, a
  short Folio file, and compiler.folio the same text (a test holds them to each
  other): once the whole program is read, if it needs any of it, the parser
  reads that text as a file used as "the language", its names `the language's
  with_decimals` and so on, which no program can write and no file's alias
  renames, and puts it at the program's top. machine.folio knows the text too,
  for a mistake's line, and the debugger and coverage leave its lines out.
- **`x with 2 decimals`.** After a sum, `with`, one number or name, then
  `decimals` (or `decimal`) on the same line: a call of `with_decimals`, which
  takes the number as it's shown, to 15 digits, moves its point for an
  exponent, rounds the next digit a half away from 0 and writes exactly so
  many, so 1.005 is 1.01 (Python's binary 1.005 gives 1.00). A name followed
  by a value was a mistake in that place before, as `with` after a sum was.
- **A kind's `shown`.** A kind with a function called `shown` makes the parser
  send each part of every `say`, and each value in text, through the
  language's `shown`: the value's `shown` field, if it has one and it's a
  function (a typed input checks that, inside a `try`), given the value, or
  else the value itself. A program with no such kind is as it was.
- **Tested.** Decimals of numbers small, huge, below 0, carried up a place and
  in text; a kind shown by `say`, in text and inside other text, a record
  with a `shown` that isn't a function, on the three engines, in compiler.folio
  and in machine code.

## 98. Sets, and the debugger's sums

- **sets.folio.** A set is a kind's record holding a dictionary of its things,
  each to yes, its `kind` "set" and a `shown` that writes `{1, 2, 3}`; `has`
  is a dictionary's own finding, so it's as quick with a million as with ten.
  Its things are a dictionary's keys: numbers and text.
- **`show x + 1`.** folio-debugger.folio reads what's after `show` as Folio reads
  a sum: numbers, text, the line's variables, `+ - * /`, brackets, `is` and
  its comparisons, `and`, `or`, `not`, `item ... of`, `length of`, `keys of`,
  a field (`age of sam`, `sam's age`) and a file's name (`math's pi`), each
  worked out in the debugger with Folio's own operators, so the answer is the
  program's. A field is found through JSON (`json from (x as json)`), as
  Folio has no field by a name held in a variable. A function can't be
  called, as the program isn't running; a mistake says what it was.
- **Tested.** A program built to be debugged, shown sums, items, fields of
  fields, comparisons, brackets, a minus, and three it can't work out.

## 99. Installers and signing

- **Why.** A program to give to people needed a setup that puts it in the
  menus and can take it away, as Inno Setup or an MSI does, and a way to sign
  it, so Windows can say who made it.
- **The installer is a Folio program.** tools/installer.folio, in the standard
  library: `folio build --installer` writes a two-line program that uses it,
  with the app's name, version and file, and builds that with the app built in
  (`--include` does the same), its icon, and `--allow-all`. Run, it asks with
  Windows' own message box (or a question on Linux), writes the program where
  a person's own programs go, and what takes it away beside it.
- **Windows' entries.** A Start menu shortcut is a COM object's file, and the
  installed apps' list is in the registry, so the installer writes a short
  PowerShell script beside the program and runs it (`-File`, so no quotes go
  through a command line), then removes it: WScript.Shell's shortcut, and
  HKCU's Uninstall key with the name, version, folder, icon, and
  `cmd /c "...\uninstall.cmd"`, which removes the key, the shortcut and the
  folder, the last with `(goto) 2>nul & rmdir`, so cmd has let go of the file
  first. Everything is the person's own (AppData, HKCU), so no administrator.
- **Linux's.** `~/.local/opt/<name>`, a `.desktop` file in
  `~/.local/share/applications`, the icon beside the program, and
  `uninstall.sh`.
- **--sign.** A command, split at spaces with quoted parts kept, run with each
  program's name after it, after the program is built and before the
  installer takes it in, then on the installer; one that fails, or can't be
  started, stops the build. folio knows nothing of certificates: signtool, or
  any tool, does the signing.
- **Tested.** Through folio.exe, on Windows and Linux: an installer made and
  signed (with `echo` for signtool), installed into a folder, the program run
  from there, taken away, a wrong option, and a signer that isn't there. By
  hand, on Windows: the Start menu shortcut's target, the Settings entry's
  values, and its uninstall string run as Settings runs it, leaving nothing;
  and on Linux, in WSL, the menu entry and uninstall.sh. A real certificate
  wasn't at hand, so signtool itself is untried on Folio's programs.

## 100. Pictures, encryption and charts

- **Why.** Python has Pillow for pictures, `cryptography` for encrypting, and
  matplotlib for charts saved to files; Folio had a picture drawn in a window,
  hashes, and a chart in the playground.
- **images.folio.** An image is a record with its width, height and pixels, 4
  bytes each. PNG is read chunk by chunk, its IDAT inflated by zip.folio, each
  row's filter undone (Paeth's too), at any depth from 1 to 16 bits, grey,
  colour, a palette with tRNS's opacity, and Adam7's seven passes; written as
  8-bit RGBA, each row filtered the way whose numbers come out smallest, as
  libpng picks. JPEG is read as baseline Huffman (SOF0 and SOF1): DQT, DHT,
  restart markers, any sampling, each block's numbers scaled back and turned
  into pixels by a separable inverse DCT from a table of cosines, each part
  enlarged to the image's size by its nearest sample; progressive, arithmetic
  and lossless JPEGs say they aren't read yet. It's written as baseline JPEG
  4:2:0, with the standard's tables scaled as libjpeg scales them.
- **Tested against Pillow.** PNGs of every kind, made by Pillow, the same
  pixel for pixel; an interlaced one made by hand, the same; JPEGs from Pillow
  at 4:2:0, 4:2:2 and 4:4:4, grey, and of a size that isn't 8's, within 4 of
  what Pillow reads in them (it enlarges colour smoothly, this nearest); a
  JPEG written here, read by Pillow, 45.7 dB from what it was; crops, flips
  and grey the same as Pillow's; and machine code the same bytes as the
  JavaScript engine for all of them.
- **crypto.folio.** AES from FIPS 197, bytes as lists of numbers, with its
  S-box and doubling table written out; GCM from SP 800-38D, its GHASH on
  four 32-bit numbers, and its counter mode from 2. `decrypt` checks the tag
  with secrets.folio's `same_secret`, so how long it takes says nothing.
  `encrypt` puts a fresh 12-byte nonce from the system before what it seals;
  new_key, new_salt and encrypt need a program folio build made, as the system's
  randomness is through C. Tested: 36 cases from Python's cryptography (all
  three key sizes, messages of 0 to 40 bytes, with and without extra bytes)
  on every engine and in machine code, GCM's own first two, a byte changed,
  the wrong key and the wrong extra found out.
- **charts.folio.** A chart is laid out once, as shapes and text, then written
  as SVG (each mark's value in a `<title>`, so it shows under the mouse) or
  drawn into an image: rectangles with their data end rounded and smoothed,
  2-pixel lines by their distance from each pixel, dots with a ring, and
  DejaVu Sans's letters at 13 and its bold at 16, 4 bits of ink a pixel,
  in glyph-tables.py's format. Its look follows a data-visualisation method:
  a categorical palette checked for colour-blind readers, used in a fixed
  order and never cycled (a ninth series is a mistake that says to make an
  Other); bars at most 24 wide, 2 pixels apart; 1-pixel gridlines; text in
  text colours, not series colours; a legend for two series or more, and a
  line's name at its end too for up to four; axis numbers in nice steps,
  with commas, or 10K and 2.5M once they reach 10,000; and, for one whole
  split in parts, a segmented bar, not a pie.
- **Tested.** Axis steps and their text, an SVG's marks, titles and escaped
  text, a PNG's background and bar colour where they should be, each
  mistake, on every engine and in machine code; and the PNGs looked at.

## 101. Faster on the web, and every core with less to write

- **Why.** The playground and the pages `folio build --web` makes ran on the
  JIT. WebAssembly was already quicker at sums and calls, but two to three
  times slower with lists of numbers and with text: each number in a list was
  a box of its own, which the GC kept and copied (73% of the time, adding
  3,000,000 numbers to a list), and each `+` on text went into JavaScript and
  back six times. Counting steps took a call each turn of a loop. And
  cores.folio (§75) asked for a `work_here` line before anything that should
  run once.
- **Small whole numbers, unboxed.** A whole number from -2^30 to 2^30 - 1 is
  an i31 value, as yes and no already were. No and yes keep 0 and 1, so the
  numbers 0 and 1 are boxes, each made once, and -0 is a box of its own.
  Whatever reads a number takes either: isNum is an i31 of at least 2 (as
  unsigned) or a box, numOf the i31's value or the box's; `box` makes one from
  an f64, and truthy gives exactly 0 or 1. An i31 that reaches JavaScript is a
  number there, 1 and 0 being yes and no.
- **Text in one call.** Text + text, text + a number and a number + text call
  JavaScript once, with the strings and the number; and a list that starts
  with text comes to JavaScript one call an item, not three.
- **remainder of, and rounded.** A builtin went to JavaScript with its inputs
  in a list. `remainder of` two whole numbers that fit in 32 bits is now
  i32.rem_s, given the divisor's sign as vm.js gives it. `rounded down`,
  `rounded up` and `rounded` give a whole number itself, and work out a
  fraction here when it's further from a whole number (and from a half) than
  rounding it to 15 digits can move it, which is at most half its size times
  10^-14: floor, ceil, or half away from 0, never -0. Anything else, and every
  mistake, goes to the builtin as before.
- **Steps counted down.** A global i32 holds the steps left, refilled from
  JavaScript at most 2^30 at a time; a loop counts down a local of its own,
  handed back to the global around a call, at a return and after the loop,
  and, by a catch_all that keeps the smaller, when a mistake leaves it. So a
  loop's turn makes no call, and a program still stops at the same step on
  every engine. A JIT call checks how many inputs it got, and counts its step,
  before calling anything, which it does only when one is wrong.
- **The page's engine.** The playground starts on WebAssembly where the
  browser validates a module with a GC struct and one with try and
  catch_all, and on the JIT where it doesn't; Engine still picks any of the
  three.
- **No box for a moment.** `add x to total`, with total a number, adds x
  straight to the f64 when x is a number, and `item i of xs` or `byte i of
  b` with i a number takes the place as an f64, so neither makes a box only
  to take it apart again.
- **What it gave.** WebAssembly, best of five in Node, before and after:
  adding 3,000,000 numbers to a list and summing them by item, 352 to 71 ms;
  `for each` over them, 277 to 68; 300,000 records in a list, 206 to 79;
  joining 200,000 pieces of text, 148 to 52; a million bytes filled and
  summed, 47 to 38; a million-round loop, 5.3 to 3.9. 300,000 records, each
  with a `remainder of`, run once as the playground runs a program: 227 to
  87 ms (the JIT: 76). Primes up to 5,000, which compares numbers from a
  list, went from 15 to 18 ms, as each number now says which kind it is.
- **cores.folio with no work_here.** Each each_at_once outside a part has a
  number, counted as the program runs. A copy is started with its call's
  number and runs the program to it: a call before its own gives what it gave
  the program, from a file each_at_once saves them to (with how many calls
  were made inside each, which the copy skips), and its own call does its
  part and stops the copy. In a part, each_at_once does its items there. A
  call that failed in the program isn't saved, so the copy does it, and fails
  and carries on as the program did. work_here still stops a copy at once,
  and nothing is saved for a call whose function had a work_here before the
  first each_at_once.
- **A part's mistakes.** At its own each_at_once, a copy may be inside the
  program's `try`, which mustn't catch the part's mistake: so the part
  catches it, and saves it, with which item it was on, where each_at_once
  looks for what the part gave; each_at_once fails with `part 1 of 2 failed:
  falls_over failed on item 3: can't divide by zero`. A copy that comes to
  another function's each_at_once says so. At work_here, as before, the
  copy's own mistake, with its line and trail.
- **Shared in turn.** With n copies, the 1st, n+1st, 2n+1st... items go to the
  first, the 2nd, n+2nd... to the second, so a list whose items take longer
  and longer is shared evenly: counting the primes below 60,000 to 1,920,000,
  32 items, on 6 copies, 5.0 s before and 3.4 s now (one copy: 12.0 s). On 12
  or more both take 2.7 s, which is what 6 cores with two threads each give.
- **Waiting.** tasks.folio's wait_for waits on the process (Windows) or its
  output (Linux) for up to 10 ms, so it wakes when the task ends, not at the
  next 10 ms. Starting and finishing 12 copies took 117 ms, now 100 ms on
  Windows (most of it CreateProcess, 6 ms each), and 8 ms on Linux.
- **Tested.** Numbers either side of every edge (0, 1, -1, 2, ±2^30, -0,
  fractions, bytes, as yes and no, through kinds, dictionaries and records),
  `remainder of` every sign with whole numbers, fractions, 2^31 and more, and
  `rounded` near whole numbers and halves, small and big: the VM, the JIT and
  WebAssembly say the same. cores.folio in machine code on Windows and Linux:
  two calls in a row, one in a loop, records, calls inside a part and inside
  one done here, a part's mistake inside the program's own try, a copy that
  came to another each_at_once, and no files left behind.

## 102. Learning it, and a web app made with it

- **Why.** The README shows all of Folio at once, which suits someone who
  already programs; someone new needs it a step at a time. And a language is
  believed when something real is made with it, start to finish.
- **learn.html.** Eleven lessons, from `say` to a word counter and the turtle,
  each with what it teaches, a program in a box to change, Run (or
  Ctrl+Enter), Reset, Open in the playground, and something to try. Each run
  is a worker.js of its own, as the playground's are, on WebAssembly where the
  browser has it and the JIT where it hasn't, stopped after 10 seconds. A
  question shows a box under the output; its answer runs the program again with
  the answers so far, as the playground does. The lesson that draws opens in the
  playground, which shows drawings. Lessons run are ticked, and kept in the
  browser's storage.
- **Lessons that can't go stale.** They're in learn-lessons.js, which the page
  imports and folio.test.js runs: every program on every engine, the same on all
  of them, with the answers the lesson types; the one that fails on purpose (an
  item that isn't there, to show a mistake's words) fails with that mistake.
- **apps/guestbook.** A page to sign and read, in SQLite, with the entries as
  JSON: guestbook.folio serves book.folio, which does the work with no network,
  so it's tested by calling answer_with with requests made by hand. Values go to
  SQLite as parameters, never in the SQL; everything shown is escaped; a sign is
  answered with 303 to the page, so Reload doesn't sign again; a refused one with
  400, the page, the problem and what was typed. docs/guestbook.md walks through
  it. 161 lines, built into a 1.3 MB program.
- **A bug it found.** In text.folio, `^\s+|\s+$` never matched its first part:
  text_either worked out where each part jumps to from the list of steps it had
  before the last part, and a repeat in the last part (`+`) makes a new list. It
  reads the list again before setting the jumps now.
- **Tested.** Every lesson, as above; text.folio's either-ors whose last part
  repeats, against Python's re; the guestbook's own tests in machine code, then
  the guestbook built by folio.exe, run, signed (a name of `<script>`, one of
  only spaces), read as a page and as JSON, a 404, and its database file, over
  HTTP.

## 103. Package sums: folio.sums

- **Why.** A commit in `folio.packages` names a package's code, but nothing
  checked that the files in `packages/` were still that code. A cached
  `packages/` in CI, or a file changed there by hand, ran as it was; and a
  commit is a SHA-1, which Git hardens but which is the weakest link a company
  would be asked about. npm's lockfile has an integrity hash, Go has go.sum,
  Cargo checks each crate's.
- **What.** `folio add` and `folio update` write the SHA-256 of each package's
  files, at its commit, to `folio.sums`, beside `folio.packages`: a line each,
  its name, the commit and `sha256:` with 64 hex digits. `folio get` works it out
  again and compares. One that was in `packages/` already and differs is named
  with the files git sees changed, added or taken away, and left as it is, for
  a person to look at; one just fetched that differs came from somewhere that
  isn't what it was, and is taken away, so nothing uses it. `folio update`
  checks a package first, so a change in `packages/` never becomes the next
  sum. A package's own `folio.sums` is checked for the packages it brings.
- **The sum.** For each file in the folder but Git's own (any `.git` folder or
  file), in the order of its path's bytes, with `/` between its parts: its
  SHA-256 in hex, two spaces, its path, a line end; then the SHA-256 of that.
  It's what `sha256sum` writes, so `find`, `sort` and `sha256sum` can check one
  without folio, and it's Go's dirhash with hex for base64. Every file counts,
  not only the ones git tracks: a file added to a package's folder is a change.
  It uses tools/hash.folio, which folio.folio now uses `as cli_hashing`, so
  bootstrap.mjs and the tests give folio that file too. A megabyte takes folio
  about half a second.
- **The same on every system.** Git for Windows checks text files out with
  `\r\n` (its installer sets `core.autocrlf`), so a package's files, and their
  sum, were different on Windows and Linux. folio now runs git with
  `core.autocrlf=false`, `core.eol=lf` and `core.symlinks=false`: files as they
  were committed, or as the repository's own `.gitattributes` says, which is
  the same everywhere, and a symbolic link as a small file holding where it
  points, as Windows has it anyway. So a link in a package can't lead `use`
  out of it either.
- **A file of its own.** The sums could have gone at the end of each
  `folio.packages` line, but folio 1.11 takes a line's last word as its commit,
  so it couldn't have read the file. `folio.sums` is a file 1.11 doesn't know,
  and ignores. A `folio.packages` with no sums, or one whose commit has none,
  gets them from the next `folio get`, which fetches the package again first,
  as a folio before this one may have checked it out with other line ends.
- **Tested.** Through folio.exe: the sum against one Node.js works out the same
  way; a package whose `.gitattributes` asks for the system's line ends
  checked out with `\n` on Windows too; a file changed and a file added in
  `packages/`, by get and by update; a fetch whose sum differs, not kept; a
  `folio.packages` with no sums, and one checked out with `\r\n`; update's new
  sum; a package's own `folio.sums`, which fits and which doesn't; remove.

## 104. Signed packages: --signed

- **Why.** A sum says the code is what was pinned, not who wrote it. A company
  that signs its commits, or takes a library only at its signed releases, wants
  folio to check.
- **What.** `folio add`, `get` and `update` take `--signed`. A package passes if
  it was asked for at a tag that's a signed tag (an object of its own, not a
  name for a commit) at the package's commit and `git verify-tag` accepts it, or
  else if `git verify-commit` accepts its commit. Which keys count is git's:
  the person's GPG keyring, or for SSH signatures the file
  `gpg.ssh.allowedSignersFile` names. folio says what git said when it doesn't
  pass. `add` takes away what it fetched; `update` goes back to the commit it
  was at, and says so; `get` ends with 1.
- **Asked for, not always.** Most packages aren't signed yet, so checking each
  time would stop everyone. A company puts `folio get --signed` in its CI.
- **Tested.** Through folio.exe, with SSH keys ssh-keygen makes and an allowed
  signers file given to git in `GIT_CONFIG_*`: a tag that's only a name on an
  unsigned commit, refused; a signed commit asked for by its hash, and a signed
  tag on an unsigned commit, taken by add and get; a commit signed by a key
  that isn't trusted, refused, then taken without `--signed` and refused by get;
  update on a branch, refusing an unsigned newest commit and taking a signed
  one; and `--signed` where it means nothing.

## 105. Advisories and folio audit

- **Why.** npm audit, pip-audit and cargo audit say when a program depends on a
  version with a known problem. Folio's packages are pinned by commit, so its
  advisories name commits.
- **The advisories** are a list in the package index's JSON, beside its
  packages, so one file, one address and one pull request hold both. Each names
  its package (by the index's name, or a `repository` of its own), and which
  commits it's about: `commits`, a list, each all of a commit or its first 7 or
  more digits; or `introduced` and `fixed`, the commits from the one it came in
  with (or `"0"`) that aren't from the one that fixed it on, as OSV's GIT ranges
  are; or neither, for every commit. `id`, `severity`, `about` and `link` are
  for people.
- **folio audit** reads folio.packages and the index (`--index` as for search),
  matches each package to the advisories by where it comes from, in lower case,
  with no `https://`, `ssh://`, `git@site:`, `.git` or `/` at its end, and asks
  the package's own clone, with `git merge-base --is-ancestor`, whether a commit
  is before another. A package not fetched can't be asked, and says so. It ends
  with 1 if an advisory is about a package's commit or one couldn't be checked,
  so CI stops; with 0, it says there are none.
- **The index.** samyyy2423/folio-packages needs `advisories` in index.json,
  and its check-index.mjs to allow and check it; the pull request that adds
  this describes the change.
- **Tested.** Through folio.exe, with an index in a file: an advisory by its
  commits, written in another case with `.git/` after it, and one by
  introduced and fixed, each at the commits it's about and not; a package from
  a site written another way than the index has it; a package not fetched; an
  index with no advisories; advisories that aren't; and no folio.packages.

## 106. A specification, a promise, a changelog and a security policy

- **Why.** A company that builds on a language asks what it means, what
  updates will change, what's changed, and where to send a security problem.
  Folio's answers were spread through the README, DESIGN.md and the release
  notes.
- **SPEC.md** is the language as it is, from folio.js's parser and vm.js's
  checks and messages: how a program is read, the grammar of every statement
  and expression, values and their kinds, numbers to 15 digits, each built-in
  operation, mistakes, files, packages and the flags. What's guaranteed is
  marked apart from what's only how it's done today (the engines, limits,
  speed, the words of a mistake).
- **VERSIONING.md** is semantic versioning, with one number for the language,
  the standard library and the `folio` command, which are released together.
  1.x keeps every program working; no word is ever reserved in 1.x, as each new
  phrase has started with a word that stays a name; something to remove is
  deprecated first and can go only in 2.0. The newest minor release gets every
  fix and the one before it security fixes for 90 days. Bugs and security holes
  are fixed even where a program depended on them, as 1.5.1's was.
- **CHANGELOG.md** is the GitHub releases, newest first, shorter, with a
  section for what's not released yet.
- **SECURITY.md** says how to report a problem privately (GitHub's private
  reporting), which versions get fixes, how to check a download, and what the
  `--allow` flags protect against and don't: a library or a program the
  program starts can do anything, a flag allows all of what it names, and
  there are no limits on memory or time.

## 107. Types you can add, checked before the program runs

- **Why.** A company's code is read by people who didn't write it, and its
  mistakes are cheapest before it runs. TypeScript and Python's type hints say
  what a value is where it matters and nowhere else; Folio's inputs could say
  only one of eight kinds, and the checker could only speak where values were
  written out.
- **What the code can say.** An input can be `a dog` (or `an owl`): a record a
  kind makes. It can be `a list of numbers`, or of `text`, `yes or no`,
  `lists of numbers`, `records`, `dictionaries`, `bytes`, `functions`, or what
  a kind makes, `dogs` (`boxes`, `puppies`). After its inputs, a function can
  say `gives a number`, `gives a dog`, `gives nothing`, or `gives a dog or
  nothing`. A kind's inputs say so too: `kind point with x as a number`.
- **Gradual, so nothing old changes.** A run checks only what it always
  could, cheaply, at each call: `a dog` is checked as a record, `a list of
  numbers` as a list, and `gives` not at all. What's beyond that is for the
  checker. Code that says nothing is checked exactly as it was. `gives` is a
  word only after a function's inputs, so it stays a name (VERSIONING.md's
  promise), and `as` already was a word.
- **Two passes.** checker.js works out every variable's type twice: from
  what's sure (values written out, what each operation and builtin gives, an
  input whose `as` each call checks, what a kind makes, and now what a function
  returns, from its `return`s, again until nothing changes), and then with
  what the code says of itself too. A check that fails on the first is
  "will fail": that line stops the program whenever it runs. One that fails
  only on the second is "doesn't fit": the code goes against what it says,
  which no run would catch (`greet(cat("Tom"))` when greet takes `a dog`, or a
  `return 5` in a function that `gives nothing`, or one that `gives a number`
  and can reach its end). A type is a string ("record:dog", "list:number"), so
  joining two of them is cheap: a list of numbers and a list of text are a
  list. A field of a record a kind makes has the type its input says, unless
  the program sets a field of that name anywhere, when any record may have it.
  A kind named that the program doesn't make is said once, with the nearest
  name (`there is no kind called 'dgo'`).
- **folio check does the same in Folio.** It can't run vm.js's checks, so
  make-checker-rules.mjs runs each of checker.js's rules on a sample of every
  type, and of every unit and turtle action, and writes what each does into
  checker-rules.folio: a line per rule and types, saying which operands' values
  (not just types) can change the outcome, and which message it stops with.
  folio.folio works the types out as checker.js does and looks each check up
  there. So folio check says what the checker says, word for word, but leaves
  out what rests on a value written out (`1 / 0`, `item 0 of x`, `repeat "x"
  times`), which needs the value, not its type; the playground finds those
  too. folio.test.js says when checker-rules.folio is behind.
- **Everywhere alike.** folio check ends with 1 for "will fail" and "doesn't
  fit"; the editors and the playground show both in red, "doesn't fit"
  named as such (the playground showed it in yellow before).
- **Tested.** Each kind of input type, `gives`, kinds made from kinds, and
  every message, in folio.test.js, word for word; folio check against the
  checker on every example, working program, typed program and 120 broken
  ones, through folio.exe. And that unannotated code gets no false alarm: the
  checker's claims held against runs of the examples, the table programs, the
  lessons, the programs machine.test.js makes machine code of, and every file
  of the standard library (no "doesn't fit", and each "will fail" where the run
  stops, in its words, or on a line that never runs). Done once by hand,
  further: main's checker and this one on 2,970 unannotated programs differ
  only in a mistake's wording (`expected what kind of value it is ... or a
  kind's name`) and in true "will fail"s from what a function returns
  (`f() + 1` where f gives nothing); and folio check and the checker agree word
  for word on 2,360 programs, and the playground's Problems pane with folio check
  on every typed program, in Chromium.

## 108. The language server, and every major editor

- **Why.** People write code in their own editor. One language server gives
  them all what the VS Code extension had, and more.
- **folio lsp** speaks the Language Server Protocol on its input and output, in
  Folio (folio.folio), from what folio check and folio tidy already know: the
  problems as you type (folio check's, types and all), formatting (folio tidy's),
  the outline (each function, kind with its own functions in it, and variable,
  each to its `end`), go to definition (in the file, in a file it `use`s, and
  on a `use` line, the file itself), hover (what a name is, what a variable or
  input holds, what a function takes and gives, with the comment above it),
  and completion (the names the position can see, Folio's words, and after
  `rex's`, what rex's kind has). Hovers and `rex's` use the checker's types:
  it notes where each variable, input and function's returns are made, and
  hovers look them up.
- **Reading what an editor sends.** A message is a header, an empty line, and
  as many bytes of JSON as the header says, with no new line after. `ask for 64
  bytes` gives the next 64 bytes of the input, waited for but not to a line's
  end, or as many as come before it ends (machine code only; the playground's
  engines say so). The answers are said with `say`, whose new line the
  Content-Length counts.
- **Code being typed.** Most keystrokes leave code that can't be read. The
  problems then are its first mistake, as folio check says it; for everything
  else the server leaves out the line with the mistake (made empty, so the
  lines after keep their numbers), or the line before when the mistake is at
  a line's start (`set x to`, then the next line), or ends a block left open,
  and reads it again, 12 times at most. So the outline, hovers and completion
  still know the rest of the file.
- **One reading per change.** What it works out of a document is kept until
  its text, or a file it uses, changes. The editor's copies of the files it has
  open are read in place of the disk's, so a change not yet saved counts, and
  the documents that use a changed file get their problems again. An editor
  that finds the problems itself can ask for none (`initializationOptions:
  { diagnostics: no }`).
- **VS Code.** The extension now starts folio lsp where folio is installed
  (client.js, which needs no VS Code, speaks the protocol) for the outline,
  definitions, hovers and completion, which only the server can do across
  files. It keeps Folio's engine, built in, for the problems, the quick fixes and
  tidying: that needs no install, and finds what rests on a value written out
  too. Without folio, or with `folio.languageServer` off, it does as it did.
- **Neovim, Helix and Zed** colour with tree-sitter, so editors/tree-sitter-folio
  is a grammar: each line as Folio's tokenizer reads it, with a call, `to name`,
  `kind name`, `x's` and the values in text as parts of their own, and VS
  Code's words. Whether a `{` in text starts a value rests on the character
  after it, which a regular expression can't look at, so src/scanner.c reads the
  text between values. editors/neovim is a plugin folder (filetype, comments,
  Folio's indenting, folio lsp, the colours once the parser is built),
  editors/helix a languages.toml and its queries in Helix's names, and
  editors/zed an extension whose Rust starts folio lsp, as Zed runs a language
  server only for a language with a grammar. Zed and Helix build the grammar
  from the commit of this repository that added it. **JetBrains' IDEs** use
  LSP4IJ, which runs any language server, with the VS Code extension's
  TextMate grammar for the colours. editors/README.md says how to set up each.
- **Tested.** machine.test.js starts folio lsp and speaks the protocol to it,
  checking each message's framing: the problems as a document opens, against
  the checker's; the outline; definitions here and in two files it uses; each
  kind of hover; completion, and after `rex's` and `shapes's`; a document as
  it's typed; an unsaved change to a file it uses, and that file closed again;
  tidying, against format(); a message in pieces and two in one; shutdown and
  exit; no problems when asked for none; and the extension's client.js against
  it. editor.test.js runs the extension against stand-ins for VS Code and for
  the server, with and without it; and checks the grammar has VS Code's words,
  the colours' copies match, Zed and Neovim indent as VS Code does, and Zed and
  Helix name the commit the grammar is at. Done by hand: every Folio file here,
  and every example and test program (563), reads with tree-sitter with no
  error; Neovim 0.11, headless, showed the problems, hovered, went to a
  definition, tidied, indented and coloured; Helix 25.07 built the grammar and
  found the server and the queries; and the Zed extension built for
  WebAssembly.

## 109. A debug adapter for folio debug

- **Why.** An editor's debugger shows breakpoints in the margin, the calls in
  progress and the variables, and steps with a key. folio debug (§59) had all
  of that, as commands typed in a terminal.
- **What.** editors/vscode/debug-adapter.js speaks the Debug Adapter
  Protocol to the editor and folio debug's commands to the program: a
  breakpoint is `break lib.folio 4` (or `clear`), step in, over and out and
  continue are `step`, `next`, `out` and `go`, the calls in progress are
  `where`, the variables `vars`, and what's under the pointer, in a watch or
  in the debug console is `show` (the console's `where`, `list`, `breaks` and
  `help` are said as they are). The mistake that ends a program is a stop
  with its words, whose variables can still be looked at. While the program
  runs, a line typed in the debug console answers its `ask`.
- **Reading it.** The debugger answers on the program's own output, and asks
  for each command with `(folio) `, which the command is said after, as `ask`
  says an answer when the input isn't a terminal; a text value's new line is
  `\n`. So what comes before `(folio) ` after a command that only looks is its
  answer; after one that runs the program, it's what the program said, then
  the line it stopped at, whose shape (`prog.folio:5, in 'bump': ...`, or
  `stopped at the mistake, at ...`) the adapter reads. What the program says
  is shown as it comes, but for its last line, which may be that line: held
  until the next line comes, `(folio) ` does, or 200 ms go by.
- **In JavaScript, for now.** Driving a program's input and output both,
  while reading the editor's, needs a process with pipes for both, which
  tasks.folio hasn't, and folio isn't built with --allow-libraries. So the
  adapter is Node.js's: VS Code runs it inside the extension, and Neovim
  (nvim-dap, which editors/neovim sets up), Helix and LSP4IJ start it with
  node. A `folio dap` in Folio can come once tasks.folio can give a program its
  input.
- **What folio debug can't do.** It's told things only while the program is
  stopped, so a breakpoint set while it runs counts from where it next stops,
  and a pause is refused, saying so. A program stopped while it runs is ended
  with folio, as a group, and the program folio built (prog-debug) is taken
  away by the adapter, as folio can't, if this session made it.
- **VS Code.** *Folio: Debug this file* (and F5 with no launch.json) starts a
  debugging session in place of `folio debug` in a terminal, with folio.path's
  folio.
- **Tested.** machine.test.js runs the adapter as a program of its own, as an
  editor other than VS Code does, on folio.exe's folio debug: breakpoints in the
  program and a file it uses, taken away, the calls in progress, variables, a
  hover, a watch that fails, the console's `where` and an answer to `ask`,
  step out and over, a refused pause, what the program said and the number it
  ended with; a mistake stopped at, with its calls and variables; stopping on
  entry; a program stopped while it runs, and the program folio built taken
  away; and a folio that isn't there. editor.test.js checks the extension
  starts a session for Debug, fills a launch configuration in, and runs the
  adapter inside itself. Done by hand: Neovim 0.11 with nvim-dap, headless,
  set a breakpoint, stopped there, read a variable, continued, stepped and
  ran to the end, through editors/neovim's setup; and Helix 25.07 took the
  debugger's settings.

## 110. YAML

- **Why.** CI files, Kubernetes, Docker Compose and most of a company's
  settings are YAML; toml.folio read only TOML.
- **What.** yaml.folio reads YAML 1.2's core schema, as PyYAML does with
  YAML 1.2's resolver: `true`/`false`, `null`/`~`/nothing, decimal, `0x` and
  `0o` whole numbers, decimals with exponents and `.inf`; everything else text,
  so `on`, `no`, `1.2.3` and dates stay text (the "Norway problem" of 1.1
  doesn't happen). Block mappings and sequences (a sequence as indented as its
  key, compact `- key: v` items, `- - a`), flow `[ ]` and `{ }` over lines,
  plain text folded over lines, both quotes with every escape (`\x`, `\u`,
  `\U`, halves of a pair), `|` and `>` with `-`, `+` and an indentation
  digit, comments, `---` and `...`, `%` directives, anchors and aliases
  (the same value, as PyYAML gives), `<<` merges (one or a list, the
  mapping's own keys winning), `? key` explicit keys, and the tags !!str,
  !!int, !!float, !!bool, !!null and !!binary (bytes); other tags (`!Ref`)
  are passed over. Keys are text as written. A key twice is a mistake, as
  in toml.folio; YAML forbids it, though PyYAML keeps the last.
- **Writing.** yaml_of writes block style, two spaces a level; text plain
  where it reads back as itself, also by YAML 1.1 readers (so `yes`, `on`
  and anything starting with a digit, sign or dot is quoted), text with
  lines after `|`, `|-` or `|+`, bytes as `!!binary`, records as mappings.
- **Tested.** 62 documents (the spec's chapter 2, CI, Compose and Kubernetes
  files, every scalar kind, block scalar chomping, flow, anchors, merges and
  mistakes) against PyYAML with a YAML 1.2 resolver: 59 the same, the other
  three differences on purpose (a key twice, a tab after `:`, and `! 12`,
  which the spec says is text). Each of the 59 written by yaml_of, read back
  the same by yaml.folio and by PyYAML. yaml.test.folio keeps the cases, on all
  three engines and in machine code.

## 111. JSON Web Tokens

- **Why.** Every API a company runs or calls has bearer tokens, and an
  identity provider's are JWTs signed with RSA.
- **What.** jwt.folio makes tokens with HS256, HS384 and HS512 (hash.folio's
  HMAC) and checks them, and checks RS256, RS384 and RS512 with big.folio's
  `power_mod`: 0.05 s for a 2048-bit key in machine code, so checking is
  practical; signing with RSA (a 2048-bit private exponent, about 4 seconds
  even with the CRT) isn't offered. The signature is checked by building the
  whole expected PKCS #1 v1.5 block (00 01 FF.. 00, DigestInfo, hash) and
  comparing every byte with `same_secret`, never by parsing what the power
  gives, which is how forgeries have got through others' checks. Keys: a
  secret (text, bytes, or a JWK of kty `oct`), or RSA as a PEM public key,
  RSA public key or certificate (a small DER reader finds the key), or a JWK.
- **Algorithm confusion.** The key decides the algorithms, not the token: a
  secret only HS*, an RSA key only RS*; `none` is always turned down, and
  `crit` too. So a token signed with HMAC using the RSA public key's PEM as
  its secret fails, as does `alg: none`.
- **Claims.** exp and nbf with leeway, iat not in the future, iss among the
  issuers given, and aud: a token that has one must name the audience given,
  as RFC 7519 says; `require` lists claims that must be there; `now` can be
  given, so tests never ask the clock.
- **Tested.** RFC 7515's A.1 (HS256, its key a JWK) and A.2 (RS256); tokens
  PyJWT made with all six algorithms, the same bytes made here for HS*; a
  key from Python's cryptography as SPKI, PKCS #1, a certificate and a JWK;
  every claim failing; and the attacks above. On the JIT (RSA is slow on the
  other two engines) and in machine code.
- **A bug found.** In machine code, `list of a for each a in xs where ...`
  inside a function of a file used `as` a name fails, "'jwt' has nothing
  called 'jwt's each item'": the libraries use loops instead. Not fixed here.

## 112. S3 and Signature Version 4

- **Why.** Files a company keeps are in S3, or a store that speaks its
  language: MinIO, R2, B2, Ceph.
- **What.** s3.folio signs each request with SigV4 (the canonical request,
  the string to sign, the key derived from the date, region and service) and
  sends it through http.folio, with the Host header it signed and the path and
  query exactly as signed (each encoded once, as S3 wants, the query sorted).
  Objects are put, got, looked at, listed (ListObjectsV2, page after page),
  deleted; buckets made (with a LocationConstraint outside us-east-1),
  removed and listed; and presigned URLs made for GET, PUT or DELETE.
  Buckets go in the path for MinIO and other stores, in the host's name for
  amazonaws.com. Temporary credentials' token is sent and signed;
  `sign_payload no` sends UNSIGNED-PAYLOAD, as hashing in Folio is about
  1.7 MB a second. `sign()` is public, for other AWS services.
- **Tested.** Against the signatures in S3's own guide (GET with a Range,
  PUT of a key with `$`, a bucket's lifecycle, a listing, and the presigned
  URL), and AWS's test suite's get-vanilla, query order and header trimming,
  all matching on every engine and in machine code; then a real MinIO.

## 113. OAuth 2

- **Why.** A program a company writes signs people in through Google,
  GitHub, Okta or Entra, and calls APIs with its own credentials.
- **What.** oauth.folio has the authorization code flow with PKCE (S256; a
  32-byte verifier and 16-byte state from secrets.folio), and `sign_in`, which
  does it as command-line tools do (RFC 8252): server.folio answers on
  127.0.0.1, at the first free port from 8765; the browser is opened where
  the program may run one (rundll32 or xdg-open), and the address is said to
  the error output either way; a request whose state isn't the one sent is
  answered 400 and waited past; the code, or the provider's error, ends the
  wait. Then the client credentials grant, refresh (the old refresh token
  kept if no new one comes), `expired`, and `discover`, from OpenID Connect's
  document. A client secret goes as HTTP Basic or in the form. A token
  endpoint's answer in a form (GitHub's, unless asked for JSON) is read too.
- **Tested.** RFC 7636's PKCE example, the authorization address, every kind
  of answer, in machine code (the randomness is the system's); and a whole
  sign-in in machine.test.js: Node is the provider, checking the verifier
  against the challenge in the address the program said, and the browser,
  coming back to the program's own server first with a wrong state, then the
  code; refresh, a revoked refresh token, client credentials both ways, and a
  person saying no, its words escaped in the page.

## 114. Bytes on a connection, and Redis

- **Why.** Databases speak protocols of bytes: lengths, numbers and lines,
  arriving in pieces.
- **wire.folio.** A reader keeps a buffer of what came, twice as big when a
  message needs more, so a 10 MB reply costs about 10 MB of copying, not its
  square; `take(n)`, `line` (to \r\n), `text_to_zero`, numbers of 1 to 8 bytes
  either way round, signed or not, and IEEE 754 doubles both ways, written by
  finding the exponent and scaling by powers of 2, which are exact. A
  writer keeps pieces and joins them once. A negative 8-byte number is
  written as -n-1 with its bits turned over, so it stays exact to 2^53.
- **redis.folio.** RESP2 and RESP3 (maps as dictionaries, sets as lists,
  doubles, booleans, big numbers as text, verbatim strings, attributes passed
  over, pushes); commands as arrays of bulk strings, binary-safe; pipelining
  (every reply read before any error is raised, so the connection stays in
  step); MULTI/EXEC; SCAN rather than KEYS; BLPOP; pub/sub by channel and
  pattern, with a time limit through sockets.folio's `ready`; AUTH with a
  user; `rediss://` over TLS. Bulk strings come back as text, or as bytes
  through get_bytes and command_bytes.
- **Tested.** Every reply type read from bytes, and commands written byte
  for byte, on every engine and in machine code; then a real Redis.

## 115. PostgreSQL

- **Why.** It's the database most companies start with.
- **What.** Protocol 3: SSLRequest first unless TLS is "disable"; then
  SCRAM-SHA-256 (the server's signature checked at the end, so a server that
  doesn't know the password is found out), MD5 or a password in the clear,
  whichever the server asks for. Every query goes by the extended protocol:
  Parse with each parameter's type left to the server (bytea's said, as its
  bytes go in binary), Bind, Describe, Execute and Sync in one send, so the
  SQL and the values never meet. Results come as text and are made Folio
  values by their type's OID (int2/4/8, float4/8, numeric, bool, bytea, json
  and jsonb, one-dimensional arrays of those); NULL is nothing. After an
  error the server skips to Sync's ReadyForQuery, which is read before the
  error is raised, so the connection is ready for the next query. Notices
  are kept on the connection. `run_script` uses the simple protocol, for
  files of many statements. `in_transaction` commits, or rolls back and
  raises the mistake again.
- **TLS.** "prefer" tries TLS where the server has it; as sockets.folio
  always checks certificates, a server whose certificate can't be checked
  (or a Windows computer without OpenSSL) is connected to again without TLS,
  which is what "prefer" means in libpq, where it never checks at all.
  "require" never falls back.
- **Tested.** RFC 7677's SCRAM example; MD5; the messages of a query byte for
  byte, and a server's answers (every type, NULLs, an error with a notice
  before it, a constraint's detail) as Python's struct makes them, on the
  JIT and in machine code; then a real PostgreSQL 16.

## 116. MySQL

- **Why.** The other database companies run, with MariaDB.
- **What.** The handshake (protocol 10), an SSLRequest where TLS is wanted,
  HandshakeResponse41 with utf8mb4, and the three plugins:
  `mysql_native_password` (SHA-1), `caching_sha2_password` (SHA-256) and
  `sha256_password`, with the server's switch to another plugin followed.
  caching_sha2's full way, and sha256_password, send the password in the
  clear over TLS, and without TLS ask for the server's RSA key and send it
  XORed with the nonce and encrypted with RSAES-OAEP (SHA-1, MGF1), built
  here on big.folio and jwt.folio's key reader.
- **A user that isn't there.** So that a login can't tell whether an account
  exists, MySQL gives a user it doesn't have a plugin chosen at random (kept
  for that name until it restarts): any of the three. Without
  sha256_password, a mistyped user was refused, one time in three, with
  "the server logs in with sha256_password" rather than "Access denied";
  CI's live test caught it. With it, such a user is always refused by the
  server, as it should be.
  Statements are prepared once each (kept by their SQL on the connection) and
  run with COM_STMT_EXECUTE: whole numbers as 8 bytes, others as doubles,
  text, bytes as blobs, NULLs in the bitmap. Rows in the binary protocol are
  read by type (signed and unsigned integers, floats of 4 and 8 bytes,
  decimals, dates, times with days and a sign, JSON, binary columns as
  bytes); `run_script` uses COM_QUERY's text rows, with multi-statements on.
- **Tested.** The handshake, both scrambles, OAEP with a fixed seed against
  Python's by hand (which Python's cryptography decrypts), the execute
  message and a server's binary and text rows, OK and ERR, as Python makes
  them, on the JIT and in machine code; then a real MySQL 8.4, whose
  certificate is its own, so "prefer" falls back and caching_sha2 goes the
  RSA way, then the fast way; a native-password user; a sha256_password user;
  and six users that aren't there, each refused with "Access denied" whatever
  plugin the server drew for it. A sha256_password user was also logged in
  over TLS, with a certificate made for the test, against MySQL 8.0.

## 117. Real servers in CI

- **Why.** A protocol read only from bytes made by hand is a protocol as
  understood by whoever made them.
- **What.** machine.test.js has a live test for each of PostgreSQL, MySQL,
  Redis and S3, run where `FOLIO_POSTGRES_URL`, `FOLIO_MYSQL_URL`,
  `FOLIO_REDIS_URL` and `FOLIO_S3_URL` say where a server is, skipped where not.
  CI's test job has PostgreSQL 16 (logins md5, so a SCRAM password logs in by
  SCRAM and an MD5 one by MD5), Redis 7 and MinIO as service containers, and
  starts MySQL 8.4 with `docker run`, as `--mysql-native-password=ON` is a
  server option a service can't be given. MinIO no longer publishes images of
  its own, so CI uses Bitnami's build of it. The passwords are the
  containers' own, made up for the tests.
- **Tested.** Each program is built by the machine compiler and run with the
  server's address; what it says must be exactly what it said here against
  the same servers in WSL's Docker.

## 118. Arrays of numbers, and Folio's own loops

- **Why.** NumPy is what makes Python the language of data and machine
  learning: numbers in a shape, and maths on all of them at once. Folio had
  lists, and a loop in Folio takes a few instructions an item.
- **tools/arrays.folio** is an array as NumPy has one: a record of a `shape`
  and its numbers, the last axis's one after another, as C lays them out.
  It makes arrays (from nested lists, zeros, random, counting, identity),
  does maths element by element with NumPy's broadcasting, matrix
  multiplication, sums, means and the largest along an axis, reshaping,
  slicing, transposing, stacking and softmax. Axes and places count from 1,
  as items do. A shape that can't be, or shapes that don't go together, is
  a `fail with` that says which.
- **Folio's own loops.** `use the library "folio"` names functions a program
  has in it, which machine.folio writes in machine code: numbers_binary,
  numbers_matmul and numbers_reduce (matmul and sums with SSE2, two numbers
  at a time), and numbers_convert. Nothing is loaded, so they need no `--allow-libraries`.
  Each is given the lists themselves and checks what it's given: every
  place it reads or writes is in its list and every number it works out is
  a number. For anything else (a place outside a list, a NaN, a division by
  0) it gives 1 and arrays.folio does that work in Folio, so what happens is
  what Folio says happens, to the last bit, on every engine. On the
  JavaScript engines, which can't call a library, all of it is Folio.
- **Lists of numbers for C.** `a list of numbers` as a library function's
  input gives C where the list's numbers are, a `double*`, which C can read
  and change; a NaN C leaves there is made the NaN Folio's arithmetic makes.
  Only an input can be one.
- **Tested.** arrays.test.folio on all three engines and in machine code:
  making, element by element, broadcasting, matrices, along axes, shapes,
  NaN and infinity, mistakes, and machine code's loops giving exactly what
  Folio's give; Folio's own library used without `--allow-libraries` and not
  linked; and memcpy and memset on a list of numbers.

## 119. BLAS and ONNX Runtime: calls at an address

- **Why.** NumPy's matmul is BLAS's, and a model trained in PyTorch runs
  anywhere as an ONNX file through ONNX Runtime, whose C API is a table of
  functions found through one, OrtGetApiBase.
- **At an address.** A library's function quoted `"at an address"` has no
  name in the library: its first input is where it is, a pointer C gave.
  The library is still loaded, and asked for, first. A function with no
  pointer first is turned away when the program is built, and nothing in
  its place is a mistake that says so.
- **use_blas.** `arrays's use_blas()` has matmul go through BLAS's dgemm:
  OpenBLAS as its releases and Linux's packages have it, or NumPy's copy
  (scipy_openblas64_, with 64-bit whole numbers). It says which it found, or
  nothing, and stop_using_blas goes back to Folio's own loops.
- **tools/onnx.folio** loads a model, says its inputs and outputs (name,
  type and shape, -1 for an axis of any length), and runs it: arrays in and
  arrays out, in floats, doubles or 64-bit whole numbers, which
  numbers_convert converts to and from. Windows 11 has ONNX Runtime in
  System32; elsewhere it goes beside the program or where Linux keeps
  libraries. Its mistakes are a `fail with` with what ONNX Runtime said.
- **Tested.** In machine code: abs and strlen called where dlsym (or
  GetProcAddress) says they are; a dense layer as an ONNX model the test
  writes, in floats and doubles, with a wrong input's name, a wrong shape
  and a missing file; and matmul through BLAS giving what Folio's loops give.
  Each runs where ONNX Runtime and OpenBLAS are installed, and is skipped
  where they aren't; CI installs both.

## 120. Python inside Folio

- **Why.** Most of machine learning's libraries are Python's. A Folio
  program that can use them needn't wait for Folio to have its own.
- **tools/python.folio** loads CPython's own library, through its C API at
  addresses (§119): where PYTHON_LIBRARY says, else beside a folder in PATH,
  else as Linux installs it. It runs code, evaluates expressions, imports
  modules, calls functions (with inputs by name), and reads and sets
  attributes and variables. Numbers, text, yes and no, nothing, lists and
  dictionaries go across as each other; an array as a NumPy array, where
  NumPy is; anything else stays a Python object. Python's mistakes are
  Folio's: `Python: ZeroDivisionError: division by zero`.
- **Tested.** In machine code, with the Python the computer has: code,
  modules, values both ways, text beyond ASCII, Python's mistakes and a
  module that isn't there, and with NumPy, arrays both ways. It's skipped
  where Python's library isn't installed.

## 121. Large language models: tools/ai.folio

- **Why.** Programs ask models now: for an answer, for JSON of a shape, to
  use the program's own functions, or for embeddings to search by meaning.
- **What it does.** anthropic() is Anthropic's Messages API, Claude Opus
  5.5 unless a model is named; openai() is OpenAI's; openai_compatible()
  any server that speaks OpenAI's API, as Ollama, LM Studio and vLLM do.
  answer, chat (messages, a system prompt, effort, the reply's text, stop
  reason, tool calls and usage), stream (each piece of the answer to a
  function as it comes, from server-sent events read as they arrive, in
  chunks or not), chat_with_tools (each tool the model uses run, and its
  result sent back, until it answers; one that fails is sent back as an
  error), answer_json (structured outputs, from a JSON Schema), embed (an
  array, a row for each text), and vectors searched by cosine similarity,
  as one matmul.
- **Keys.** Only from the environment: ANTHROPIC_API_KEY for Anthropic, and
  OPENAI_API_KEY for OpenAI or a server that's said to want one. They're
  never kept in a value or shown, and each goes only to its own API.
- **Refusals.** On Claude Fable 5.1, Opus 5.5, Opus 5 and Sonnet 5.5, a
  request goes with `fallbacks: "default"`, so one the model declines is run
  again on another, on Anthropic's servers; `"fallbacks" is no` turns that
  off. After a fallback part of the way through, the turn sent back holds
  only the text from before it, not tool uses or thinking, and that tool
  use isn't run.
- **Tested.** ai.test.folio on all three engines: what each request says,
  events read from bytes however they're cut, a fallback part of the way,
  and searching vectors. In machine code, against a server of the test's
  own that answers as both APIs do: answers, streams, tools and a tool that
  fails, JSON, embeddings and a search of them, a server that wants no key,
  a wrong key and none, each key only in its own API's header and in no
  request's body. The keys are made up.

## 122. Jupyter

- **Why.** Jupyter is where data work is done, and its notebooks run in
  JupyterLab, VS Code and the rest. `folio notebook` (§77) runs Markdown,
  but people open .ipynb files.
- **folio kernel** runs cells as notebook blocks are run, so a cell has what
  the cells before it made, a cell whose last line is a value shows it, and
  one that fails keeps nothing. Each line it reads names a file holding a
  cell; a number before it numbers the cell as Jupyter does, so mistakes say
  `cell 4:1:5`, but never back, so each cell's name is its own. Unlike a
  notebook's blocks, a cell's output and mistakes go out as they come, and
  it has the kernel's input, so it can ask. A line of byte 1 and
  `folio-cell` comes before a cell's output, then one of byte 1 and
  `folio-done` on the error output and one with `ok` or `failed` on the
  output. Its program and the file it keeps names in have names of their
  own, so two kernels can share a folder. A one-line cell that's a value
  now shows it, and the shell's state file is the shell's record's.
- **editors/jupyter** is a wrapper kernel, ipykernel's `Kernel` with
  `do_execute`, and its kernelspec; `python folio_kernel.py install` installs
  it for the Python that ran it. Each cell goes to `folio kernel`, its output
  to Jupyter as it comes, a whole line at a time, and a mistake as
  Jupyter's error. A Folio program writes a line part of the way only when it
  asks, so output that stops part of the way for a quarter of a second is a
  question, asked in Jupyter's input box, whose answer goes to the cell's
  input and isn't shown twice; where the frontend can't answer, the cell is
  stopped. folio kernel has a process group of its own, so Jupyter's
  interrupt reaches only the Python kernel, which stops the cell's program
  (found in /proc, or with psutil) and keeps the cells before it. If folio
  kernel itself stops, a new one starts and the cell says so.
- **What cells may do.** All of it, unless FOLIO_KERNEL_ALLOW gives other
  `--allow` flags: a notebook's code is the person's own, as a Python
  notebook's is.
- **Tested.** Through folio.exe, each line given once the one before is
  done: values, a function, a mistake that keeps nothing, an empty cell,
  the error output, numbering and its never going back, a file that isn't
  there, a question answered, and nothing left behind. In Python, against
  a stand-in for folio kernel that runs each cell as a program of its own:
  output in pieces and in several bytes a character, questions answered and
  not, mistakes, numbers, a cell stopped, folio kernel stopping, and the
  programs a program started; against the folio built here: what cells keep
  and show, a question, a cell stopped, a file beside the notebook, and two
  kernels in one folder; and, where ipykernel and jupyter_client are
  installed, the kernel installed and run as Jupyter runs it, interrupted
  and restarted.

## 123. A web server for many people at once

- **Why.** server.folio answered one request at a time, start to finish: it
  read until a request was whole, answered, and closed the connection. One
  client that stopped halfway held up everyone until it went away, nothing
  limited how long a request could take or how big its headers grew, and each
  request paid for a new connection. That's a server for one person.
- **One thread, many connections.** The server now waits, with poll (WSAPoll
  on Windows), for whichever of its connections has something to say, and on
  non-blocking sockets reads what has come and writes what the connection
  will take. A connection is a record: its stage (agreeing on TLS, reading, or
  writing), what has come, where its headers end, its answer and how much of
  it has gone, and when it's out of time. A round is one wait, of at most 50
  ms so time limits are kept, then each connection that can go on. A whole
  request is given to the handler as before, so a handler is written as it was.
- **Keep-alive.** HTTP/1.1 keeps a connection open for the next request
  unless it says `Connection: close`; HTTP/1.0 only if it asks. Requests sent
  together (pipelined) are answered in the order they came. `set_most_requests`
  closes one after so many (1,000), and `set_keep_alive(no)` after each.
- **Limits.** A request has `set_timeout` (30 s) to arrive once its first
  byte has come and a kept connection `set_idle_timeout` (5 s) to begin the
  next: one that goes over is answered 408 and closed, or just closed if it
  had begun nothing. Bigger than `set_most_bytes` (16 MB) is 413, headers over
  64 KB 431, and a request line, length or chunk that can't be read 400, as
  are two Content-Lengths that differ. Only `set_most_connections` (1,024) are
  held at once; the rest wait in the system's queue (512 deep).
- **Nothing looked through twice.** Looking for the end of the headers starts
  where the last look stopped, and a body in chunks is read on from the last
  chunk read, so a request that comes a byte at a time costs what one that
  comes at once does; before, each byte that came meant looking through all of
  it again. The headers are read once, into a dictionary that says the body's
  length, whether it's in chunks and whether to keep the connection.
- **Writing.** A write that the connection won't take now (its room is full,
  as with an answer of megabytes to a client that reads slowly) waits for poll
  to say it will, where before it was taken for a connection gone, cutting
  the answer short. A connection that's really gone says so to poll (POLLHUP,
  POLLERR), which closes it. An answer has `set_timeout` from each time the
  other end takes some of it, so a long download goes on while it's taken,
  and one the other end has stopped taking is cut off.
- **40 ms.** The first version answered 4,500 requests a second, each 40 ms
  late: the headers and the body went in two writes, and the second waited,
  by Nagle's algorithm, for the client to say it had the first, which the
  client put off for 40 ms. A text answer now goes in one write, and every
  connection has TCP_NODELAY, for an answer in bytes, which is still two.
- **A mistake in the server** while it sees to one connection closes that
  connection, says why to the error output, and the rest go on. stop_serving()
  stops reading and sends what's being sent before serve() returns.
- **What it gave.** tools/load-test.mjs builds a site with server.folio and
  asks it from Node on raw sockets: `steady` is 200 connections each asking
  again as soon as it's answered (on one connection if the server keeps it,
  a new one each time if not), `burst` 200 connections at once, `slow` 200
  requests while 50 connections sit with half a request sent, and `heavy` 200
  connections asking for a page that takes about 1 ms of work. Linux, 4 cores,
  5 s each, the client on the same machine:

  |            | before (1.11.0)              | now                          |
  |------------|------------------------------|------------------------------|
  | steady     | 10,506/s, slowest 7.7 s      | 84,748/s, 99% within 7.4 ms  |
  | burst      | typical 1,018 ms             | typical 8.1 ms               |
  | slow       | none of 200 in 10 s          | all 200, typical 27 ms       |
  | heavy      | 377/s, slowest 14.5 s        | 664/s, slowest 634 ms        |

  Before, connections waited in the queue for seconds, some until the client
  gave up; `slow` never ended, as the first half-sent request held the server.
  `heavy` is limited by its work on one thread; §124's workers take it to
  4,489/s on 4.
- **Tested.** On raw sockets, with time limits of 400 ms: three requests on
  one connection, the last told it's the last; two sent together, then HEAD;
  an answer of nothing (204); HTTP/1.0 with and without keep-alive; a body in
  pieces with a pause between, and one in chunks a few bytes at a time with
  an extension and a trailer, then another request on the same connection; an
  answer of 12.8 MB to a client that waits before reading, then stops five
  times as it reads, far longer than the time limit in all; a
  query with a % that isn't one; 413, 431, 400 for a request that isn't one,
  a length that isn't, two lengths and chunks that can't be read; 408 for a
  request too slow to arrive, and a kept connection closed when it's idle; a
  client sending a byte at a time while another is answered first; and
  stop_serving(). The tests from before (HTTPS, the guestbook app, http.folio's
  and websocket.folio's) pass as they were.

## 124. Workers: every core, sharing nothing

- **Why.** Tasks (§62) take turns: one runs Folio at a time, so a server's
  handlers, or a sum split into tasks, use one core however many there are.
  cores.folio (§75) uses them all, but with copies of the program, each a
  process, started again from the top and talking through files.
- **Isolated workers, not shared threads.** Threads that share memory would
  need every list, record and dictionary, and the runtime's own memory, to be
  safe to change from two threads at once: a lock around each, or a garbage
  collector that stops every thread to look at their memory, and a program
  could still change a list while another thread reads it, which is a race.
  sync.folio's lock is right only because one task runs at a time: it takes a
  lock by seeing it free and marking it held, with nothing in between. So a
  worker shares nothing. It has a copy of the program's variables as they were
  when it started, and copies of its inputs; it changes them as it likes, and
  no one else sees; what it gives back, or the mistake it ends with, is copied
  back when it's waited for. There are no races, sync.folio keeps its promise
  (a worker's tasks take turns among themselves, as the program's do), and
  each worker's collector looks at its own memory alone, with nothing to stop.
  It's what JavaScript's Web Workers, Erlang's processes and Python's
  subinterpreters do.
- **Plain English.** `start count(10) on another core` starts a worker and
  gives a record of its number, `(record with worker 1)`, as `start count(10)`
  gives a task; `wait for` and `has ended` take either, and so do sync.folio's
  wait_for_all and wait_for_any. `on another core` is read only after a
  `start` and its call, where nothing could follow before, so no program that
  worked means anything new, and `on`, `another` and `core` are still names.
- **What can be copied.** Numbers, text, yes and no, nothing, lists, records,
  dictionaries, bytes, amounts, and functions made at the top of a file, which
  share nothing but the program's variables, of which the worker has its own.
  A function made inside another shares that function's variables, so it
  can't go to a worker, nor come back from one; a value nested over 1,000
  deep can't be copied, which a list that holds itself is. Each is a mistake
  where it's started, or waited for; one of the program's variables that holds
  one has no value in the worker.
- **In machine code,** a worker is a thread of the system's (CreateThread on
  Windows; on Linux pthread_create, or clone where the C library isn't
  loaded) running a copy of the program's whole image: its code, its
  read-only data, its variables and the runtime's own memory, the 256 MB stack
  of the program's own thread left out. Every instruction reaches its data by
  a distance from itself, so the copy's code uses the copy's data; the 8-byte
  addresses in the data (a text's bytes, a record's field names, tables of
  texts) are listed when the program is built, and each is moved in the copy
  by how far the copy is from the original. So a worker has its own heap and
  collector, its own variables, its own turn for its own tasks, and its own
  workers, and the program and its workers run Folio at the same moment.
- **Copying between heaps.** Both heaps are in one address space, so the
  worker copies what it's given from the program's heap into its own while
  the program waits, which keeps the program's collector away from what's
  being read; after that it reads nothing of the program's. What it gives back
  waits in its heap until `wait for` copies it into the program's. A text or a
  field's name in the image isn't copied: the same place in the copy is that
  far along, so `x of r` finds its field in a worker as it does in the program.
- **Memory.** An image is made for a worker the first time its slot is used,
  and kept, with its heap, for the next worker in that slot once the program
  has taken the last one's answer; so a program that starts worker after
  worker, as a server does, makes as many images as it has workers at once.
  A server's image is about 0.8 MB, and each heap grows as the program's
  does. 64 workers can have answers nothing has taken yet, and starting a 65th
  is a mistake that says so. A worker ends its own tasks and workers before
  it ends, and the program ends its workers, as it ends its tasks, before it
  ends; `random number` goes on in each worker from where the program had got
  to, each 2^24 numbers further along than the one numbered before it.
- **Windows.** Written as the task threads are: the image's memory from
  VirtualAlloc, readable, writable and runnable; the thread from CreateThread
  with the same stack; a manual-reset event for its end, set before its state
  says it has ended, so a program that wakes early waits again; SwitchToThread
  while the program waits for a worker to copy what it was given; and the
  image's own TLS index and semaphore for its tasks, made once, with the slot
  set for each new thread. It's built and its imports checked on Linux, not
  run there; CI runs on Linux.
- **On the JavaScript engines** a worker runs to its end when it's started,
  as a task does, on copies all the same: the program's variables are swapped
  for copies while it runs and put back after, and what it gives is copied.
  Its own tasks and workers are numbered from 1 while it runs, as in machine
  code, and the limit of 64 is kept. So a program says the same everywhere,
  except what only threads show (a worker that hasn't ended yet).
- **server.folio on workers.** `set_workers(4)`, or `serve_on_workers(8080,
  answer, 4)`, starts 4 workers (0 for one a core) on the one listening
  socket. Each runs §123's rounds with connections of its own, taking one new
  connection a round, so those that wake for the same one share them. A
  handler that works for a second holds up only its own worker's connections.
  A worker that ends with a mistake is said and another started;
  stop_serving() stops the worker it's called on.
- **What it gave.** Four calls of a 40,000,000-round loop, one after another
  and then on four workers, on 4 cores: the workers took 0.27 of the time.
  Eight 30,000,000-round loops: 2,340 ms one after another, 626 ms on eight
  workers. 3,000 workers started and waited for one after another: 0.10 s; 64
  at once, 34 ms. The `heavy` load test of §123: 664/s on one thread, 4,489/s
  on four workers.
- **Tested.** The JavaScript engines, the compiler written in Folio and machine
  code agree on: the program's variables and a worker's inputs, which it
  changes only for itself; functions, records, dictionaries, bytes and amounts
  given and given back; a worker's mistake, kept for `wait for`; what can't be
  copied, at the start and at the end; what isn't a worker; a worker's own
  tasks and workers, numbered from 1; and the limit of 64. In machine code,
  against the JavaScript engine: eight workers at once, each making far more
  than it keeps; workers starting workers; the program's tasks running while
  worker after worker, each in its predecessor's memory, starts tasks of its
  own; 3,000 workers one after another and 64 at once; a list of 100,000
  given and given back; what a worker says, and one never waited for; a
  worker's mistake. And only in machine code: two workers that each wait for a
  file the other writes, which they can do only at the same moment; `has
  ended` on a worker still working; sync.folio's lock among a worker's tasks;
  four workers taking far less time than four calls; and a Windows program's
  imports. server.folio with three workers: twenty requests answered while one
  handler works for a second and a half.

## 125. A WebAssembly back end written in Folio

Folio's web side is about 18,000 lines of JavaScript, and even a program the
WebAssembly engine compiles calls back into `vm.js` for text, dictionaries,
built-ins and every mistake. The plan is a Folio compiler written in Folio that
runs in the browser as WebAssembly, with JavaScript left as a small loader, in
four stages: a WebAssembly back end in Folio; the runtime in WebAssembly, so a
module imports nothing from `vm.js`; `folio.wasm`, the compiler built into a
module that rebuilds itself to the same bytes; and the playground on
`folio.wasm`. This is the first. The rest are still to come, and the JavaScript
engines stay: as the fallback, and as what the tests compare against.

- **A port, byte for byte.** [`wasm.folio`](wasm.folio) is `wasm.js` written in
  Folio: the same encoder, the same runtime functions, the same escape analysis
  and unboxed numbers, the same fast paths for `remainder`, `rounded` and
  `item n of`, and numbers as `wasm.js` keeps them (an i31 from -2^30 to
  2^30-1 that isn't 0 or 1, which are no and yes, and a box otherwise). It
  reads programs with `compiler.folio`'s tokenizer, parser and scope rules, as
  `machine.folio` does, and makes exactly the bytes `wasm.js` makes, as
  `compiler.folio` makes exactly the JIT's JavaScript. Matching byte for byte
  is the strongest check there is: every local, global, type and position
  must come in the same order, so any difference in what the two back ends
  think a program means shows up as a byte.
- **The tree is `compiler.folio`'s.** Its fields differ from `folio.js`'s where
  `of`, `to` and `bytes` can't be field names (`subject`, `start` and `limit`,
  `over`, `binary`), and a number is kept as written, so `wasm.folio` works out
  a double's 8 bytes itself, with exact steps (halving, doubling and
  subtracting), as `machine.folio` does, and keeps one global for each
  different double, keyed by its bytes.
- **Writing code from text.** The runtime is about 450 lines of instruction
  chains in `wasm.js`. In Folio each chain is a line of text, such as
  `local.get 0 ref.test i31 if i32 ...`, which a small assembler turns into
  bytes, knowing each instruction's immediates and the names of the module's
  types, functions, imports, globals and a function's own locals. That kept
  the port close enough to `wasm.js` to check line by line.
- **The runtime once.** Every module starts with the same types, imports,
  runtime functions, exports and globals, so they are made once per run of
  the compiler and copied, with each function's encoded body kept. A program
  then costs only its own code: about 1.5 ms a program through the JIT, 12
  seconds for the 7,822 programs of the test corpora.
- **The escape analysis missed three places.** Making `wasm.folio` meant
  reading every field the parser makes, and `wasm.js`'s escape analysis never
  looked inside `ask`'s question, `wait`'s amount, or `play note`'s note and
  time. A function that used an outer variable only there kept it in a local
  of the program's, not in the heap, and found it unset. Both back ends now
  look there, and a test runs the four programs that showed it on every
  engine.
- **It compiles itself.** `wasm.folio` with `compiler.folio` is a program like
  any other: compiled by itself, it is a 977,707-byte module, `wasm.js`'s bytes
  exactly, in about a second, and that module, run, compiles a program into
  the same bytes again. That is the start of `folio.wasm`; what's missing is
  the runtime, which the module still imports from `vm.js`.
- **Half an emoji.** Holding `wasm.folio`'s mistakes to the VM's, column and
  all, found one more difference, in `compiler.folio`'s tokenizer: half of a
  character past the first 65,536, on its own, sorts among those characters,
  so it counted 2 columns where JavaScript counts 1. It now counts 2 only for
  a character that is 4 bytes of UTF-8.
- **`folio build --target wasm`.** `folio.folio` carries `wasm.folio`, made into
  machine code by `machine.folio` with the rest, and writes `<file>.wasm`:
  `wasm.js`'s module, byte for byte, then a custom section called `folio`
  holding, as JSON, what the JavaScript side needs to run it (each position,
  the names, the messages, the text, and what typed inputs must be).
  `runWasm` in `folio.js` reads that section and runs it. Until the runtime is
  in WebAssembly too, the module still imports `vm.js`'s checks, and with no
  source to hand to the VM, calls past 2,000 deep are a mistake there.
- **Tested.** `wasm.folio`, run through the JIT, makes `wasm.js`'s bytes, or
  stops at the same mistake, on every playground example, every hand-written
  case, the 1,500 programs the grammar makes, the 5,000 broken ones and 500 of
  machine code's random programs; what it makes says, draws and stops at what
  the VM does, mistakes, positions and trails included, on all of them but
  machine code's, and the hand-written cases say what they should. `folio`
  itself, with `wasm.folio` in machine code, builds a module whose bytes are
  `wasm.js`'s, which runs as the VM runs the program, and folio still builds
  itself into the same bytes.

## 126. The VS Code extension, ready to publish

- **Why.** People find VS Code extensions in VS Code's Extensions view, from
  the Visual Studio Marketplace, and editors built from VS Code (VSCodium,
  Cursor, Gitpod) from Open VSX. The extension was a .vsix to make from the
  repository, and it ran whatever `folio.path` said, `folio` by default.
- **Finding folio.** find-folio.js, which needs no VS Code, looks where
  `folio.path` says (the file, or the folder it's in; `~`, a path from the
  workspace's folder, and the quotes Windows' "Copy as path" puts round one,
  all taken), or else in each folder on the PATH, in order: `folio.exe` on
  Windows, where the PATH is Path, split at `;`, with folders in quotes, and
  `folio` on Linux, which must be marked as a program. It's looked for each
  time it's needed, so one installed since is found, and the language server
  starts again when `folio.path` changes. Run, Build, the debugger and folio
  lsp all start the full path found, never a name a shell or Windows would
  look for in the program's own folder first. Where there's none, one
  warning says why (not on the PATH, not where folio.path says, or not marked
  as a program), with **Get Folio**, which opens the releases, and **Don't
  Show Again**, kept between sessions; Run, Build and Debug say it again, as
  they can't do what was asked. Nothing waits for it to be answered. The
  checker and tidying are the engine built in, so the problems, Format
  Document, colours and snippets go on without folio.
- **Folders not trusted.** `folio.path` is a restricted setting
  (`untrustedWorkspaces: limited`): in VS Code's Restricted Mode a folder's
  own settings can't say which program to run, and a folio.path that doesn't
  start at the top is taken from the folder only once it's trusted.
- **Run and Build as tasks.** A terminal whose program is folio closes the
  moment the program ends, so what it said was gone at once. A task with a
  ProcessExecution starts folio the same way, with nothing for a shell to
  quote, but its terminal stays, says how it ended, and gives the program
  its input for `ask`. `"type": "folio"` tasks in tasks.json are made the
  same, from a task provider.
- **The Marketplace's page.** The manifest has an icon (the site's lantern on
  its cord and its moth flying to it, drawn in SVG, images/icon.svg, and made
  a 128-pixel PNG by Chromium), the site's night as the banner, keywords,
  the site as its homepage, issues as its bugs, no Q&A, and Education among
  its categories. The README is for someone who has never heard of Folio:
  what it is, how to get folio, then each feature with a picture taken in VS
  Code. Its pictures are the repository's, by their full address, as vsce
  would make a relative one point at the repository's top, not this folder,
  so the .vsix holds none of them but the icon. e2e/screenshots.mjs takes
  them again: VS Code on a display of Xvfb's, each scene put on it with
  VS Code's API from its extension host, the screen taken by ImageMagick,
  cut, and the GIFs made of its frames.
- **Packing.** vsce, pinned with ovsx and @vscode/test-electron in a
  package-lock.json of the extension's own, so the repository itself still
  needs nothing installed. Its vscode:prepublish script copies the engine
  into engine/, and .vscodeignore lets through only make-vsix.mjs's FILES:
  23 files, about 180 KB. make-vsix.mjs stays, for a .vsix with nothing to
  install, and check-package.mjs holds `vsce ls` and the .vsix to the same
  list, the engine to the repository's, the manifest to package.json, the
  README to pictures on the web, and the whole to under a megabyte.
- **Publishing.** publish-extension.yml runs only by hand, and only from
  main. Its first job packs the extension once, checks it and tests it in VS
  Code; its second, the only one given the tokens or an identity, publishes
  that same .vsix: to the Marketplace with VSCE_PAT and to Open VSX with
  OVSX_PAT, each skipped with a notice where its secret isn't set. vsce and
  ovsx read them from the environment. Azure DevOps retires the global
  tokens the Marketplace takes on December 1, 2026, so where there's no
  VSCE_PAT and the VSCE_TRUSTED_PUBLISHING variable is true, it publishes
  with `vsce publish --oidc`, the Marketplace's Trusted Publishing, which
  takes the run's own GitHub identity. docs/publishing-the-extension.md
  says how to set each up. The extension's version is its own, 0.1.0.
- **What it needs of folio.** Run, Build, questions and tasks work with
  folio 1.11.0, the latest release; folio lsp and the debugger need a newer
  one, so it's best published with Folio's next release.
- **Tested.** editor.test.js: finding folio on Linux's paths, and on
  Windows' (with a stand-in for the disk); the message, its buttons, Don't
  Show Again kept, and nothing waiting for an answer; the server started
  again with a new folio.path; Run, Build and a tasks.json task as tasks;
  the .vsix's files, its licence the repository's, and .vscodeignore's list.
  e2e/suite.js, in VS Code itself, on the extension as the .vsix has it, with
  folio in a folder with spaces in its name and with none: it starts, a
  broken file's problem, a problem as it's typed and its Quick Fix, Format
  Document, the outline and Go to Definition, the snippets, and with folio,
  Go to Definition into a used file, a hover and completion from folio lsp,
  Build and Run (folio build's program made, both ending with 0, and the
  output kept), a question answered in the terminal, a tasks.json task, and
  the debugger stopped at a breakpoint with its variables. CI runs it in the
  newest VS Code and in 1.75, the oldest the extension says it works in;
  it replaces in-vscode.js, which needed FOLIO_VSCODE=1 and an installed
  VS Code.

## 127. The standard library from a package

- **Why.** A package couldn't use the standard library. `use "text.folio"`
  in packages/datey/datey.folio names packages/datey/text.folio, from the
  folder of the file that uses it (§60), and folio.folio's cli_sources_of
  asked the standard library for a file by that name, which it hasn't. So
  every package carried copies of the libraries it needed, and a file in a
  folder of the program's own had the same trouble.
- **The rule, kept.** SPEC.md's 10.1 and §74 already said it: a file is
  found from the folder of the file that uses it, and if it isn't there, the
  standard library's is used. So cli_sources_of now asks the library for the
  name the `use` line gives in quotes (cli_uses_in keeps it beside the path),
  not the path it makes. A file of the same name beside the file that uses
  it still comes first: the package's own text.folio beats folio's, as the
  program's beats it for the program. A file beside the program is the
  program's alone, as it was: a package never saw it. `use the package` and
  a name with a folder in it (`use "sub/text.folio"`) are never the
  library's.
- **A copy of its own.** The parsers ask for a file by its path from the
  program's folder, so folio's text.folio goes to them as
  packages/datey/text.folio, and a package's copy is its own, as the copy it
  carried in its folder was: the same names, the same top level, and no
  change to the parsers or engines. A mistake in it says it's in
  packages/datey/text.folio, as one in folio's own text.folio says text.folio.
- **Everywhere `use` is resolved.** Every command that reads a program's
  files goes through cli_sources_of: run, build, `build --web` (whose page
  holds the copies by those names), `build --target wasm`, test, debug,
  profile, coverage, check, the shell, notebooks and the language server,
  whose definitions and hovers now read a file as a run finds it.
  machine.folio, wasm.folio and the JavaScript engines are given the files by
  name and look nothing up themselves, and the playground fetches files
  from its own site.
- **Tested.** Through folio.exe: a package in a Git repository whose main
  file uses text.folio and dates.folio, and a file of its own that uses them
  too, added with `folio add`, then used by a program that has a text.folio of
  its own: run, checked, built and run as a program of its own, built as a
  page (which runs on the JavaScript engine and holds folio's copies under
  the package's names), built as a WebAssembly module and run, and tested
  with `folio test`; a json.folio in the package beating folio's; and a name
  the library hasn't, still a mistake.

## 128. Measuring machine code before making it faster

- **Why.** machine.folio already knows what each variable holds (§32), works
  out what each function is given (§48), puts small functions in line (§63)
  and reads lists and records where the code is (§64). What's left to make
  faster had to be found by measuring, not guessed: so first the benchmarks
  cover what they didn't, and the instructions are counted where they run.
- **More benchmarks.** `npm run bench -- --big` had loops, lists, records,
  a dictionary and joining text. It now also has calls the compiler can't
  put in line (a function of four inputs that sets two variables first),
  a function with a loop of its own (Collatz's steps), records made by
  functions, text built two letters at a time, each letter of a text compared
  with others, a grid read by `item c of item r of grid`, and a dictionary
  whose keys are made as text. And a real program: folio, as bootstrap.mjs
  makes it, building compiler.folio, 2,400 lines of Folio.
- **Counting instructions.** A short run of machine code takes 10% more or
  less from one run to the next, on this machine at least. The number of
  instructions it runs is the same every time, so `node bench-count.mjs
  program.folio` counts them with valgrind's callgrind and says how many ran
  in each of the program's functions and each of the runtime's routines. It
  builds the program with machine.folio on Node.js with a heap of 4 GB, not
  64, which valgrind can't give a program, and keeps machine.folio's
  assembler, for where each function and routine starts.
- **Where the time goes.** folio building compiler.folio runs 3.58 billion
  instructions. 12% are comparing two values with `is` (rt_equal and
  rt_cmp_is), nearly always a text with a text the program wrote, as in `if
  kind of node is "call"`: about 80 instructions, through two routines and
  `repe cmpsb`, for what can't fail. 9.5% are `bit and` and the shifts
  (rt_bits, rt_bit_and, rt_shift_right), which machine.folio's put32 and the
  rest do for every byte they write: each calls rt_bits twice, about 60
  instructions, to `and` two whole numbers. 22% is the collector and making
  blocks, 6% the code kept out of the way for when something's unusual
  (`add x to xs` with a list, among it), and the rest is spread out. In the
  benchmarks: a call of `distance(i, 0, 0, i bit and 1023)` spends 58% of its
  instructions on the `bit and`; comparing letters, 54% on `is`; Collatz's
  steps, 43 instructions each, as `n / 2` makes its loop's variable a
  fraction as far as the compiler knows; and primes, its 64-bit division,
  which C's 32-bit one does in 24 ms to the 40 ms the 64-bit one takes.
- **Where it starts.** On Linux, an Intel Xeon at 2.8 GHz with 4 cores, Node
  22, machine code timed from start to finish, starting up included:

  | `npm run bench` | Machine code |
  |:--|--:|
  | a program that only starts | 2.5 ms |
  | fib(25), function calls | 3.1 ms |
  | sum 1 to 1,000,000, a loop | 2.8 ms |
  | primes up to 5,000, lists | 18 ms |
  | 200,000 records, made and read | 14 ms |
  | 1,000,000 bytes, filled and summed | 37 ms |
  | 200,000 words counted, dictionary | 14 ms |
  | recursion 10,000 deep | 3.1 ms |

  With work big enough, starting up taken off (best of two runs of five):

  | `npm run bench -- --big` | JIT | WebAssembly | Machine code |
  |:--|--:|--:|--:|
  | 2,000,000 records | 181 ms | 78 ms | 68 ms |
  | list: 3,000,000 adds, then summed by item | 172 ms | 117 ms | 55 ms |
  | list: `for each` over 3,000,000 | 205 ms | 117 ms | 53 ms |
  | list: `set item` 5,000,000 times | 285 ms | 113 ms | 28 ms |
  | dictionary: 2,000,000 counts | 246 ms | 163 ms | 104 ms |
  | 300,000 records in a list | 139 ms | 131 ms | 37 ms |
  | text: join 200,000 pieces | 70 ms | 89 ms | 20 ms |
  | calls: 4 inputs, 3,000,000 times | 375 ms | 166 ms | 44 ms |
  | calls: a loop in each, 300,000 times | 1,135 ms | 1,092 ms | 267 ms |
  | records: 2 calls make 2, 1,000,000 times | 204 ms | 65 ms | 68 ms |
  | text: 2 letters added, 1,000,000 times | 202 ms | 81 ms | 35 ms |
  | text: 2,000,000 letters, each compared | 148 ms | 579 ms | 350 ms |
  | list: a grid, item of item, 4,000,000 | 117 ms | 93 ms | 30 ms |
  | dictionary: 300,000 keys made, set, read | 424 ms | 386 ms | 175 ms |
  | folio building compiler.folio | | | 697 ms |

  | `npm run versus` | C (gcc -O2) | Rust | Folio, machine code |
  |:--|--:|--:|--:|
  | fib(32): 7 million calls | 9 ms | 13 ms | 23 ms |
  | adding 1 to 100,000,000 | 50 ms | 4 ms | 46 ms |
  | primes up to 300,000 | 29 ms | 29 ms | 45 ms |
  | 30,000,000 steps of decimal maths | 41 ms | 41 ms | 41 ms |

  And counted: fib(32), 152 million instructions; primes, 282 million;
  Collatz's steps, 1,432 million; the letters compared, 1,161 million; the
  calls of four inputs, 573 million; folio building compiler.folio, 3,579
  million. The sections after this one each say what they changed, from
  these.

## 129. A library for C: folio build --library

- **Why.** Folio could call C (§45) and Python (§120), but nothing could call
  Folio: a fast function written in it was only any use to another Folio
  program. A shared library with a C ABI is what every language can call:
  C, Python's ctypes, Rust, Go, C#, Node.
- **The file.** On Linux an ELF shared object, loaded anywhere: every
  instruction already reaches its data by a distance from itself (as workers
  rely on, §124), and the 8-byte addresses in the data, which absolute()
  lists, become R_X86_64_RELATIVE relocations. The read-only data is in a
  writable segment the linker makes read-only again once it has moved them
  (PT_GNU_RELRO). Its dynamic symbols, a SysV hash table and section headers
  are enough for dlopen, and for gcc to link C to it with `-lfast`. It wants
  the C library's `environ`, for programs it runs, and `dlopen` and `dlsym`
  for a program that uses a library, as §45's do. On Windows a DLL: an
  export directory, names in order as GetProcAddress halves them, base
  relocations for the same addresses, no entry point, and the same imports.
- **What it exports.** Each function the main file makes at its top level
  (not one of a file it uses, a library block's, or one the parser made),
  by its name: `int fib(folio_value *result, folio_value n)` in Windows x64's
  convention or System V's, as §46's callbacks take theirs. A `folio_value` is
  a value's own 8 bytes, so a number is its double. One that's only ever
  called by its name, with inputs in registers (§63), is called straight;
  any other as a call through its name's value is, its inputs checked by its
  description. C may give it anything, so the guesses (§48) know nothing of
  its inputs. Names starting with `folio_` are the library's own, and a
  program's function of such a name is a mistake when it's built.
- **The value API.** Pure functions for what needs no memory (`folio_number`,
  `folio_number_of`, `folio_yes_or_no`, `folio_nothing`, `folio_kind`) or only
  reads it (`folio_text_utf8`, `folio_bytes_data`, `folio_list_length`,
  `folio_list_numbers`, `folio_exports`); and functions shaped as the program's
  are for what makes or finds values: `folio_text`, `folio_bytes`,
  `folio_numbers`, `folio_list`, `folio_list_add`, `folio_list_item`,
  `folio_dictionary`, its `_set`, `_get` and `_keys`, `folio_record_names` and
  `_values`, `folio_call`, `folio_keep` (a value kept once more), and
  `folio_free`. `fast.h` declares them, with the
  program's own functions.
- **Whose a value is.** What the library gives C is kept from the collector
  in a list among its roots until C gives it to folio_free, which takes the
  last place it's kept (so a value given twice is freed twice). What C gives
  a function stays C's. Numbers, yes, no and nothing are kept nowhere.
- **Mistakes.** Every call is made inside a `try` of its own, so a mistake,
  or `fail with`, gives 1 and, in `*result`, `(record with message, line,
  column, file, value)`: a site in a library carries its file, line and
  column after what a program's has. What the runtime would end the process
  for (memory run out) stops the call in progress the same way. What would
  have to end it is a mistake when it's built: `stop the program`, tasks and
  workers (which outlive a call), drawing and an app's handlers, sounds, and
  callbacks from C.
- **Started once.** The first call runs what a program's start does, then
  the program's top level, inside a try; a top level that fails gives its
  mistake to every later call of the program's functions, while the value
  API still works, to read it.
- **One at a time, from any thread.** One heap and one collector, as in §62,
  so a lock: a ticket lock with a futex on Linux, as tasks take their turn,
  and an SRW lock on Windows. A call from the thread that holds it (C called
  by Folio, calling back in) goes on inside it, so it can't wait for itself.
  Running Folio from several threads at once would need what workers do: an
  image each.
- **Its own stack.** Folio allows 100,000 calls in progress, which can take
  far more than a thread C made has, so each call moves to the library's own
  256 MB stack (in the zeroed data on Linux; on Windows committed at the
  first call, the TEB's stack fields set to it while Folio runs, so Windows'
  probes and exceptions see where the stack is) and back. The collector
  looks through it alone: C's frames hold nothing it keeps.
- **What it costs.** A call of a function that gives 1 takes about 30 ns
  from C. fib(30) runs as fast as in a program of its own.
- **Tested.** A C program, built with gcc and linked to the library, calls
  it with every kind of value and the value API, gets mistakes as records
  (a `fail with`, one of the runtime's, an input of the wrong kind, and the
  value API's), calls a function Folio made, runs eight threads at once that
  lose no count, recurses 50,000 deep from a 256 KB thread stack (and is
  told 200,000 is too deep), and holds 100 values through two million
  lists' collections; a library whose top level fails; each mistake a
  library can't be built with; `folio build --library` with gcc linking C
  to what it wrote; and a Windows DLL read as Windows reads it. On Windows,
  CI runs the same C program against the DLL.

## 130. Installers

- **Why.** A release was two programs to download, rename and put on PATH by
  hand, and nothing a package manager could install. People on Windows reach
  for winget or Scoop, on Debian and Ubuntu for a .deb, in CI for an image, and
  everyone for one line to paste.
- **The release's bytes, everywhere.** Every installer takes `folio-windows.exe`
  or `folio-linux` as it is and only renames it: the .deb's `/usr/bin/folio` and
  the image's are `folio-linux` byte for byte, and winget, Scoop and the two
  scripts install the release's own download. So each is checked by the
  release's own sums and signatures (§131), and the fixed point (§25) holds for
  what people install, not only for what they download.
- **winget.** The three files of a version (`samyyy2423.Folio.yaml`, the
  installer and the en-US locale) are written to schema 1.28.0, the one
  winget-pkgs' pull request checklist asks for: `InstallerType: portable` and
  `Commands: [folio]`, so winget links the download as the command `folio`. They
  live in `packaging/winget/manifests/s/samyyy2423/Folio/<version>/`, as in
  winget-pkgs, so a submission is that folder copied in. Submitting is
  Samyak's, by hand (docs/installers.md).
- **Scoop.** `packaging/scoop/folio.json` installs straight from its raw URL on
  `main`. `checkver: github` finds the newest release, and `autoupdate` names
  its program and `SHA256SUMS.txt`, where Scoop finds the sum by the file's
  name, so Scoop's own `checkver.ps1 -Update`, or a bucket's bot, writes the
  next version.
- **One generator.** `packaging/manifests.mjs` writes both from a version, the
  Windows program's SHA-256 and a day. The files here are its output for 1.11.0
  (a test holds them to it), and the release workflow writes the next
  version's into its `manifests` artifact, so nothing is typed twice.
- **The .deb.** `packaging/debian/build-deb.sh` builds it with `dpkg-deb`
  alone: `/usr/bin/folio`, a machine-readable copyright file (Apache 2.0 with
  the NOTICE, and DejaVu's license in full, since its letters are in
  `machine.folio`), `md5sums`, and `Installed-Size` counted as
  dpkg-gencontrol counts it. folio is static, so it depends on nothing; it
  suggests git and curl (`folio add` and `folio search` run them) and OpenSSL 3
  (a program folio builds loads it for a secure connection). It refuses a file
  that isn't an x86-64 ELF, so the Windows program can't be packaged by
  mistake. Every file's time is `SOURCE_DATE_EPOCH` and the owner root, so the
  same `folio-linux` gives the same .deb, on one CPU or four.
- **The image: distroless, because folio allows it.** `folio-linux` has no
  dynamic section, so it would run on an empty image. But a program folio builds
  that says `use the library` is a dynamic ELF, which needs glibc's loader, and
  `http.folio` and `sockets.folio` load OpenSSL 3, so `static` would break `folio
  run` for them. `gcr.io/distroless/base-debian13` adds only glibc, OpenSSL, CA
  certificates and time zones: about 15 MB compressed with folio. It runs as
  distroless's nonroot user, and `--user "$(id -u):$(id -g)"` lets it write into
  the folder it's given. It has no shell, git or curl, so `folio add` and `folio
  search` don't work in it, and it can't be a CI job's container; `COPY --from`
  puts folio into an image that can. Debian 13's slim image with git, curl and
  OpenSSL is 71.7 MB compressed, about five times the size, for those two
  commands. The base is
  pinned by its digest, so it changes only when someone changes that line.
- **install.sh** is POSIX `sh`, every line inside `main`, which runs only once
  the whole script has arrived, so a download cut short does nothing. It needs
  curl or wget, and `sha256sum`, `shasum` or `openssl`. It installs nothing
  unless `folio-linux`'s SHA-256 is the one `SHA256SUMS.txt` gives, copies it in
  beside the old one and renames it over it (so a folio that's running carries
  on), and adds one `export PATH` line to `~/.profile` and the shell's own file
  (`.bashrc`, `.zshrc`, or fish's `conf.d`) if the folder isn't on PATH, and
  never twice. With curl it takes only HTTPS, redirects included.
- **install.ps1** works in Windows PowerShell 5.1 (asking for TLS 1.2, which
  5.1 may not offer by itself) and in PowerShell 7. Run through `irm | iex`, it
  runs in the caller's session, so all of it, its options too, is inside one
  script block: no variable, function, strict mode or `$ErrorActionPreference`
  of its own stays behind (its options were first a `param` block at the top,
  which `iex` set in the caller's session, and the test found it). It adds the
  folder to the user's PATH as the registry keeps it, leaving `%USERPROFILE%`
  and the like unexpanded, then sets and removes a variable through .NET so
  Windows tells new terminals PATH changed. A `folio.exe` that's running can't
  be written over, but it can be renamed out of the way, so that's what
  happens.
- **Only the sum.** Both scripts check `SHA256SUMS.txt`, which comes from the
  same place as the program, so they catch a broken download, not a changed
  release. Checking a signature would mean installing cosign first; the
  signatures are for people who want to check who made it (§131).
- **Tested.** In `npm test` (`packaging.test.js`): the manifests are what
  `manifests.mjs` writes; the .deb holds `folio-linux` as it is, as root's,
  with its fields, and comes out the same twice; and install.sh, given a
  release on the disk, installs it once its sum matches, puts it on PATH once
  however often it runs, and installs nothing when the sum is wrong or
  missing. In CI (`.github/workflows/packaging.yml`), on each change: the
  winget and Scoop manifests against their schemas, from winget-cli and Scoop
  at a fixed commit, and their URLs downloaded and summed; on Windows, `winget
  validate` and `winget install` from the manifests, `scoop install` from
  `folio.json`, and checkver and autoupdate turning a 1.10.0 manifest into the
  newest release's, with the sum from its `SHA256SUMS.txt`; install.ps1 in
  PowerShell 7 and 5.1, from GitHub, run twice, through `iex` in a session of
  its own, and refusing a wrong sum; install.sh from GitHub on Ubuntu, piped
  into `sh`, and on Alpine with BusyBox; the .deb installed, run and removed on
  the runner and on Debian 12 and 13 and Ubuntu 22.04 and 24.04; the image
  running a program, building one, and loading C's library and OpenSSL.
  shellcheck reads the shell scripts. winget 1.11, on the runner, validates the
  1.28 manifests but warns it doesn't know their schema header's address, and
  that warning alone is let through.

## 131. Signed releases, attested, with an SBOM

- **Why.** A download's SHA-256 says it arrived whole, but `SHA256SUMS.txt`
  comes from the same place as the program, so anyone who could change one
  could change the other. A company also asks what's in a program (an SBOM)
  and where it was built (provenance), and wants to check both without
  trusting a key it has to find.
- **The release stays a fixed point.** A release is still made by hand. The
  workflow signs what's there and adds files beside it, and changes no byte of
  `folio-windows.exe`, `folio-linux` or `SHA256SUMS.txt`. Before it signs
  anything, it builds folio from the tag's source with
  `packaging/release-build.sh`: Node.js makes the first folio, which builds
  itself into the same bytes and the Windows folio into the bytes Node.js makes
  of it, and the release's two programs must be exactly those. A Windows job
  then has `folio-windows.exe` build itself and the Linux folio, byte for byte.
  So GitHub's provenance, "built by this workflow from this commit", is true
  of the very bytes Samyak uploaded, even though he built them by hand.
- **It would have stopped 1.11.0.** Run on the v1.11.0 tag, the script finds
  the release's programs aren't what its source builds: they were built
  without `--include folio-debugger.folio`, so they're the fixed point of
  `folio build folio.folio --allow-read --allow-write --allow-run` (the
  release's Linux folio builds both that way, byte for byte), not of the
  documented command or `node bootstrap.mjs`, and their `folio debug` needs
  `folio-debugger.folio` in the folder. Making a release with the script
  leaves no way to forget it.
- **Sigstore, keyless.** cosign signs each file with a certificate Fulcio gives
  to this workflow, through GitHub's OIDC token, for a few minutes, and the
  signature goes into Rekor, Sigstore's public log. There's no key to keep or
  lose, and the certificate names the workflow and the tag, so a user checks
  the identity
  `https://github.com/samyyy2423/folio/.github/workflows/release.yml@refs/tags/v<version>`:
  a copy of the workflow elsewhere, or a run on a branch, has another.
- **.sig, .pem, and a bundle.** cosign 3 checks only Sigstore bundles, and
  cosign 2 the signature and certificate as files too. So each file gets
  `.sig` (base64), `.pem` (the certificate, decoded to plain PEM, which
  `openssl` reads) and `.sigstore.json`, the bundle, which has both and the
  log's proof and can be checked offline. The workflow signs with cosign
  2.6.5, which writes all three at once. Sigstore's public instance still logs
  to Rekor 1, which cosign 2 can search by a signature, so `.sig` and `.pem`
  alone work too.
- **GitHub's attestations.** `actions/attest-build-provenance` attests every
  file (SLSA provenance: the repository, commit, workflow and run), and
  `actions/attest` attests the SBOM of the two programs, so `gh attestation
  verify` checks both. They're kept by GitHub for the repository, and signed
  through Sigstore too.
- **The SBOM** is CycloneDX 1.6 JSON, written by `packaging/sbom.mjs` with no
  dependencies. It lists the release's files with SHA-256 and SHA-512, then
  what each program is built from: the files `folio.folio` is compiled with (a
  test holds the list to `bootstrap.mjs`'s), the files the standard library
  and the `--web` page are made from (from `make-stdlib.mjs`'s and
  `make-web.mjs`'s own lists), each with its sum, and DejaVu's letters in
  `machine.folio`, under Bitstream Vera's license. folio links no library, so a
  composition says the list is complete. Its time is the commit's and its
  serial number is made from what it says, so the same release gives the same
  SBOM.
- **The image** is pushed as `<version>` and `latest`, then attested (with the
  attestation pushed to the registry) and signed by its digest. A pre-release
  (`v1.12.0-rc.1`) isn't `latest`, and its .deb's version is `1.12.0~rc.1`,
  which Debian puts before `1.12.0`.
- **A dry run sends nothing anywhere.** A dry run does every step, into the
  run's artifacts, with three changes. It builds from the commit's source,
  since there's no release (on a tag, it checks that release's files). It
  signs through Sigstore's staging instance (`fulcio.sigstage.dev`,
  `rekor.sigstage.dev`, trusted from staging's TUF root, pinned by its sum),
  which is kept for trying things, so nothing reaches the log people verify
  against. And it skips the attestations, the push and the upload, since
  GitHub's attestations would be kept for the repository for all to see. The
  last job lists what it would have uploaded. A push that changes `packaging/`,
  `release.yml` or `bootstrap.mjs` does one, and so does Run workflow.
- **Least privilege.** The workflow's token has no permissions by default.
  Building and checking read the repository; only signing can get an OIDC
  token; only the image job can write packages; and only the last job, which
  uploads to the release, can write to the repository. Each job checks the
  files it's given against the sums the build job gave as an output, not as an
  artifact, so a file changed between jobs isn't signed or uploaded. Actions
  are pinned to commits, and cosign to a version the installer checks against
  Sigstore's own signature.
- **Release by hand, again.** With dry-run off, Run workflow on a release's tag
  does that release's run again, replacing what it uploaded; run anywhere else,
  it refuses, since its signatures would name a branch.
- **Not yet:** immutable releases. GitHub can lock a release's files once it's
  published, which would stop this workflow adding to it. Turning that on means
  publishing the release from the workflow, which is a change to how releases
  are made, so it's Samyak's to decide.
- **Tested.** Dry runs of the whole workflow on this branch: the build and the
  fixed point on Linux, then on Windows; the SBOM and the new manifests against
  CycloneDX's, winget's and Scoop's schemas; the .deb installed and run; every
  file signed through Sigstore's staging instance and checked both ways (the
  bundle, and the `.sig` with the `.pem`) against the workflow's identity on
  the branch; the image built and run. The release's own run (attestations,
  `gh attestation verify`, the push, the image's signature and the upload)
  runs only on a real release, so it's checked step by step against the
  actions' documentation, and its first run is the next release's. The script
  was also run on the v1.11.0 tag, where it stopped as above.
## 132. The standard library's reference

- **Why.** The standard library had grown to 49 libraries and 800 public functions, and the only way to learn
  one was to read its source: its opening comment, then the comment above each `to`, where there was one.
  353 public functions had none, ui.folio's 64 among them. A language people learn needs a reference: each
  function, what it takes, what it gives, and an example.
- **Made from the code.** There was no `folio doc`, but the language server already reads a library's own
  words: `cli_lsp_file_comment` takes a file's opening comment as what it's for, and `cli_lsp_comment_above`
  the comment lines just above a `to` as what that function does. make-docs.mjs reads the same, so the hover
  in an editor and the page on the site say the same thing, and there's one place to write it. A comment's
  lines three spaces in past the `#` are code, as every opening comment already wrote its examples.
- **Public and helpers.** VERSIONING.md keeps a library's public functions and lets its helpers change, but
  Folio has no word for which is which. Most libraries name their helpers with a prefix (`stats_`, `web_`,
  `mail_`); a few (json, xml, zip, images, charts, big, crypto) use plain names. make-docs.mjs's `HELPERS`
  says, for each library, its prefix and any helpers with plain names; everything else at its top level is
  public. A new function is public unless it's named as a helper, so it shows up in the reference, and
  docs.test.js fails until it has a comment: a function can't be added without saying what it does.
- **Examples that run.** A function's example is the first of: code in its own comment; a line of the
  opening comment that calls it; a line of its tests that does, `expect a is b` said as `say a`, a call
  inside another (`close(math's ln(2), ...)`) said on its own, and a call made as a statement followed by
  the next `expect` about what it changed. Each is cut down to what it needs: the `use` line, and the lines
  before it at its own depth that set or change a name it uses (`set q to c's queue()`, `c's push(q, 1)`),
  and those they need, and the test file's own functions it calls. Then it's run on the JavaScript engine
  with the standard library, and the first that runs, says something, and stays under 3,000,000 steps is
  shown with what it said. 301 of the 807 do. The rest need a network, a file, a C library or a window, and
  are shown as they're written; a function that no line calls is shown as its call, with the opening
  comment's `set`s of the names it takes (`set r to redis's connect(...)` for `redis's get(r, key)`).
  linux.folio and windows.folio have ui.folio's functions, and borrow its examples.
- **Writing what was missing.** Every public function now has a comment, written from its code, and each
  library whose functions had no line calling them got more lines in its opening comment: ui.folio every
  control and drawing call, in context; math.folio an opening example, which it had none of; hash, system,
  http, email, python, tasks, log, game and server the calls they left out. Two comments were wrong:
  zip.folio's deflate said how it works and not what it gives, and xml.folio's element pointed at text_of for
  the texts inside an element, where text_node, now public, makes them.
- **The pages.** docs/index.html lists the libraries in eight groups, each a card with the first sentence of
  its opening comment, and searches every function by its name, its library and what it does (`?q=` in the
  address keeps a search). A library's page has what it's for, its opening example, and each function: how
  it's called (`stats's mean(numbers)`, with the name the opening comment uses), what it does, its inputs
  with their kinds where they're typed and what they are when left out, what it gives where it says, the
  line it's written on, and its example. Code is coloured as the playground colours it. They share
  docs/site.css, the colours, type, header and footer of index.html and learn.html, and need no script but
  the search's and a filter of the function list; the site's navigation has a Docs link.
- **Tested.** docs.test.js: docs/ is what make-docs.mjs makes of the libraries as they are, with no page for
  one that's gone; every public function has a comment; and on a library made up for the test, a helper has
  no entry, inputs with kinds and defaults are read (`with on as yes or no or no`), and an example from the
  tests keeps the `set` and the `add` it needs, leaves out what it doesn't, and shows what it said.

## 133. Coverage of tests, and LCOV

- **Why.** `folio coverage` (§93) said which lines of one run of a program
  ran. What people measure is their tests, as coverage.py does under pytest:
  which lines of the code under test the tests ran, and where they're
  missing it, said in CI and shown in an editor.
- **Which engine.** Machine code, built to be watched as `folio debug` and
  `folio profile` build it, with folio-coverage.folio in the debugger's place.
  The other way was the JavaScript VM, whose debugger stops before each
  statement too, but folio, the command, has no JavaScript in it, and the
  tests would then run on another engine from `folio test`'s: one without
  C libraries, sockets, other programs or workers on cores, where a
  program's file and network use are pretend, and whose `wait` doesn't
  wait. Coverage run on a different engine from the one the tests pass on
  measures something else. In machine code the tests run as `folio test`
  runs them, each in a run of its own, on what the program ships on; the
  call before each statement is made whatever the compiler does (a watched
  build guesses nothing about calls and puts no function in line, so each
  of a function's lines is its own, §59 and §63), so
  a statement that runs is counted, in the program and every file it uses;
  and the watcher's last word comes however the run ends (§81): passing, an
  `expect` that fails, a mistake or `stop the program`. The JIT, which makes
  one JavaScript function of many lines, can't say which ran at all.
- **Adding runs up.** wants() now counts how many times each line runs.
  folio puts lines at the end of folio-coverage.folio when it builds it in
  (cli_coverage_asking), which set what it's asked for: a test's run is
  asked to keep its counts, and says them on the error output after a line
  that marks them, each file's line by line; folio takes them off what the
  test said, which folio test shows unchanged for a test that fails, and
  adds them to every other test's, by each file's path from the folder folio
  runs in, so a file two folders' tests use is one. Then it says the
  summary §93's coverage says, with folio-coverage.folio's own functions,
  which folio uses as cli_coverage: the lines run of all, each file's share
  in the order of its path, and the lines that never ran, as runs. A branch
  never taken is its lines; a function never called, its body's (its `to`
  line ran: making a function is a statement).
- **What's counted.** The files the tests use, not the test files, nor
  folio's own copies of the standard library (§74), nor packages: as
  coverage.py leaves out the standard library and site-packages, it's the
  program's own code that's measured. A program's run leaves out the same.
  A file the tests use counts once it has run once, with all its lines.
- **LCOV.** `--lcov` writes lcov.info, as geninfo writes it: for each file
  its path (SF), each line with a statement on it and how many times it ran
  (DA), and how many there are and ran (LF, LH), which Codecov, Coveralls,
  GitLab and editors' coverage views read. For a program's run the watcher
  writes it, and the program is built with --allow-write=lcov.info, so it
  isn't asked; for tests folio does, after the last.
- **The command line.** `folio coverage x.test.folio`, any number of them, or
  none for every .test.folio file here and in the folders inside, as folio
  test finds them; a file ending in .test.folio is tests, anything else a
  program, after which everything is the program's own. With tests,
  `--lcov` and the --allow flags can come after the files too, as with
  folio test. It ends with 1 if a test failed, as folio test does.
- **Limits.** A worker (§124) runs on a copy of the program, the watcher's
  counts too, which end with it: its lines aren't counted, though a task's
  are. A line run within 16 calls of the most there can be (100,000) isn't
  counted, as the debugger doesn't stop there either.
- **Tested.** Through folio.exe: a program's run, its summary on the error
  output and its lcov.info, from another folder; a file's tests, and a
  folder's, two files of tests in two folders, with a branch never taken, a
  function never called, a line run in a loop, folio's json.folio and a
  package left out, and a test that fails and says something, which folio
  coverage shows as folio test does and still counts; the same files named,
  with --lcov after them; lcov.info word for word; nothing left behind; and
  folio test as it was.

## 134. Property-based testing

A test says what one example gives. A property says what holds for every value of a sort: sorting twice is
sorting once, JSON reads back what `as json` wrote, splitting text by commas and joining it with them gives it
back. `properties.folio` tries a property on many values made at random, as Python's Hypothesis and Haskell's
QuickCheck do, and when one shows it doesn't hold, makes that value as simple as it can.

- **What it is.** `for_all(generator, property)` makes 100 values and gives each to the property, which holds
  if it gives yes or nothing (so a property can use `expect`, as a test does) and doesn't if it gives no or
  makes a mistake. `for_all_with(settings, ...)` takes `"tries"` and `"seed"`; `sample(generator, seed,
  count)` shows what a generator makes. Generators: `whole_number(low, high)`, `decimal(low, high)` (3
  decimals), `yes_or_no()`, `any_text()`, `text_of(letters)`, `one_of(values)`, `either_of(generators)`,
  `list_of(generator)` (up to 20), `dictionary_of(keys, values)` (up to 10), `mapped(generator, change)` and
  `kept(generator, test)`.
- **Small first.** The k-th try has size k, up to 100: a whole number comes from a window around 0 (or the end
  of the range nearer it) as wide as size squared, and one time in ten is an end of the range, where mistakes
  gather; a list or text is up to size long. Small values that show a mistake are found before big ones.
- **Shrinking.** A generator is three functions: make(state, size) gives a value's raw form, shrink(raw) the
  simpler raw forms to try in its place, and view(raw) the value. Shrinking works on raw forms, so a list of
  what `mapped` makes shrinks item by item, and a `kept` value only to ones its test still allows. Whole
  numbers try the target, halfway there and one step nearer; decimals the whole number too; lists and text
  empty, each half, each item left out, then each item simpler; `one_of` its first value; yes becomes no. The
  first simpler value that still shows the mistake is taken, and shrinking goes on from it, until none does or
  after 5,000 tries. `n is less than 10` over 0 to 1,000 always ends at 10; a list with a number above 5 at
  `[6]`; text with a "b" in it at `"b"`.
- **Seeds.** Values come from Park and Miller's minimal standard generator (multiplier 48271, modulus 2^31 -
  1). Each step is a whole number below 2^53, which every engine keeps exactly, so a seed makes the same
  values on the VM, the JIT, WebAssembly and in machine code; the tests pin the first 12 of seed 42. A
  mistake says its seed, and `for_all_with((dictionary where "seed" is s), ...)` makes the same values again.
  Without a seed, one is picked at random.
- **Showing values.** A value in a mistake is shown `as json`, so text is in quotes and `"1"` isn't `1`; one
  JSON can't show is shown as `say` would.
- **Tested.** properties.test.folio, on the three JS engines (folio.test.js) and in machine code (`folio test`):
  what each generator makes, its range and mistakes; the same seed giving the same values, and seed 42's
  pinned; properties that hold, with a function, a property using expect, and settings; the simplest value
  for whole numbers, decimals, lists, text and dictionaries; a mistake inside a property; and two of the
  standard library's own properties, json.folio reading what `as json` writes (numbers, decimals, yes and no,
  text with quotes, backslashes, tabs, new lines and letters beyond ASCII, in lists and dictionaries) and
  text.folio's split_by joining back.
## 135. A cookbook, examples and exercises

- **Why.** The reference (§132) says what each function does, and the Learn page teaches the language a lesson at
  a time; neither shows a whole task done end to end, nor gives a learner problems to solve. Those are what a
  person new to a language looks for next, and what keeps documentation honest is running it.
- **The cookbook** (`docs/cookbook/`) is made by `make-guides.mjs` from `guides/cookbook/*.md`: a `# title`, prose,
  ` ```folio ` blocks, and ` ```output ` blocks after the ones that can run here, which say what the code says. Ten
  recipes: CSV, JSON, a web API, a web API with a database, the command line, statistics and a chart, dates,
  every core, tests, and finding and changing text. A block that needs a site, a server, a database or a window
  has no output block, and is held to having no problem `folio check` finds instead.
- **The examples** (`docs/examples.html`) are `guides/examples/*.folio`, whole programs whose opening comment's
  first line is the title and the rest what they are: the towers of Hanoi, the game of life, word counts, a
  bank account (a kind), Caesar's cipher, Roman numerals both ways, the Mandelbrot set in text, and Koch's
  snowflake drawn by the turtle. Each links to the playground with its code in the address (`#code=`, as the
  Share button makes it).
- **The exercises** (`exercises/`) are twenty practice exercises in Exercism's track format (a `config.json`;
  for each, `.docs/instructions.md`, `.meta/config.json`, `.meta/example.folio`, the starting file and its
  tests), written for Folio from Exercism's open problem descriptions: hello-world, two-fer, leap, raindrops,
  bob, isogram, pangram, word-count, anagram, acronym, hamming, rna-transcription, difference-of-squares,
  collatz-conjecture, armstrong-numbers, reverse-string, matching-brackets, clock, sieve and luhn. grains is
  left out: its 2^64 is past what 15 digits keep. The starting file has each function's first line and a
  `fail with` saying what to do, so `folio test` fails every test until it's written.
- **The site.** The pages share the reference's frame (`page()` in make-docs.mjs), and the navigation of every
  page under docs/ now has Cookbook and Examples.
- **Tested** (guides.test.js): the pages are what make-guides.mjs makes; every recipe block with an output says
  exactly that on the JavaScript engine (files in memory), and every other has no problems; every example runs,
  says something, has no problems, and its link is its code; every exercise is listed once in config.json with
  a uuid of its own, its tests (113 in all) pass with its example and every one fails with its starting file.
## 136. Folio from Python: the foliolang package

- **Why.** Python is where most people who want speed are: a loop that's
  slow in Python is fast in Folio's machine code (§129), if Python can call
  it. And a package is how Python gets anything: `pip install`.
- **Its name.** `folio` on PyPI is an unrelated project (tokens kept in
  MongoDB) whose module is also called `folio`, so the package is
  `foliolang`, and so is its module, everywhere: two packages giving Python
  one module name would break each other. Code says `import foliolang as
  folio`, then `folio.load(...)`. The command it installs is still `folio`.
- **Wheels with folio in them.** A wheel for Windows (`win_amd64`) and one
  for Linux (`manylinux_2_17_x86_64`) each carry `folio` itself, built from
  the source by `bootstrap.mjs`, as `foliolang/bin/folio(.exe)`, so `pip
  install` is all there is. Linux's folio calls the kernel itself and links
  nothing, so it runs on any distribution, and a library it builds needs
  only libc.so.6. The wheels are `py3-none`: no Python extension, so one
  wheel serves every Python from 3.10 on. hatchling builds them, its build
  hook putting folio in and tagging the wheel when FOLIOLANG_BINARY and
  FOLIOLANG_PLATFORM say which; the sdist has no folio, and finds one through
  FOLIOLANG_FOLIO or PATH.
- **Calling a library: ctypes alone.** `folio.load("fast.folio")` builds the
  file with `folio build --library --into <cache>` and loads it with
  ctypes; `folio.compile(source)` does the same for code in a string. Each
  function the library exports (`folio_exports` lists them, with their
  inputs' names) is an attribute, whose ctypes signature is `int(uint64*,
  uint64...)`. No compiled extension means nothing to build per Python
  version, and nothing for pip to compile.
- **Cached by what it was built from.** A library is kept in
  `~/.cache/foliolang` (or `%LOCALAPPDATA%\foliolang\Cache`, or
  `FOLIOLANG_CACHE`), in a folder named by a SHA-256 of foliolang's version,
  the folio that builds it, its --allow flags, the file's name and text, and
  the text of each file it `use`s (by a name, or as a package), found the
  way folio finds them. Changing any of them builds it again; changing
  nothing loads the one built before. Built in a folder of its own, then
  moved into place, so a library half written is never loaded; loaded once
  for each process.
- **Values both ways.** int and float are numbers, whole ones coming back
  as int; an int past 2^53, which a double can't hold, is an OverflowError
  rather than a number changed silently. str is text in UTF-8, bool yes or
  no, None nothing, bytes bytes, list and tuple a list, dict a dictionary.
  A record comes back as a read-only `Record`, read as `p.x` or `p["x"]`;
  as C can't make Folio's records (a field is found by its name being one
  of the program's own texts), one given back is a dictionary. Anything
  else, a function above all, is a `Value`, kept with `folio_keep` until
  Python lets go of it, which can be given back, and called with
  `folio_call`. A list of numbers goes across at once, through
  `folio_numbers` and `folio_list_numbers` and an array of doubles, not an
  item at a time; and the kind of a value is worked out in Python from its
  bits, as a call to `folio_kind` would cost more than the rest.
- **Mistakes as exceptions.** What a call fails with is raised as
  `FolioError`, with the message, line, column and file from the record
  (§129) and what `fail with` gave as `value`; code that can't be built is
  `BuildError`, with folio's own report. A wrong number of inputs is
  Python's TypeError, before Folio is called.
- **Running a program.** `folio.run(source)` writes the code to a folder of
  its own and runs `folio run` there: what it said, its error output and
  the number it ended with, as a RunResult, with arguments, --allow flags,
  input and a folder to run in.
- **What it gave.** On CI's runners, called from Python: fib(30) 10 times
  as fast as Python's own on Linux and 13 on Windows, a Mandelbrot set 16
  to 18 times, a sieve of primes 3.5 to 5.7 times (benchmarks/RESULTS.md).
  A call costs 1.5 to 1.7 µs, most of it ctypes' own, and a value given to
  Folio is copied, so a sum over a list Python already has is faster in
  Python, which the benchmark shows too.
- **Tested** with pytest, against a wheel built as the publishing workflow
  builds it and installed: Linux with Python 3.10 and 3.14, and Windows. Each
  kind of value both ways, records and functions, every kind of mistake
  and where it was, a library's top level failing, deep recursion and
  eight threads at once, the cache (built once, again when a file it uses
  changes, nothing written beside the source), folio.run with arguments,
  input and flags, and the folio command. CI runs the benchmark too.

## 137. Publishing foliolang, with no token

- **Why.** A package is only `pip install`-able once it's on PyPI, and
  what uploads it must be trusted with the project. A token kept in the
  repository's secrets works for whoever can read or misuse it; PyPI's
  trusted publishing (OpenID Connect) has no secret at all: GitHub gives
  the workflow a token, minutes long, saying which repository, workflow
  and environment it is, and PyPI takes uploads only from the one it was
  told to trust. Nothing is published yet: Samyak adds the publisher on
  pypi.org (docs/python-package.md says how) when he wants it to be.
- **python-publish.yml.** Runs for a published release, or by hand. It
  makes folio for Linux and for Windows from the source on one Linux
  runner (bootstrap.mjs makes either), builds the sdist and the two
  wheels as python.yml builds one (§136), checks them with `twine check
  --strict`, installs the Linux wheel and runs its tests, and keeps the
  three files as the run's artifact. Only then, in a job of its own with
  `id-token: write` and the `pypi` environment, does
  pypa/gh-action-pypi-publish upload them; the building job can't. The
  environment is where Samyak can require his approval of each upload and
  keep it to `main` and `v*` tags.
- **A dry run.** By hand with `publish` unticked, it builds, tests and
  keeps everything, and uploads nothing; and a pull request that changes
  `python/` or the workflow gets that dry run as a check, so a release
  never finds out first that the wheels don't build. Only a release, or
  `publish` ticked by hand, reaches the upload.
- **Versions.** foliolang's version is Folio's, in `__init__.py`. A release
  whose tag isn't `v` and that version stops before building anything, as
  PyPI never takes a version twice and a wheel of the wrong version would
  be there for good.
- **Tested.** Its building job runs, as a dry run, on the pull request that
  added it: the three files built, checked by twine, the Linux wheel's
  tests passed, and the artifact kept. The upload itself has never run,
  against PyPI or TestPyPI.
## 138. Bits where the code is

- **Why.** `x bit and 255`, `shift u right by 8` and the rest went to the
  runtime, which checked each side with rt_bits: about 60 instructions, two
  calls in, to `and` two whole numbers. machine.folio does it for every byte
  it writes (put32, put64), so folio building compiler.folio spent 9.5% of its
  instructions there, and a call of `distance(i, 0, 0, i bit and 1023)`
  58% (§128).
- **What it does.** When both sides are whole numbers from 0 to 2^53 - 1,
  it's done right where it is: each side becomes a 64-bit whole number,
  unless it's known to be one already (then the conversion alone, as anything
  past 2^63, an infinity or NaN comes out below 0); one test that neither is
  below 0 nor past 2^53 - 1; the `and`, `or`, `xor` or shift; and the
  answer back as a number. A whole number the program wrote on the right, as
  in `bit and 255` or `right by 8`, goes in the instruction. A shift left
  checks that no bit was lost and the answer is still below 2^53; a shift
  past 63 to the right, or 52 to the left, goes the runtime's way. Anything
  else (a number whole only to 15 digits, below 0, past 2^53 - 1, text,
  nothing) goes to the runtime, in the code kept out of the way, with both
  sides as they were, so what it gives and every mistake it makes are what
  they were.
- **What's known after.** A bit operation gives a whole number, so `set u
  to shift u right by 8` keeps `u` whole, and a loop or a function's inputs
  know it (§32, §48). A shift left gives one only if what's shifted is known
  to be whole: see below.
- **A mistake found on the way.** vm.js shifts left by multiplying the
  number as it is, which bits only checks: `shift (0.1 * 3 * 10) left by 51`
  is 6755399441055745 on every engine, as 0.1 * 3 * 10 is 3.0000000000000004.
  Machine code shifted the whole number rounding made of it, and said
  6755399441055744. rt_shift_left now multiplies the number as it is by 2^n,
  as the engines do, and says it's too big as they do.
- **What it gave.** Counted (§128): the calls of four inputs, 573 million
  instructions to 231 million; folio building compiler.folio, 3,579 million to
  3,259 million. Timed: the calls of four inputs, 44 ms to 23; a million
  bytes filled and summed, 37 ms to 27; folio building compiler.folio, 712 ms
  to 677 (the best of ten, each folio run in turn with the other).
- **Tested.** Every kind of value on each side of `bit and`, `bit or` and
  `bit xor` (0, -0, 2^53 - 1, 2^53, -1, 1.5, numbers whole to 15 digits,
  infinities, text, nothing, yes, a list, hex), each shifted both ways by
  every distance up to 1,024 and by ones that are wrong, the same with
  whole numbers written on the right, in functions, loops and sums, and the
  mistakes with their lines and calls: in machine code against the
  JavaScript engine, and on the VM, the JIT and WebAssembly, which agree.

## 139. Text in the WebAssembly module

The second of `folio.wasm`'s four stages (§125) is the runtime in WebAssembly,
so a module imports nothing from `vm.js`. It goes in parts, and text is the
first, as nearly everything after it (a mistake's words, a dictionary's keys,
the built-ins) needs it. A module made 68 imports; it makes 65 now, and text,
joining it, comparing it and showing a number in it no longer leave the module.

- **Written once.** wasm.js and wasm.folio must make the same bytes, so each
  piece of runtime would be written twice: as JavaScript calls, and as text in
  Folio. [`wasm-runtime.js`](wasm-runtime.js) holds the new runtime once, as
  WebAssembly's own instructions, a function at a time, with named inputs and
  locals. wasm.js assembles it; `make-wasm-runtime.mjs` writes it into
  `wasm-runtime.folio`, which wasm.folio reads and assembles by the same rules.
  Both make its functions before the rest of the runtime, so the rest can call
  them, and write their code last, so they can call the rest. A test checks
  `wasm-runtime.folio` is up to date, and the corpus checks the two agree.
- **Text as UTF-16, in the module.** A text was a struct holding a JavaScript
  string. It is now a view of the first so many units of a buffer, in UTF-16
  like JavaScript's strings, so its length, its order (unit by unit) and what
  JSON makes of half an emoji stay what the VM's are. Text that ends where
  its buffer's units in use end gets more added in place, the buffer growing
  by half when it's full; units past those in use never change, so every
  text that was a view of the buffer stays as it was. So joining text in a
  loop takes as long as the text is, as JavaScript's strings do, and text past
  JavaScript's longest (536,870,888 units) hands the program to the VM, which
  says what it says.
- **The program's own text** is in the module's data, each text's units made
  into an array by `array.new_data` when the program starts, and not asked of
  JavaScript one by one.
- **JavaScript's text, while it's needed.** Dictionaries are still Maps, and
  `say` and the built-ins are still JavaScript's, so text still crosses. It
  crosses through a memory of the module's own, 32,768 units at a time, which
  is where WASI will want text too; a text keeps the JavaScript string it was
  made into, and text JavaScript made gets units only when the module needs
  them. wasm.folio reads the units of a program's text from its letters, and
  half of an emoji on its own, which its UTF-8 can't hold, from `as json`.
- **Numbers as text, as the VM shows them.** `"n is " + n` is joined in the
  module, so a number becomes text there: to 15 significant digits, laid out
  as JavaScript lays numbers out. It is machine code's way (§25), redone in
  WebAssembly: a whole number below 2^53 by its digits; anything else below
  that by its first 16 digits, from its whole part and from its fraction times
  2^120 (held in four 30-bit pieces, and below 2^-68 as big whole numbers),
  rounded half up as `toPrecision` rounds, and less the zeros at the end;
  whole numbers from 2^53 by the fewest digits that read back as them
  (Steele and White's way, with big whole numbers); and numbers below
  2^-1021, where 15 digits no longer read back as one double each, by the
  double they read back as, and then its fewest digits.
- **Tested.** 9 million numbers (any bits at all, a few digits somewhere, the
  smallest numbers, big whole numbers) against JavaScript's own, every one the
  same, and a test runs 120,000 of them each time. Text joined in place, the
  text it began kept as it was; text compared, with emoji and half of one; a
  module run with no imports at all showing numbers and joining text. And
  every program the engines are tested with, made by wasm.js and wasm.folio
  byte for byte, and run against the VM.
- **What it gave, and cost.** On the WebAssembly engine, comparing text 500,000
  times went from 117 ms to 10 (it called JavaScript each time); joining
  200,000 letters in a loop from 10.7 ms to 9.9, and 100,000 numbers from 20
  to 15.6. Saying 20,000 lines went from 12 ms to 16, as the text now crosses
  to JavaScript to be said. A module for `say 1` grew from 7.8 KB to 12.4 KB,
  and making one in wasm.js takes about a millisecond longer, the shared
  runtime's code assembled and encoded once and kept.

## 140. The folio command, for the first hour and after

Folio could do a great deal by the time a person had written something, and
little to help them start, or to look after what they'd written. Seven commands
fill that in, each in folio.folio, run in the tests as folio.exe itself.

- **`folio new`.** A folder named for the project, with what each kind needs:
  an app's `main.folio`, what it does in `<name>.folio` and tests of that in
  `<name>.test.folio`, so the tests don't run the program; a web server's
  answers kept from `server.folio`, so its tests ask them without a server; a
  package for other programs; a library for C and Python. Each has a README, a
  `.gitignore` and a GitHub workflow that installs folio with the installer and
  runs `folio test`. Its tests pass as it's made: the test makes each kind, runs
  its tests, and runs the app. A name is a letter, then letters, digits and
  `_`, and not `main`, as it names files and a package.
- **`folio explain`.** A file's first mistake, as `folio check` says it (a
  mistake in reading it, or one that will fail), or a mistake's words pasted
  from a run, matched against 32 mistakes folio knows: what each means, why it
  happens and how to put it right, with code that makes it and the same code
  put right. A test checks every example put right reads as Folio, which found
  two of them that didn't.
- **`folio upgrade`.** The newest release, from GitHub's API, put in place of
  the folio on PATH: downloaded with curl, its SHA-256 (from the system's own
  `certutil` or `sha256sum`, as hashing 30 MB in Folio would be slow) checked
  against the release's `SHA256SUMS.txt`, and only then moved in. On Windows a
  running program can't be written over, but it can be moved aside, so the old
  one is `folio.exe.old` until the next upgrade. A folio from Scoop, winget, pip
  or the .deb is left to that package manager, and the command for it said.
  `FOLIO_RELEASES` names a folder or address laid out as a release is, which is
  how the test runs it: an old release, a download whose sum is wrong, and a
  new one.
- **`folio doc`.** What `make-docs.mjs` does for the standard library, for any
  program: a page for each file, with its opening comment and, for each
  function and kind at its top level, the line that makes it and the comment
  above it; lines indented in a comment are code. More than one file gets an
  index.
- **`folio bench`.** A `.bench.folio` file is built with a driver at its end, as
  `folio test` does with tests: each `bench_` function is called as many times
  as take 50 ms or more (doubling from one), then that many again five times
  over; it says the mean time a call, how far the five spread, and calls a
  second. `the clock` counts milliseconds, so 50 ms keeps its error under 2%.
- **`folio watch`.** Any other command, run again whenever a `.folio` file here
  or inside changes (by its text, read four times a second, as a file's time of
  change needs a library). For that, `cli_main` became `cli_dispatch`, which
  takes the command and gives back the number to end with, where it had
  stopped the program itself.
- **`folio publish`.** What the package index's README says to do by hand: the
  package's main file found at the top of the folder, its origin on GitHub
  (whose main file anyone must be able to read), a line about it from its
  opening comment or `--about`, its tests run, and the index changed and
  proposed as a pull request with GitHub's `gh`, from a fork. The index is
  written as its repository lays it out, which a test holds to
  `JSON.stringify(index, null, 2)`. Without gh it says how to do it in the
  browser; `--dry-run` only says what it would add.

## 141. MCP servers, PDF files and spreadsheets

Three libraries for work people do with programs now: tools for AI apps, and
the two file formats offices send each other. Each is Folio alone, on every
engine, with its tests in `tools/` run on all three. (Markdown and HTML
templates, also asked for, were packages in the index already: `markdown` and
`template`.)

- **mcp.folio.** A server is a name, a version, and the tools, resources and
  prompts it offers. `serve()` reads the app's JSON-RPC messages a line at a
  time with `ask for 1 bytes` (as `folio lsp` reads its editor's), since `ask`
  shows its question and repeats what's piped to it, which would put text in
  the app's replies; `answer()` answers one message, so the tests run on the
  JavaScript engines too. What a tool needs is said in words (`"number"`,
  `"text or nothing: a city"`) and made into the JSON Schema the protocol
  wants, or given as one. It answers `initialize` with the protocol version
  the app asked for if it speaks it (2024-11-05, 2025-03-26, 2025-06-18), and
  its newest if not; a tool's mistake is its result with `isError`, as the
  protocol says, so the model sees it, and the server goes on. A test builds a
  server with folio.exe and talks to it through its input, with `\r\n` line
  ends as Windows pipes have them; built, it is a program of 156 KB.
- **pdf.folio.** PDF 1.4, written as text: each object, then the table of where
  each starts, which a test reads back to check every offset. Text is in the
  14 fonts every reader has, in their WinAnsi encoding, so nothing is embedded
  and a page of text is a few kilobytes; letters outside it are `?`. Text wraps
  by Adobe's own widths for Helvetica and Times (Courier's are all 600), so
  `paragraph()` breaks lines where a reader will draw them: the test checks
  each line fits, and that the next word wouldn't have. A report made with it
  opens in pypdf and PyMuPDF, and draws as it should.
- **xlsx.folio.** A workbook is a zip of XML, so it is `zip.folio` and
  `xml.folio`: four small files and one per sheet, each cell a number, text
  (written inline, so there's no shared table to keep), yes or no. Reading
  takes what Excel writes too: shared strings, rich text in runs, cells and
  rows left out, a formula's last value, a sheet found by its relationship
  rather than its place. openpyxl reads what it writes back exactly.

## 142. Folio from JavaScript: foliolang on npm

Python could call Folio (§136); JavaScript, where Folio's engine was born,
couldn't, but for copying `folio.js` out of the repository. `npm/` is the
package.

- **What it is.** The engine as the VS Code extension carries it (the same
  `ENGINE` list, so the two can't differ), the standard library's files in
  `lib/`, where `use "json.folio"` finds them after the program's own, and
  `foliolang.js`: `run` (what a program said, a line each, or a `FolioError`),
  `load` (a program's top level by name, its functions JavaScript ones, as
  `folio.js`'s `load` gives Folio's compiler to the tests), `runFile` and
  `loadFile` (with `use` finding files beside them), `check`, `format` and
  `test`. Programs get the computer's own clock and randomness, as a program
  `folio build` makes does, and a disk only when they're given one.
- **Its command.** `foliolang run`, `check`, `test` and `tidy`, on the JIT,
  answering `ask` from the input a line at a time (read as it comes, with
  `readSync`), and ending with the number the program ended with.
- **Published as releases are.** `make-package.mjs` stamps Folio's version on
  it; the npm workflow runs its tests and publishes it with npm's provenance
  when a release is published. The name has to be made on npm once, by hand,
  as PyPI's was (docs/npm-package.md). `npm pack` makes it 423 KB, 72 files.
- **Tested** as it would be installed: the package made in a folder of its
  own, its files checked against what the engine imports, every engine run
  through it, a function loaded and called with lists and dictionaries, and
  its command run, checked, tested and tidied with.

## 143. What a function needs: where

A function could check its inputs only with an `if` and a `fail with` at its
top, worded each time. `to withdraw with amount where amount is greater than
0` says it in the function's first line, and the mistake words itself.

- **Where it goes.** At first it was a statement, `needs amount is greater
  than 0`. But a statement that starts with a name and a value is a call
  (`greet "Sam"`), so a program with a function called `needs` would have
  changed meaning, and VERSIONING.md promises Folio never reserves a new word in
  1.x and that a line that worked before means what it meant. After a
  function's inputs (and its `gives`) nothing could be written before, and
  `where` is a word already (`dictionary where`), so editors color it already.
- **Only the parsers, again** (§66, §95). Both parsers read the condition and
  put an `if not ...` with a `fail with` at the start of the body, so the VM,
  the JIT, WebAssembly, machine code, the checker and the formatter have
  nothing new; compiler.folio makes the JIT's JavaScript exactly, as before.
  The mistake is the program's own, so a `try` catches it, and its trail says
  where the call was.
- **What it says.** The condition as written, made again from its tokens with
  a space between each (none after `(`, nor before `)`, a comma or `'s`), the
  same in both parsers; and when the condition compares a name with something,
  `, but amount is -5`, the name's value as `+` joins it.
- **Tested** on every engine, compiler.folio and wasm.folio, and in machine code:
  a check that holds and one that fails, with `and`, brackets, `length of`,
  inputs with types and `or`, a kind's function and `self's`, a `try`, and a
  name and a function called `where` and `needs` that are as they were.

## 144. folio.wasm, and the playground compiling with it

Stages 3 and 4 of §125's four, done before the end of stage 2 (§139), as
they could be: the compiler is Folio's own in the browser now, while the
modules it makes still take most of their runtime from vm.js until stage 2
is done.

- **folio.wasm.** `folio-wasm.folio` is the compiler as a program: compiler.folio
  reads the program it's given (its arguments are the program's text, then
  each file's name and text), wasm.folio makes the module, and it says the
  module's bytes on one line, with what running it needs in its section
  "folio", as `folio build --target wasm` writes it; or `mistake` and the
  mistake as JSON, which `folioWasmCompiler` in folio.js throws as the
  FolioError wasm.js would.
- **Made by itself.** `make-folio-wasm.mjs` has wasm.js make it once; that
  module, run, makes `folio-wasm.folio` again, and what it makes is folio.wasm;
  and folio.wasm, run, must make itself into its own bytes, or nothing is
  written. It is 1,556,161 bytes, 400 KB of them the positions and messages
  its section keeps for its own mistakes. A test makes it again and checks the
  file is what it makes, as webpage.folio's does.
- **The same compiler.** On every playground example, hand-written case, typed
  program and 800 programs the generators make, broken or not, folio.wasm makes
  wasm.js's bytes exactly and stops at the same mistakes, and what it makes
  runs as the VM runs it. A program takes 17 ms to compile on average in
  Node, as each call runs folio.wasm's program again, and makes the runtime
  every module has again with it.
- **The playground.** The page compiles folio.wasm once, when it loads, and
  sends the compiled module with each run, so the code the browser makes of it
  is kept between runs (each run has a worker of its own). On the WebAssembly
  engine, the worker compiles the program with it, and says so: "Ran in 37 ms
  on WebAssembly, compiled by folio.wasm". The first run after the page loads
  takes 350 ms while the browser compiles folio.wasm's code; the runs after it,
  40 to 60. Until folio.wasm is there, or where it can't be fetched (a page
  `folio build --web` made, which has no folio.wasm beside it), the worker
  compiles with wasm.js, as it would for a mistake in folio.wasm itself that
  isn't the program's.
- **What's left.** The modules folio.wasm makes import their checks, mistakes,
  dictionaries and built-ins from vm.js (§139 has the parts), so the page still
  carries the engine's JavaScript; when stage 2 is done, it's a loader, and
  folio.wasm and what it makes can run with no JavaScript at all.

## 145. Web pages made in Folio: page.folio

A full real web page, both ways: a program in the browser makes its own page and is told what's done on
it; and a site, served by a Folio server, makes its pages with the same library (`apps/recipes`).

- **A part at a time.** `tools/page.folio` builds a page as a list of HTML parts: headings, paragraphs,
  links, pictures, lists, tables, boxes (`start(p, "card")` ... `finish(p)`), text boxes, text areas,
  checkboxes, dropdowns and buttons, in a look of Folio's own, with `style()` for CSS of the page's own.
  Every text is escaped; `html()` is the one way to put HTML in as it's written. Anything left open is
  closed when the page is made.
- **Shown by writing a file.** `show()` writes the page to `"<page>"`. The playground's worker, and so a page
  `folio build --web` makes, keeps no file of that name: it sends the page to the page. So showing a page
  needed no new statement, and no word reserved (VERSIONING.md). Elsewhere, `html_of()` is the HTML, to
  write to a file or for `server.folio` to send.
- **One new event.** `when the page is used with what` gives one value, a dictionary: its "type" ("click",
  "change", or "enter" for Enter in a text box), the "name" of what was used (its `data-folio`, which every
  control page.folio makes has), its "value", and "values", every field on the page by name. With every
  field in each event, the program never asks the page anything: it keeps what it knows, and shows the page
  again. It's the ninth of vm.js's EVENTS and of compiler.folio's event_names; machine.folio's app_timer moved
  to 9, after it.
- **In a sandboxed frame.** The page is shown in an iframe with `sandbox="allow-scripts allow-popups
  allow-popups-to-escape-sandbox"` and no `allow-same-origin`, so it has an origin of its own: the page a
  shared link's program makes can't read what the site keeps, or reach the playground. A script put before
  the program's HTML is the only way between them: it posts what was done to the page, which takes only a
  message from the frame, of only text and yes or no, and sends it to the worker as the event's dictionary.
- **Shown again in place.** A run's first page loads into the frame; each page after it goes to the frame's
  script, which puts its head and body in place of the ones before, and the focus back on the control of the
  same name, with its selection, so a page shown again on each Enter keeps the typing where it was. Chrome
  sends a change after Enter, of the same value; the script drops it, so Enter is one event.
- **As a page of its own.** In a page `folio build --web` makes, the page is the whole window. An app that only
  waits for its page has no drawing, so the drawing isn't shown, and the status says "use the page".
- **The playground finds the standard library.** A file a program uses that isn't beside the page is looked
  for in `tools/`, so `use "page.folio"`, and the other libraries that need nothing of the system, work there.
- **Checked.** page.test.folio's 5 tests, on all three engines. folio.test.js runs a to-do app on each engine,
  sends it the dictionaries the frame sends, and checks what it said and the page it showed after. In the
  browser, on WebAssembly compiled by folio.wasm: the to-do app typed into, with Enter and with Add; and the
  frame's script's messages for a text box, a dropdown, a checkbox ticked through its label, a click inside a
  named element, and Enter.
- **What it isn't.** Programs built for Windows or Linux have no page: `when the page is used` never happens
  there, and `show()` writes a file called `<page>`, a name Windows doesn't allow. They use `html_of()`.
- **A site's pages.** A page a server sends is used by the browser, not by the program: its links go to the
  site's other pages, and its forms send their fields. So page.folio has `menu()` and `list_link()`, links that
  open where the page is (`link()` opens a tab of its own, as a page in the playground's frame has nowhere of
  its own to go), and `start_form()` to `end_form()` with `submit()`, a POST by default or a GET for a search.
  Each `end_...()` checks that what it ends is what was started last, and says which is still open if not.
- **apps/recipes.** A recipe box, a site of six kinds of page: home, every recipe or those a search finds,
  each recipe, a form to add one, about, and a 404, each with the same menu and footer; and the recipes as
  JSON. `kitchen.folio` is what it does, with no network: SQLite (every value a parameter, a search's `%` and
  `_` only themselves), the checks on a new recipe, the pages, and `answer_with()`, which machine.test.js
  runs as `guestbook` is run: its 4 tests (`kitchen.test.folio`) with folio.exe, then the site built and used
  over HTTP. A refused recipe is shown again, 400, with what was wrong and what was written; an added one is
  a 303 to its own page. A browser ends a text area's lines with \r\n; `lines_of()` takes them as they come.

## 146. Mistakes in the WebAssembly module

The second of stage 2's parts (§139): a mistake the program makes itself is thrown and caught in the module,
not by JavaScript. A module imports 62 functions, not 65: `fail`, `unset` and `failWith` are gone.

- **A tag of the module's own.** A WebAssembly exception tag, `mistake`, is thrown with three things: what `if it
  fails with` gets (a `fail with`'s value, or the mistake's words as text), 1 if that's a `fail with`'s value, and
  the mistake's position. `fail with x` throws it; so does a name with no value yet, and a name nothing sets.
  wasm-binary.js and wasm.folio write tags (section 13), `throw` and `catch`, the same bytes.
- **Caught in the module.** A `try` catches the tag and gives its value to `if it fails with`, restoring the call
  depth, with no call out. The checks still in vm.js (an item that isn't there, a sum of text and a list...)
  throw JavaScript's FolioError, which the same `try` catches as before, with `catch_all`, JavaScript saying
  whether it's one to catch: so `tryStart`, `caught` and `caughtValue` stay until those checks move in too. A
  worker's mistake is caught the same two ways, and `workerFailed` is given its value.
- **Seen by JavaScript only when nothing caught it.** The tag is exported, and a mistake that leaves `main`, or an
  app's handler, uncaught becomes the FolioError the other engines make there: its words (or a `fail with`'s value,
  shown, and kept as WebAssembly holds it), its position, and its trail, read from the module's own record of
  the calls in progress, which nothing has undone.
- **Words made when they're needed.** A variable with no value yet says `'x' has no value yet (give it one with
  'set x to ...')`. Making those words for every variable when a program starts made folio.wasm 13% bigger,
  and slower to start. So each check keeps only where the variable's name is in the program's data (which every
  module now has, empty or not) and how long it is, and `noValueYet`, in the shared runtime, makes the name and
  the words around it (three texts the module is made with: `text` in wasm-runtime.js) only when one is thrown.
  folio.wasm is 1,606,736 bytes, 3% more than it was; a module for `say 1`, 12,658 bytes, 223 more.
- **What it gave.** On the WebAssembly engine, catching 100,000 `fail with`s in a loop went from 769 ms to 30, and
  100,000 names with no value yet from 819 ms to 37: no JavaScript error, with its stack, is made for them.
- **Checked.** A module run with every import but `say`, `tryStart`, `grant` and `refill` failing the test when
  called: it catches a `fail with` and a name with no value yet, and the `fail with` it doesn't catch reaches
  JavaScript as the module's exception, with its value. Mistakes, their values and trails, on the VM and on
  WebAssembly, the same; and every program the engines are tested with, made by wasm.js, wasm.folio and
  folio.wasm byte for byte.

## 147. Dictionaries in the WebAssembly module

The third of stage 2's parts (§139): a dictionary lives in the module, not in a JavaScript Map. A module imports
55 functions, not 62: the six that read, changed and searched a Map are gone, and so is `jsText`, which made a
key's JavaScript string.

- **What one is.** Its keys and its values in two lists, in the order the keys were first set (the order a Map
  keeps, which `say`, `keys of` and JSON show), how many places of the lists are used, how many keys it has,
  and its slots: for each, the place of a key plus 1, or 0, as many as a power of 2 at least twice the places
  used, found from the key's hash and the slots after it. A key taken out leaves nothing in its place, which
  finding passes over and which no key matches, so taking one out and putting it back puts it last, as a Map
  does; when the places run out, the dictionary is made again without them. It's type 9, which was the
  struct that held a Map, so no other type's number moved.
- **Keys as a Map has them.** Text, by its units; or a number, as vm.js's canon has it: a whole number, or one
  that isn't finite, as it is, any other to 15 digits, so `item 0.3 of d` finds what `set item 0.1 + 0.2 of d`
  put; -0 is 0, and NaN is NaN. A whole number an i31 holds is always kept as one, so it hashes by its value
  and two such keys are the same key exactly when they're the same i31; other numbers hash by their bits, and
  text by its units (FNV-1a). Written once, in wasm-runtime.js, for both back ends.
- **Mistakes still worded by JavaScript.** A key that isn't there, a key that isn't text or a number, `remove`
  from something that isn't a dictionary: the module does the work and calls out only to fail, giving
  JavaScript a copy of the dictionary to word the mistake from (`did you mean` and all). So does `is`
  between two dictionaries, and the built-ins, which see a dictionary as a Map made from it, as they saw
  a copy before; a Map they give back is made into a dictionary of the module's.
- **What it gave, and cost.** On the WebAssembly engine, setting and reading 100,000 number keys went from
  35.7 ms to 18.6, and 50,000 text keys from 74.7 ms to 33.9; counting 200,000 words, each one found three
  times, from 41.2 ms to 43.0. folio.wasm is 1,624,784 bytes, 1% more; a module for `say 1`, 13,695 bytes,
  as every module now has the dictionary's code.
- **Checked.** A module run with every import but `say`, `grant` and `refill` failing the test: it makes a
  dictionary, sets 300 text keys, takes 290 out (making it again on the way), sets a number key that canon
  rounds and -0, and finds them. Every program the engines are tested with, made by wasm.js, wasm.folio and
  folio.wasm byte for byte, and saying what the VM says.

## 148. The website, in Next.js and GSAP

Folio's site is a Next.js app in `site/`, exported as static pages for GitHub Pages under /folio, with GSAP for
its motion. It takes everything it shows from the rest of the repository, so nothing is written twice.

- **What it takes, and from where.** `site/scripts/sync.mjs`, run before each build, copies the engine into
  `public/` (the modules make-web.mjs lists, folio.wasm, the Folio files a program may `use`, `tools/`, the apps,
  the pictures), and makes `src/generated/`: the lessons and examples as they are, and the pages make-docs.mjs
  and make-guides.mjs wrote (reference, cookbook, examples), each cut into its top, body and own script, its
  links pointed at the new addresses. Those generators, and their tests, are unchanged.
- **The playground is index.html's.** Its whole behaviour is index.html's module script, which sync.mjs copies
  word for word to `/folio/playground.js`. The new page has every element the script looks for, by the same
  ids, in a new look, and loads it once the page is there. The page is at /folio/playground with no slash at
  the end, so the script's own `./worker.js` and `./folio.wasm` are /folio/worker.js and /folio/folio.wasm.
  `site.test.mjs` checks that every id the script looks up is on the page; index.html itself, and the page
  `folio build --web` makes of it, are as they were.
- **Old addresses.** A shared program at /folio/#code=..., or /folio/#playground, goes to the playground before
  the page shows; learn.html and docs/x.html are where they were (a static export writes learn.html for
  /folio/learn); docs/ and docs/cookbook/ have pages that send a browser on to /folio/docs and the cookbook.
- **The look.** Taken from the sites Awwwards gave Site of the Day in November 2026: bone white and ink with one
  colour, the orange of a lamp; Archivo, whose width and weight move, uppercase and condensed for what's big;
  Instrument Serif in italics for what's said; JetBrains Mono for code and labels, with its ligatures off, so
  `>=` stays the two characters the page is about. Hairlines instead of cards; nothing round but the pills.
  The fonts are Fontsource's packages, served from the site.
- **The motion.** The first visit's curtain counts to 100 as folio.wasm comes in (so the playground has it
  already), and lifts. The headline's letters come up into place, and grow heavier near the pointer. The
  reel, pinned, runs programs up through a lens, as obys.agency runs its work: the one in the lens in colour,
  the rest grey, and beside it what it says. The seal turns with the page; numbers count up; the list of
  programs shows each one's picture by the pointer; the name across the foot comes up letter by letter. All
  of it waits for `prefers-reduced-motion` to allow it, and what it would bring in is shown anyway if it hasn't
  started in 3 seconds.
- **What it weighs.** 63 pages; 103 kB of JavaScript every page shares, 175 kB in all for the front page; the
  site, engine and fonts together, 13 MB, most of it the Folio files and folio.wasm the playground uses.
- **Publishing.** `.github/workflows/site.yml` builds it on each push to main and deploys it to GitHub Pages,
  which serves it once the repository's Pages source is GitHub Actions.
## 149. Faster on the VM, the JIT and in machine code, measured

- **Why.** The playground runs programs on the VM and the JIT as well as WebAssembly, and machine code is what
  `folio build` makes. Each was measured first, on one set of programs, and changed where the time went.
  §128 found 12% of folio building compiler.folio in `is` between texts; that is where machine code starts here.
  (A third stage after §138's bits, said to be worth 27%, isn't on any branch, so nothing here is from it.)
- **How it was measured.** Sixteen programs: loops, sums with fractions, primes, fib(30), calls of four
  inputs, joining text, comparing letters, adding to text, lists, dictionaries and records. Before and after
  run in turns, each in a process of its own, so whatever else the machine is doing falls on both alike;
  the median of 15 runs of each (VM and JIT: after one run to warm up; machine code: the whole program, less
  an empty program's time). Windows 11, an AMD Ryzen 5 4600H, Node 24. Machine code was also counted with
  callgrind on Linux (§128), which gives the same number every time.
- **The VM's switch.** Its cases were opcodes read from OP, which V8 can't make a table of, so it compared
  each opcode with the cases in turn, up to 63 of them. Each case is now its number, `case 23 /* ADD_TO */:`,
  and a test checks every number against OP. 10,000,000 rounds of `add i to total` took 650 ms, now 380.
- **The VM's operations.** `-`, `*` and `/` of two numbers, an item of a list or a text key of a dictionary
  (read or set), a record's field, a record made, `add` to a number and `is` with text are done right where
  they are; anything else, and every mistake, goes to the same functions as before. A call's scope is made
  as an array with no holes, by pushing, which V8 reads and writes without checking for one.
- **Text and numbers shown.** `show()` made a Set for each value it showed, for lists that hold themselves,
  so `"x" + i` made two. It makes one only for a list, record or dictionary. `+` of two texts joins them
  without showing either. This is in vm.js, so the VM, the JIT and WebAssembly's text all have it.
- **The JIT's helpers.** With no limit on steps (the playground and run() set none unless asked), a loop's
  round and a call count nothing. A call with as many inputs as the function has, none saying what it is,
  only notes itself for a mistake's trail; anything else goes through the checks as before. `is` with text is
  `===`; `in` and `item` of a dictionary look the key up straight away; `less than` and the rest are each
  written out, where one function made all four and V8 couldn't put them in line.
- **Records in the JIT.** `record with x 1, y 2` was `record(["x", "y"], [1, 2])`, a call that set each field
  by a name in a variable. It is now `($t1 = new Record(), $t1["x"] = 1, $t1["y"] = 2, $t1)`, each field set
  by its own name. compiler.folio writes the same, byte for byte, and folio.wasm is made again from it.
- **Machine code: `is` with text the program wrote.** `kind of node is "call"` went to rt_cmp_is and
  rt_equal, about 80 instructions and `repe cmpsb`. For a text of up to 32 bytes it's now done in line:
  whether the value is text, how many bytes it has, and its bytes, four at a time against the text's, written
  in the instructions. A number is never the same as text, so a value known to be one jumps straight on.
- **Machine code: texts compared.** rt_text_same compares two texts eight bytes at a time, then one at a
  time, where `repe cmpsb` took longer to start than most texts take to compare. rt_equal goes to it first
  when both are text, before saving any register, and so does a dictionary finding a text key.
- **Machine code: dictionary keys.** A text key was hashed a byte at a time, 75 instructions for five letters.
  It's now eight bytes at a time, each xored in, multiplied by an odd number and its high bits brought down,
  then the last one to seven bytes as one piece, read as two that may overlap, with the count of bytes mixed
  in first; murmur3's last mix after, as before. Only the index uses the hash, so nothing a program sees
  changes: a dictionary keeps its keys in the order they came.
- **Tried, and not kept.** `is divisible by` with two whole numbers below 2^32 dividing as 32 bits, which
  §128 found slower as 64 on a Xeon: on this Ryzen the primes took 25.4 ms either way.
- **What it gave.** Milliseconds, the median of 15, before and after:

  | | VM | | JIT | | Machine code | |
  |:--|--:|--:|--:|--:|--:|--:|
  | loop: add 1 to 10,000,000 | 746 | 417 | 88 | 72 | 3.0 | 3.1 |
  | loop: repeat while, 3,000,000 | 508 | 306 | 53 | 45 | 4.6 | 4.2 |
  | numbers: pi by 5,000,000 fractions | 1,155 | 646 | 96 | 88 | 24.1 | 23.4 |
  | numbers: primes below 150,000 | 820 | 462 | 94 | 82 | 25.8 | 25.7 |
  | recursion: fib(30) | 776 | 390 | 100 | 86 | 6.4 | 7.3 |
  | calls: 4 inputs, 1,000,000 | 727 | 463 | 90 | 88 | 8.0 | 8.1 |
  | text: join 300,000 pieces | 125 | 67 | 96 | 65 | 31.6 | 32.3 |
  | text: 1,000,000 letters compared | 266 | 179 | 79 | 59 | 100.6 | 29.7 |
  | text: 2 letters added 1,000,000 times | 257 | 72 | 179 | 28 | 34.9 | 34.8 |
  | lists: 1,000,000 adds, summed by item | 214 | 120 | 40 | 36 | 10.4 | 10.7 |
  | lists: for each over 1,000,000 | 195 | 122 | 58 | 53 | 9.7 | 10.5 |
  | lists: set item 2,000,000 times | 647 | 248 | 117 | 91 | 11.0 | 11.1 |
  | dictionary: 1,000,000 counts | 564 | 264 | 140 | 92 | 49.9 | 42.3 |
  | dictionary: 200,000 keys made, set, read | 276 | 184 | 207 | 158 | 89.7 | 80.1 |
  | records: 1,000,000 made and read | 556 | 326 | 89 | 23 | 48.1 | 47.6 |
  | records: made by calls, 500,000 | 697 | 383 | 119 | 76 | 45.2 | 45.1 |

  Machine code, counted on Linux: the letters compared, 479.7 million instructions to 150.0 million; the
  1,000,000 counts, 539.6 million to 472.7 million; the keys made, 282.3 million to 246.9 million; the other
  13 programs ran exactly as many instructions as before, so their differences above (fib's 6.4 and 7.3 ms
  among them) are the machine's own. folio building compiler.folio: 3,287 million instructions to 2,910
  million, and 572 ms to 532 timed on Windows (the median of 11, in turns). On Linux in WSL, timed the same
  way, the letters compared took 109 ms, now 39; the counts 50, now 42; the keys 108, now 99.
- **Tested.** All of `node --test` passes, machine.test.js too. compiler.folio writes the JIT's JavaScript
  byte for byte on every case, and compiles itself to the same. Machine code against the VM and the JIT on
  Windows and Linux: `is` and `is not` with texts of 0 to 33 bytes (é, emoji, ÿ, a text one byte longer or
  shorter, or differing in its last byte) against texts, numbers, -0, nothing, yes, no, a list and a record,
  in `if`, `or`, `and`, `not` and `repeat while`, after a call; texts of every length compared with copies of
  themselves, slices of a longer text, and inside lists, records and `is in`; and dictionaries with text keys
  of 0 to 17 bytes and number keys, 3,000 more made as text, read, removed and gone through.

## 150. Moth is Folio

The language was Moth; it's Folio. The command is `folio`, a program's file is `name.folio`, the standard
library's files are `json.folio` and the rest, the compiler for the browser is `folio.wasm`, and the packages
for JavaScript and Python are `foliolang`. Done while nothing outside depended on it: the repositories were
private, and nothing was published to npm or PyPI.

- **The same everywhere.** Each `moth`, `Moth` and `MOTH` became `folio`, `Folio` and `FOLIO`, in every file's
  text and in every path, by one script, so a name and every place that names it stayed in step: a file's
  name and its `use` lines, a function and its callers, a message and the tests that expect it. Kept as it
  was: the changelog's history (it says what each release was), the 1.11.0 release's winget manifests, and
  the moth that's an insect (the editor's icon, an example asking about moths).
- **Names have lengths.** `.moth` was five letters and `.folio` is six, and the command written in Folio found
  a file's kind by its last letters: `cli_tail(path, length of path - 4) is ".moth"`. Each of those counts
  went up by one (for `.folio`, `.test.folio`, `.bench.folio`, and `folio_` in the names a library made for
  C exports), found by looking for a count near a renamed name, and in the original, where a name and the
  count that went with it were on different lines.
- **Programs from before still run.** `use "json.moth"` reads `json.moth` if there is one, and `json.folio` if
  there's only that: in the parser in JavaScript, in the compiler written in Folio, and in the command, which
  looks beside the program and then in its own copy of the standard library. `folio run old.moth` builds
  `old.exe`, and `folio test` finds `.test.moth` files as well as `.test.folio` ones. Nothing else of the
  old name is kept: there's no `moth` command, and `MOTH_POSTGRES_URL` and the like are `FOLIO_...`.
- **What changed with it.** Every fixed value made from the name was made again: the base64 of "Folio ✓", the
  zlib stream of a sentence about Folio, an example's "it has 5 letters", the winget and Scoop manifests.
  The tree-sitter grammar is named in the Zed and Helix settings by the commit that holds it, which is the
  commit after the rename. The site's own word, Folio, is now the language's: `sync.mjs` copies its text as
  it is, and the site is at /folio, where GitHub Pages puts it once the repository is called folio.
- **Tested.** Every suite as before, with "folio" in each name; a program that uses `math.moth` and a `.moth`
  file of its own on the three engines and in the compiler written in Folio, the same; and folio.exe running
  a `.moth` program and testing its `.test.moth` file.

## 151. The words of a mistake, in the WebAssembly module

The fourth of stage 2's parts (§139), begun: the checks that only ever made a mistake, and called JavaScript
to word it. A mistake's words need two things the module didn't have: what a value is, in words, and the
program's names. It has both now, and four checks are worded in it. A module imports 51 functions, not 55:
`callable`, `checkInputs`, `checkRange` and `recordFor` are gone.

- **What a value is.** `kindWords` in the shared runtime says what vm.js's `kindOf` says: nothing, yes/no,
  text, a list, a function, a record, a dictionary, bytes, an amount's measure (a distance, a time...) or a
  number, in kindOf's order. An amount's measure is from a table of each unit's, made from vm.js's UNITS
  when wasm-runtime.js is read, so the two can't drift apart.
- **The program's names.** The compiler gives each name a number as it meets it. Once the program is
  compiled, it puts each name's UTF-16 units in the module's data, and after them a table of where each
  starts and how long it is, which `init` makes the `names` global of; `nameText` makes a name's text from
  it. wasm.js and wasm.folio write the same bytes for it.
- **Worded in the module:** a call of what has no value yet ("there is no function called 'f'"), of what
  isn't a function ("'x' is a number, not a function"), a function given the wrong number of inputs ("'f'
  needs 1 input but got 2"), a range of what isn't numbers, and a field of what isn't a record, to read or
  to change. Each is thrown as the module's own mistake (§146), so a `try` catches it with no call out.
- **Still in JavaScript, for now:** a record with no such field, as "did you mean" picks from every field
  name, and JavaScript adds names (a table's rows); the kinds a function's inputs say they are; and a repeat
  count that isn't whole, which shows any value. Showing a value is the built-ins' part.
- **What it cost.** Every module holds the runtime's new words and its program's names: a module for
  `say 1` is 15,538 bytes, and folio.wasm 1,709,430, 4% more.
- **Checked.** A module run with every import but `say`, `tryStart`, `grant` and `refill` failing the
  test, its six mistakes caught in it and said, the same as the VM says them; and every program the
  engines are tested with, made by wasm.js, wasm.folio and folio.wasm byte for byte.

## 152. A security pass: permissions, packages and broken code

What a program, a project's files or a package can make folio do that it shouldn't, tried on folio.exe and on
every front end, after the rename (§150). Two holes were found in packages, both from `folio.packages`, and
fixed; the permissions held; and broken code found three ways to escape as a JavaScript error, or to take far
too long, which are fixed too, but for one, below.

- **Permissions held.** 38 tries at getting round `--allow-read=data`, `--allow-write=out` and
  `--allow-net=example.invalid` on Windows: `..` and `.\..` in every spelling, a whole path, `\\?\` and `\\.\`
  paths, a share (`\\localhost\C$`), a stream (`::$DATA`), `C:x` (relative to the drive's own folder),
  `\Users\...` (from the drive's top), a trailing dot or space, a junction inside the allowed folder that
  points out of it; and for sites, a user before an `@`, a `#`, a backslash, `%2f`, a trailing dot, a
  look-alike name and `file://`. Each was refused, or was the allowed place itself.
- **folio add held.** 21 addresses and versions made to be git's options, or a shell's (`--upload-pack=`,
  `ext::`, `-oProxyCommand=`, `--config=`, `;`, `$(...)`, backquotes): none ran a command, as a name made from
  one isn't a package's name, git won't take `ext::`, and the place git got as a repository didn't exist.
- **A folio.packages line could reach out of packages/.** Its name made a path unchecked: with `../../x`,
  `folio get` (which fetches a package with no sum again, taking its folder away first) and `folio remove`
  took away a folder outside the project.
- **A folio.packages line could make git run a command.** Its source went to `git clone` as it was, before
  the folder to clone into, so one of `--upload-pack=<command>` was an option, and the folder git's
  repository: with a repository's files at `packages/<name>.git`, which a project can hold, `folio get` ran
  the command. folio add reads each package's own folio.packages the same way, so a package could do it too.
  Its commit, and a version after an `@`, went to `git checkout` as options the same way.
- **What folio takes now** (`cli_package_fault`), from a program's folio.packages, from a package's, and from
  folio add: a package's name (no `/`, `\` or `:`, and not ending in `.`, which Windows drops, so that `...`
  isn't `packages/` itself), a source and a version that don't start with `-`, and a commit of 40 or 64 hex
  digits. A line that isn't is said, with why, and the command ends with 1 having done nothing. git gets the
  source after `--`. A clone that can't go to the version asked for is taken away, not left for the next
  folio add to find in its way.
- **git runs nothing of a package's.** Every git folio starts has `core.hooksPath=/dev/null`,
  `core.fsmonitor=false` and `protocol.ext.allow=never`: a `post-checkout` hook in `packages/kind/.git`, which
  git itself runs, folio's git doesn't. What's left is a `packages/` got some other way than folio's clone,
  in a zip say, whose `.git/config` git reads when folio fetches into it (SECURITY.md says so).
- **git's words keep their r's.** Folio's text has only `\n` and `\t`, so `"\r"` is `"r"`, and the line made
  of what git said dropped every r ("Could not esolve host"). It's `cli_cr` now, as the rest of folio.folio has.
- **Broken code.** 20,000 programs broken at random, beyond the 8,000 the tests break (§60): Folio's words
  and symbols put in, pieces cut out or copied, lines swapped, programs spliced, each through `check`,
  `format`, the VM's, the JIT's and the WebAssembly compiler, and compiler.folio, and each that compiled run
  on all three engines with a step limit. Only FolioErrors came of them.
- **Deep code.** About 1,000 levels of nesting runs JavaScript's stack out. `build()` made that "the code is
  nested too deeply", but `format()` didn't, and the compilers written in Folio, as JavaScript and as
  folio.wasm, only made their own depth limit that mistake, so a RangeError got out. All of them do it now
  (`ranOut`, which counts Firefox's InternalError too), and the tests check seven front ends give the same
  mistake for four shapes of deep code. folio.exe ends every one of them with a mistake too.
- **The checker on long sums.** It made the type of each sum in a sum again for each `+`, and worked each
  out again for each: 3,000 terms took 3 s, 5,000 14.6 s to find them too deeply nested. A type is made once
  for each expression now, and a sum's worked out again only once a variable's type has changed
  (`all.round`): 1,000 terms take 20 ms, not 198, and what it finds is the same.
- **Still slow, for later.** compiler.folio looks a name up by going through every name so far, so a
  program of 20,000 top-level variables takes folio.exe 20 s to run (5,000: 1 s), where folio.js takes 0.2 s
  for 50,000; and folio.exe's check takes seconds on a chain of thousands of `-` or `+` (8,000 `-`: 6 s), and
  minutes on 50,000. They're programs no one writes by hand, but a page or a tool that checks code it's sent
  should limit its size.

## 153. What a value shows as, in the WebAssembly module

The rest of stage 2's fourth part (§151): what lists, text, dictionaries and bytes do that still called
JavaScript, and every mistake they make. A module imports 42 functions, not 51: `lengthOf`, `item`, `itemRef`,
`put`, `dict`, `remove`, `addInto`, `checkRepeat` and `itemsOf` are gone. What's left of part 4 is a function's
inputs that say what they are (`checkKind`) and a record's "did you mean" (`field`).

- **They weren't only mistakes.** A text's letters (`item 2 of "héllo"`, `for each c in words`, `length of
  words`), a dictionary's keys for `for each`, and `add` to text went to JavaScript too. They're the module's now.
- **Showing a value** (`show`), as vm.js's show does: text as it is, or inside a list, record or dictionary in
  quotes as `JSON.stringify` writes them (`\"`, `\\`, `\n` and the rest, `\u` and four lowercase hex digits for
  a unit below 32 and for half of an emoji on its own); a number as text (§139); `[1, "a"]`, `(record with ...)`,
  `(dictionary where "a" is 1)`, past keys taken out, and `(empty record)` and `(empty dictionary)`; a list
  inside itself as `[...]` and a record or dictionary as `(...)`, from a stack of what's being shown;
  `(3 bytes: 0, 255, 0)`, `<function f>`, and an amount by its unit's word for one of it or for more.
- **A text's letters,** as the VM counts them, an emoji as one: where each begins, kept for the last text asked
  about, as vm.js's lettersOf keeps them, so going through a text a letter at a time takes as long as it is.
- **"Did you mean"** for a dictionary's key: vm.js's distance (an edit is a unit put in, taken out or changed, or
  two side by side swapped) and closest (within 1 edit for 3 units or fewer, 2 for more, the first nearest).
- **Names JavaScript adds** as the program runs, a table's rows' fields, it gives the module too (`addName`), so
  the module can show a row; a name's text is from the program's data, or past it from those.
- **Amounts added** in the module, as vm.js's amountIn does: in the first one's unit, times the other's factor
  over its own, from a table of each unit's factor and words made from vm.js's UNITS.
- **A bug it fixed.** `set item 2.0000000000000004 of xs to 9`, an item given past 15 digits, changed a copy of
  the list in JavaScript, and left the list as it was. It's changed in the module now, as the VM changes it.
- **A hazard met.** The runtime's `canon` takes only a number above 0 that isn't whole (as §147's keys use it),
  and with 0 it never ended. `canonAny` is vm.js's canon: a whole number, or one that isn't finite, as it is.
  `item 0 of xs` and an amount of 0 found it; the tests have both.
- **What it cost.** Every module holds all of the runtime, used or not: a module for `say 1` is 26,348 bytes,
  not 15,538, and folio.wasm 1,965,287, not 1,709,430. Leaving out what a program doesn't call, in wasm.js and
  wasm.folio alike, is for later: part 5's built-ins will make it worth more.
- **Checked.** A module run with every import but `say`, `tryStart`, `grant` and `refill` failing the test:
  each kind of value shown, letters and emoji, `for each` over text and a dictionary, and 21 mistakes, all as
  the VM says them; amounts shown and added on both engines; and every program the engines are tested with, made
  by wasm.js, wasm.folio and folio.wasm byte for byte, the 8,000 broken ones too.

## 154. Inputs that say what they are, and a record's "did you mean", in the module

The last of stage 2's fourth part (§151, §153). A module imports 40 functions, not 42: `checkKind` and `field`
are gone, and every value check, and every mistake one makes, is the module's own.

- **A table of each function's inputs** that say what they are, in the module's data after its names: for each
  such function, where its entry is; there, how many inputs it has, then each one's name and its kind plus 1 (0
  for any, so no number in it is below 0, which wasm.folio's `bit and` would want to be). The names are given ids
  as the program's other names are, before those are written, in wasm.js and wasm.folio alike. `init` makes the
  `kindsData` global of it; a call checks each input, at the call's own place, as vm.js's checkKinds does.
- **A bug it fixed.** wasm.js said what a value was from its own table of tags, which had none for an amount:
  `f(5 km)` for `to f with a as a number` said "'f' needs a to be a number, not undefined". The module says what
  the VM and the JIT say, "not a distance", from `kindWords` (§151).
- **"Did you mean"** for a record's field: vm.js's closest over the record's own fields' names, from the names
  table, and from the names JavaScript gives the module (§153), so a table's row is guessed about too.
- **Checked.** A module run with every import but `say`, `tryStart`, `grant` and `refill` failing the test:
  three inputs of the wrong kind and three fields, with a guess and without; an amount given to a number; a
  table's row read from a file, shown and guessed about as the VM does; and every program the engines are tested
  with, made by wasm.js, wasm.folio and folio.wasm byte for byte.
- **What's next.** Part 5 is the built-ins, which still call JavaScript (`builtin`, `plus`, `arithmetic`,
  `compare`, `equal` and the rest); then the host interface (part 6), where WASI plugs in, and deep calls (part 7).
  A module for `say 1` is 27,149 bytes; leaving out the runtime a program doesn't call is worth more as part 5
  adds to it.

## 155. The operators, in the WebAssembly module

The first of stage 2's fifth part, the built-ins: the operators, which every program uses. A module imports 34
functions, not 40: `plus`, `arithmetic`, `negate`, `compare`, `numberOrder` and `equal` are gone.

- **What they did in JavaScript.** Two numbers, and text with text or a number, were the module's already. The
  rest went out: `+` with text and any other value (joined as show makes it, §153), amounts (`5 km + 300 m`,
  `2 * 3 km`, `6 km / 2 km`, `-(5 km)`, compared in the first one's unit), `is` by value for lists, records,
  dictionaries, bytes and amounts, `is in`, and every mistake. Each is as vm.js does it now, in the module.
- **`is` by value**, as vm.js's equal: a list, record or dictionary by what it holds, the pair of them on a stack
  while they're compared, so a list that holds itself is the same as another that holds itself; a dictionary's
  keys found in the other by its slots (§147), a record's fields by their ids; bytes byte by byte; an amount in
  the first one's unit, to 15 digits.
- **Two numbers that agree to 15 digits, or nearly** (`0.30000000000000004 is less than 0.3`): both to 15 digits
  (`canonAny`, §153), then compared, as numberOrder does.
- **`is in`**, as isIn: an item of a list by value, a number among bytes to 15 digits, a key of a dictionary (no
  dictionary has a key that isn't text or a number, so a list is in none), or a piece of a text, unit by unit.
- **Left in JavaScript: `remainder` and `divisible`,** for numbers that aren't both whole and below 2^52 (the module
  does those). Each needs JavaScript's `%` on doubles, which is exact (C's fmod), and WebAssembly has no remainder
  for floats; doing it from the bits, as musl's fmod does, is for the next part.
- **Checked.** A module run with those imports failing the test: text joined with a list and a record, 15-digit
  comparing, `is` on lists, records, dictionaries and lists that hold themselves, `is in` four ways, and eight
  mistakes, as the VM says them; amounts on both engines; and every program the engines are tested with, made by
  wasm.js, wasm.folio and folio.wasm byte for byte.

## 156. A name found in a scope at once

The security pass (§152) found compiler.folio looked a name up by going through every name in its scope:
`slot_of` from the first to the last, for every name used and, as a scope was made, for every name it made. A
program of 20,000 top-level variables took folio.exe 20 seconds to run, and one of 50,000 more than 3 minutes,
where folio.js took 0.2 seconds; compiler.folio on the JIT took 55. Each scope keeps a dictionary of each name's
slot now, beside its list of names, set as each name is added: the last slot with that name, as slot_of found
it, so a function with two inputs of the same name has the second. `new_scope`, `reaches` and `resolve` look
there. The slots are the ones they were, so what every back end makes is the same, byte for byte.

| | 5,000 variables | 20,000 | 50,000 |
|:--|--:|--:|--:|
| compiler.folio on the JIT, before | | | 55 s |
| compiler.folio on the JIT, now | 0.15 s | 0.41 s | 1.0 s |
| folio.exe run, before | 1.0 s | 20 s | over 200 s |
| folio.exe run, now | 0.21 s | 0.43 s | 0.98 s |

Still slow, and not about names: folio.exe on code nested a thousand blocks deep (100 seconds, where the JIT
takes a quarter of one), likely its collector going through a stack that deep each time it runs; and folio.exe's
check on a chain of thousands of `-` or `+` (8,000: 6 seconds), whose types it works out again for each, as
checker.js did before §152. Neither is a program anyone writes by hand.

## 157. A remainder of two numbers, exactly, in the module

JavaScript's `%` on numbers is exact, with the first number's sign: C's fmod. WebAssembly has no remainder for
floats, and `x - trunc(x / y) * y` isn't exact, so `fmod` is worked out from the bits, as musl's fmod does: each
significand with its leading 1 (a subnormal's shifted up to have one), y taken from x a bit at a time, and the
rest made a double again with x's sign. `is divisible by` for two whole numbers past 2^52, and any that aren't
whole, is vm.js's divisible on it, so a module imports 32 functions, not 34: `remainder` (which nothing called)
and `divisible` are gone. Checked against JavaScript's `%` on 3,000,000 pairs of numbers, any bits at all,
subnormals, whole numbers, both signs, 0, infinities and NaN, every one the same to the bit, through
`remainderOf`, which the runtime exports for that, as it does `numberText`.

## 158. Numbers on the graphics card: gpu.folio

The first step of making Folio able to train real neural networks: its numbers worked on by an NVIDIA card,
thousands at a time. arrays.folio (§118) does a matrix multiply in machine code, two numbers at a time; a card does
it with thousands of threads at once.

- **Through the driver alone.** CUDA has two layers: the toolkit (nvcc, the runtime, cuBLAS), which a program
  would have to ship, and the driver, which every NVIDIA card's driver installs (nvcuda.dll on Windows,
  libcuda.so.1 on Linux). gpu.folio uses only the driver, through `use the library` (§45): cuInit, the device
  and its primary context, cuMemAlloc and the copies, cuModuleLoadDataEx and cuLaunchKernel.
- **The card's code in PTX.** NVIDIA's cards run code the driver makes for each, from PTX, NVIDIA's assembly for
  all of them, which the driver compiles as it loads a module. So the card's code is written in gpu.folio, as text,
  for `sm_50` (every card since 2014, the newer ones by the driver's own compiling): `binary` (+ - * /, the larger
  and the smaller of two), `scalar` (the same with a number), `unary` (negate, relu, exp, ln, tanh, sigmoid, sqrt,
  absolute, square and relu's slope), `fill`, `sum` (each thread a stride of the numbers, a block of 256 added up in
  the card's fast memory, then added to the answer) and `matmul`. A mistake in the PTX comes back with the driver's
  own words, from its log.
- **The multiply, as fast ones are made.** Each block of 16 by 16 threads works out a 64 by 64 tile of the answer,
  each thread a 4 by 4 of it, 16 apart, in registers. A 64 by 16 tile of one matrix and a 16 by 64 of the other
  are loaded into the card's fast memory in turn; each of their 16 steps takes 8 numbers from it for 16
  multiplications, where a first version, each thread one number of the answer, took 2 for 1. That was 3 to 4
  times as slow (2,048 by 2,048 in 49 ms). The 16 sums and the 4 by 4 loads are written out by loops in Folio.
- **Floats.** A card keeps numbers as 32-bit floats, about 7 digits, as machine learning wants them; Folio's are
  doubles to 15 (§24). `numbers_convert` (§118) turns a list into floats for the card and back. exp, ln, tanh and
  sigmoid are the card's quick ones (ex2.approx and lg2.approx), good to a float's last digit or two.
- **Kernel inputs.** cuLaunchKernel takes where each input is: each one's 8 bytes in a row (a place on the card, a
  whole number, or a float's 4 bytes), and a list of where each starts, which `memcpy` with 0 bytes gives, as it
  gives back where it copied to.
- **Asked first, and none.** A program that uses it needs `--allow-libraries`, as any library does. Where there's no
  driver, or no card, `available()` is no and every other function a `fail with` that says which.
- **What it gave**, on a GTX 1650 (4 GB, 14 processors) against arrays.folio's matmul in machine code:

| | 256 | 512 | 1,024 | 2,048 |
|:--|--:|--:|--:|--:|
| matrix multiply, on the card | 0.1 ms | 0.3 ms | 2.8 ms | 13 ms |
| arrays.folio, in machine code | 5 ms | 39 ms | 461 ms | 3,552 ms |
| times as fast | 50 | 130 | 167 | 270 |

  2,048 by 2,048 is 1.3 trillion operations a second, about 45% of what the card can do. A million numbers go up
  to the card in 2 ms and come back in 7, and the card adds them in 1; the first call takes about a tenth of a
  second, as the driver starts.
- **Checked**, in machine code, where there's a driver (it's skipped where there isn't): each operation against
  Folio's own arithmetic, the quick ones within a millionth of arrays.folio's, a 37 by 29 times 29 by 41 multiply
  (past a tile's edge both ways) the same as arrays.folio's, a sum of 100,000 numbers, nothing on the card, numbers
  given back, and its mistakes. CI has no card, so it runs on a computer that has one.
- **Next**: arrays that live on the card, with their shapes, in arrays.folio; a gradient for each operation, so a
  network of arrays learns (neural.folio's, micrograd's way, is one number at a time); layers, Adam, and a small
  GPT trained on the card.

## 159. The system's DLLs, loaded when a program first uses them

`folio version` took 25 ms on Windows, where a C program that says hello takes 15. folio's own work before it
writes, the collector's memory, the clock and the dispatch, takes 1. The other 9 were Windows loading the DLLs
folio imports, USER32, GDI32, GDI+, the file dialogs, WinHTTP and WINMM, before the program starts, for every
command, though `folio version` opens no window and goes nowhere.

- **Late.** Those six are no longer in a program's imports. Each of its functions in them has a slot of its own, in
  the zeroed memory, which `rt_late_init`, the first thing `start` does, points at a stub. The first call goes
  there: `rt_late_resolve` keeps the call's inputs (rcx, rdx, r8, r9 and xmm0 to xmm3; those on the stack are
  where they were), loads the DLL with `LoadLibraryExW` and `LOAD_LIBRARY_SEARCH_SYSTEM32`, finds the function
  with `GetProcAddress`, puts it in the slot, and jumps to it. Every call after goes straight there, as through
  the import table. KERNEL32, which every program uses, is loaded at the start, as before.
- **From System32 only**, as the load configuration has Windows load the rest (§38): a winmm.dll beside the
  program is never the one it loads, as the test that plants three of them checks. A DLL of Windows' own that
  isn't there, or hasn't the function, ends the program with 75.
- **What it gave.** `folio version` takes 16.4 ms, a C program built with MSVC that says hello 15.5, Folio's
  hello 15.2, and Windows' own hostname.exe 16.2: what's left is Windows starting a program at all. On Linux,
  where a program has no DLLs to load, `folio version` takes 3 ms.
- **Measured** with Node's `spawnSync`, the best of 20 runs, each program run 5 times first, in a folder of the
  user's: in the temporary folder Windows' virus checker looks over a program every time it starts, 9 ms more
  for each of these (35 ms against 24), and in its first few runs anywhere. Git Bash takes 80 to 180 ms to start
  a program itself, so it can't time one.

## 160. Memory as C has it: memory.folio

Folio had bytes, a byte at a time, and C's kinds of number only where a library's function takes them. A file
format, a network message, a model's weights or a structure C hands back keeps whole numbers of 8 to 64 bits,
signed or not, floats and doubles, in either byte order, and reading one meant adding bytes up by hand.

- **The kinds, by the names Folio has for them.** `get(b, place, "a short whole number")` and `put(b, place,
  value, kind)` take the eleven names a library's line takes (`a byte` to `an unsigned long whole number`,
  `a pointer`, `a float`, and `a number` for a double), and an order, `"little"`, as every computer Folio runs on
  keeps numbers, or `"big"`, as networks send them. Places count from 1, as bytes' do. `get_many` and `put_many`
  take a list at a time. No new words: it's a library (VERSIONING.md), and `read` and `write`, which are Folio's
  own, aren't its names.
- **Checked, as everything in Folio is.** Every place against the memory's size, and every number against its
  kind: `'put' needs a whole number from -32768 to 32767 for a short whole number, not 40000`. A whole number is
  the one Folio takes it for, to 15 digits (§23), as a library's whole inputs are.
- **Memory of the program's own.** `take(n)` is a block of n bytes outside the collector, through the C library's
  `calloc` (msvcrt on Windows, libc on Linux), all 0, until `give_back(block)` frees it; using it after is a
  mistake, not a crash. `copy` (memmove, so they may overlap) and `fill` (memset) work on bytes and blocks alike,
  `address_of` gives where either is, for a library's `a pointer`, and `block_at(address, size)` makes memory a C
  library gave a block, which `give_back` won't free. That one can crash a program given an address that isn't
  one, as C can; nothing else can. Taking memory needs `--allow-libraries`; numbers in bytes don't.
- **Folio's own loop.** In a program `folio build` makes, `get`, `put` and their many go through `rt_k_memory`
  (`numbers_memory` in `use the library "folio"`, §118): a loop for each of the ten kinds, each order and each
  way, 40 in all, with `movsx`, `bswap`, `cvtss2sd` and the rest, between a list of numbers and bytes or an
  address and its size. It checks what it's given, the list's room and the memory's, every number written, and
  gives 1 for anything it won't do, which memory.folio then does in Folio, so its mistakes are Folio's. A NaN
  read is made the one Folio makes: a NaN's bits can be anything, and some of them are `nothing`'s.
- **In Folio, exactly.** On the JavaScript engines, which have no memory but the collector's, a block is bytes,
  and every number is made from its bytes and back in Folio. Arithmetic there is the double's own, but rounding
  and comparing go by 15 digits (§23), which can't be used for bits: a float is rounded to the nearest, ties to
  the even one, by the double's own rounding of it plus 2^52, the exponent is found by the sign of a difference,
  and whole numbers are split into 32-bit words by `remainder of`, which is exact for whole numbers.
- **What it gave**, in machine code: a million floats put in 1 ms and got in 10 (most of it making the list they
  go into; 3 the next time), and one number got or put in about 0.2 microseconds. The same in Folio on the JIT
  takes 5.5 seconds and 1.
- **Checked**: every kind, both orders and both ways, in bytes past their first and through an address, against
  what Node's Buffer writes, to the bit; everything the loop refuses; a NaN with nothing's bits read as a NaN;
  and memory.folio's own tests on every engine and in machine code, with and without the loop.

## 161. folio check reads only the rules a program needs

`folio check` on an empty file took 37 ms, where 1.11.0's took 26, and folio's other commands take 16. All 20
went on the checker's rulebook (§107): 9,504 lines of what each rule does with each type, made into a dictionary
before the program was looked at, every run.

- **By family.** make-checker-rules.mjs writes the lines in families, what's before a line's first `|` (`math`,
  `compare`, `type`), or `builtin|` and the builtin's name, 75 of them, the biggest 1,725 lines (`items`). folio
  check makes a family's dictionary the first time it looks a rule up in it, and the messages the first time it
  says one. A program uses a few families, and an empty one none.
- **What it gave.** `folio check` takes 16.8 ms on a one-line file, not 37, and 84 ms on arrays.folio's 1,300
  lines, not 97. Every one of the 117 Folio files in the repository is checked with the same words as before.

## 162. Networks trained on the graphics card: learn.folio

gpu.folio (§158) worked on lists of numbers on the card; a network wants matrices with shapes, a gradient for
each operation, and its parameters moved, again and again, without coming back to the processor.

- **Matrices that remember how they were made.** learn.folio's matrix is rows by columns numbers on the card
  (gpu.folio's) or, where there's no card, an array (arrays.folio's), and a parameter is a matrix that learns.
  Each operation on a matrix a parameter went into, `matmul`, `plus`, `minus`, `times`, `add_row`, `relu`, `sum`,
  `mean`, `cross_entropy` and `mean_squared_error`, is kept on a tape, in the order it was done; `backward(loss)`
  goes through it the other way, each one's gradient sent to what made it, added up where two used the same:
  reverse-mode differentiation over whole matrices, as PyTorch's autograd, where neural.folio's went a number at
  a time. Then `layer`, `network` and `forward`, and `sgd` and `adam`, whose `step` moves the parameters and lets
  go of the tape's matrices, their memory back to the card.
- **The card's kernels for it**, in gpu.folio, in PTX: a matrix turned over, a row added to each row (a bias),
  each column added up (its gradient), each row's softmax, softmax and cross-entropy at once (the loss and its
  gradient in one pass over each row, the largest taken off first so nothing overflows), each row's largest,
  relu's gradient, numbers added in place, and Adam, each parameter moved in one pass. Each is checked against
  the same in Folio, to a float's precision.
- **Memory kept.** A training step makes and frees the same sizes each time, and the driver takes a while to
  hand memory out, so `free` keeps it for the next numbers of as many; `give_back_memory()` returns it, and an
  allocation the card has no room for returns it and tries again.
- **Checked**: every operation's gradient against the loss's slope as each parameter's numbers move a little either
  way, on the processor, on every engine; a network learning XOR; Adam's and gradient descent's steps; and, in
  machine code where there's a card, every loss and gradient on the card against the processor's, to a float's
  precision.
- **What it gave**, digits-learn.folio: a network of 256 pixels, a hidden layer and 10 chances, 10 rounds of
  6,000 drawings in batches of 200 with Adam, 99.4% right on 1,000 it hadn't seen. On a GTX 1650:

| hidden | Folio, on the card | PyTorch 2.6, on the card | PyTorch, on the processor | Folio, on the processor |
|--:|--:|--:|--:|--:|
| 256 | 0.24 s | 0.63 s | 0.76 s | 5.5 s |
| 1,024 | 0.49 s | 0.68 s | | |
| 2,048 | 0.83 s | 0.63 s | | |

  A small network is mostly the time each operation takes to start, which is less in Folio than through Python;
  a wide one is mostly the multiplies, where PyTorch's cuBLAS does better with a matrix 2,048 by 10 than
  gpu.folio's 64 by 64 tiles. On the processor, the multiplies are arrays.folio's loop, one number at a time on
  one core, where PyTorch's use every core and the processor's vector instructions.
- **Next**: a multiply for thin matrices, arrays for a GPT (embeddings, layer norm, attention with its mask),
  and a small GPT trained on the card.

## 163. A square root to the last bit

math.folio's `sqrt` took 60 of Newton's steps from x itself, which for 10^300 got to 8.7 × 10^281, and from 1 for
10^-300, which got to 8.7 × 10^-19: 60 halvings is nowhere near enough for a number that size.

- **Now** x is m times 4^k, m from 1 up to 4, each step exact, so its root is m's times 2^k; from (m + 1) / 2, six
  of Newton's steps are within one double of m's root; and m - r times r, worked out exactly by splitting r in
  halves of 26 bits (Dekker's way), says by its sign whether the double above or below is nearer. Folio compares
  numbers to 15 digits (§23), so every test is a difference's sign, which is exact.
- **Checked** against JavaScript's `Math.sqrt`, which IEEE 754 makes the nearest double: a million of every size,
  subnormal to the largest, every one the same to the last bit, at 0.6 microseconds each in machine code.
- **So arrays.folio's sqrt is the processor's.** Its machine-code loop (§118) has `sqrtsd` for it now, which gives
  that same double, and a new `above_zero`, 1 above 0 and 0 otherwise, relu's slope: learn.folio's gradients on
  the processor, which went through `apply` a number at a time, take a third of the time they did.

## 164. Machine code nearer C's

Measured against C (MSVC, /O2), Rust (-O), Node.js 24 and Python 3.13, each program run whole, the best of
three, outside the temporary folder (§159), Folio's machine code was C's on the add loop, the primes and the
float maths, 20% behind it on fib, and 3.6 times behind on putting 10 million floats in bytes and back, a loop
that does arithmetic on the way.

- **The right first.** `set s to s + i * 0.5` pushed s, worked out `i * 0.5`, and added from the stack: a store
  and a load on the loop's one chain of work, every time round. When the left is a variable known to hold a
  number, so reading it can't fail, and the right is numbers, names and maths, which can't change it or run
  any of the program, the right is worked out first and the left added from its register: 5.5 ns a time round
  to 1.6, as `add i * 0.5 to s` already was. Two numbers added either way round are the same number.
- **matmul in blocks.** arrays.folio's loop (§118) added each term into out's row in memory, a load and a store
  for every two numbers. It now keeps a 4 by 4 block of out in xmm8 to xmm15 for the whole sum, with b's four
  columns copied together onto the stack first (a power-of-2 row puts every row of a column in the same few
  places in the cache). Each number is still 0 + a's first times b's first + ..., a multiply then an add, in
  that order, so it's what Folio's own loop works out to the last bit, as a byte-for-byte check over shapes with
  every remainder found: 256 by 256 in 3 ms, not 7; 512 by 512 in 31, not 42.
- **Tried and taken out**: comparing with a whole number the program wrote without first checking the other
  side is whole (a sliver below it is all that 15 digits can move). fib was no faster: the processor guesses
  that branch, so the check costs nothing on the way.
- **Where it stands**, the same programs, each whole, on Windows:

| | C | Rust | Folio | JavaScript | Python |
|:--|--:|--:|--:|--:|--:|
| start, say hello, end | 16.7 ms | 17.3 ms | 14.6 ms | 66.6 ms | 78 ms |
| fib(32): 7 million calls | 25.7 ms | 24.7 ms | 31.2 ms | 88.8 ms | 448 ms |
| adding 1 to 100,000,000 | 41.5 ms | 19.0 ms | 42.5 ms | 146 ms | 9,519 ms |
| primes up to 300,000 | 77.4 ms | 78.1 ms | 76.8 ms | 127 ms | 2,122 ms |
| 30,000,000 steps of decimal maths | 55.6 ms | 56.3 ms | 54.1 ms | 108 ms | 4,404 ms |
| 10 million floats into bytes and back | 68 ms | 69 ms | 249 ms | 592 ms | 1,005 ms |

  Rust's add loop is LLVM's, four numbers at a time; fib's 20% is what each call checks that C's doesn't (that
  n is whole before comparing it to 15 digits, how deep the calls are, and that the sum is a number). The
  floats are mostly adding 10 million numbers to two lists, 6 ns each.

## 165. Structures, views and memory threads share

memory.folio (§160) read and wrote numbers anywhere in memory; a C structure was a sum of offsets worked out by
hand, any part of a block was the whole of it to anything given it, and two threads changing one number could
lose each other's changes.

- **Layouts.** `layout(list of "x", "a whole number", "d", "a number")` lays a structure out as C does: each
  field on a boundary of its own size, a structure in it on its largest field's, the whole a multiple of the
  largest. `get_field`, `put_field`, `offset_of` and `size_of` go by name; a name that isn't a field is a
  mistake that lists the fields.
- **Views.** `view(m, place, n)` is n of m's bytes as a block of their own, places from 1, nothing past its end
  reachable through it: the size a function is handed is the size it can touch. `read_only(m)` is a view that
  get and the rest read and put, put_many, copy, fill and the atomics refuse. A view is gone when the block it's
  a view of is given back, and using it after is a mistake, not a read of memory that's someone else's now; a
  view isn't given back itself.
- **taken()** is how many bytes take has given that give_back hasn't had back, for a test to find a leak.
- **Atomics.** `add_atomically`, `swap_if`, `get_atomically` and `put_atomically` change a 64-bit whole number as
  one step however many threads do it at once, through `rt_k_atomic` in machine code: lock xadd, lock cmpxchg, a
  read, and xchg. The place must be on an 8-byte boundary, as the lock instructions want. Four workers adding
  1 a million times each to one number of a block they share count 4,000,000; the same through get and put
  counted 1,325,496. On the JavaScript engines, with no other thread, they're get and put.
- **Checked**: layouts against C's for mixed and nested structures, views' bounds, read-only refusals, a view of a
  block given back, taken() back to where it was, the atomics' answers on every engine, and the workers' count.

## 166. matmul with AVX, on every core

After §164, arrays.folio's matmul in machine code worked out 2 numbers to an instruction on one core: 512 by 512
in 31 ms, 8.7 billion operations a second, where the processor has 256-bit registers and twelve cores.

- **AVX.** Where CPUID says the processor has AVX and XGETBV that the system keeps the upper halves of the
  registers, found once a run, the blocks are 4 rows by 8 columns, each 4 numbers of a row in a ymm register:
  vbroadcastsd a's number, vmulpd, vaddpd, so each number is still 0 + a's first times b's first + ..., a
  multiply then an add (no fused multiply-add, which rounds once where Folio rounds twice), in the same order.
  machine.folio writes the VEX prefix itself (`vex`), as it writes REX. vzeroupper before the SSE code after it.
- **Every core.** When there's enough to do (m times n times k from 2^21 on) and at least two fours of rows, the
  rows are shared out among as many threads as the program may run on, at most 8 (GetSystemInfo on Windows,
  sched_getaffinity on Linux): CreateThread, or clone with a stack of its own and CLONE_CHILD_CLEARTID to wait on,
  each thread its own run of out's rows and its own copy of b's columns on its own stack, and this thread the
  last run. Nothing is written by two threads, so every number is the one one thread would work out. A thread
  the system won't start has its run done here.
- **Checked** byte for byte against the single-threaded SSE2 loop and against Folio's own loop on the JavaScript
  engine, over shapes with every remainder of rows and columns, k past the copy's 1,024, and a thread per four
  rows: 357,287 numbers the same on Windows and Linux.
- **What it gave**, on 12 cores: 512 by 512 in 5 ms, not 31 (54 billion a second); 1,024 by 1,024 in 59 ms.
  The digit reader's training on the processor takes 3.7 s, not 4.5: its multiplies are small, and the rest of
  each step, arrays made and the operations between them, is most of it now.

## 167. A GPT trained on the graphics card

learn.folio (§162) trained a network of layers on the card; a GPT wants more: its letters looked up in a table,
its places too, layer norms, GELU, and attention, each place looking back at the places before it, each with
its gradient.

- **Operations.** `embedding(table, ids)`, `gelu(m)`, `layer_norm(m, gamma, beta)` and `attention(q, k, v,
  batch, time, heads)`, with a causal mask, each kept on the tape like the rest. On the card, gpu.folio's
  kernels: an embedding's rows gathered and its gradient added back at once (`red.global.add.f32`, as several
  rows can have one id); GELU as GPT-2 has it (tanh's) and its slope; layer norm, a thread for each row, its
  normalized rows and 1 / sqrt(variance + 10^-5) kept for the gradient; and attention, a thread for each batch,
  head and place: scores against the places up to it, their softmax kept, the values added up, and for the
  gradient, dv and dk added at once and dq worked out where it is. On the processor, the same in Folio.
- **Checked**: each gradient against the loss's slope on the processor on every engine, a place seeing only the
  places before it, and every loss and gradient on the card the processor's to within 10^-7 of each.
- **Weights in a file.** `save(named, file)`, `load(file)`, `load_into(named, file)` and `named_parameters(net)`
  keep matrices as safetensors, as Hugging Face does: 8 bytes for the header's length, the header in JSON, then
  32-bit floats. A file the spec's way, made in Python, loads; Folio's parses with the same numbers.
- **gpt.folio**, a character-level GPT: token and place embeddings 64 wide, 2 blocks of 4-head attention and
  a GELU network each after a layer norm and added back, a last layer norm and the letters' scores, 117,740
  parameters, Adam at 0.003, batches of 16 pieces of 64 letters of Folio's own README. Against PyTorch 2.6 with
  the same model, sizes and steps, on the same GTX 1650:

| 2,000 steps | Folio | PyTorch |
|:--|--:|--:|
| loss at the last step | 1.386 | 1.423 |
| loss on the tenth of the text it never learned from | 1.727 | 1.763 |
| time a step | 24.9 ms | 17.6 ms |

  It writes text with the README's shape: "Folio Windows, Python's `run` ...". A kernel's launch from Folio takes
  about 20 microseconds here, the same as the driver's call alone, so PyTorch's lead is in launching fewer:
  its Adam does every parameter at once, its multiplies take a matrix turned over without turning it.
- **Next**: Adam for every parameter in one launch, multiplies that read a matrix turned over, 16-bit floats and
  the card's tensor cores, and a bigger GPT.

## 168. Training faster than PyTorch on the card

§167's GPT took 24.9 ms a step on a GTX 1650 to PyTorch's 17.6. Leaving out one kind of kernel at a time
(its launches skipped, the step timed) showed where the card's time went: a step's own work in Folio was a
millisecond, and the rest was the card. It went to matmuls of a layer's weight gradient, 64 by 64 from 1,024
rows, one block of the card's threads doing all of it; to turning matrices over for the gradients; to attention
and layer norm, a thread for each row, each looping alone over its row; and to launching 181 kernels a step,
32 of them Adam's.

- **Matmuls that read a matrix turned over.** gpu.folio's `matmul_turned(a, b, rows, inner, columns,
  a_turned, b_turned, into)`: kernels `matmul_tn` and `matmul_nt` load a tile of a or b turned over into shared
  memory as they load it (rows 17 and 65 numbers apart there, so threads don't wait on one bank), and learn.folio's
  gradients use them, with no transposes. A long inner axis with few tiles is shared out in pieces, each block a
  piece, each added at once to the answer (`red.global.add.f32`), so a weight gradient has 16 blocks working, not
  1. Given `into`, a gradient is added to what's there: the parameter's own.
- **Attention a thread for each score.** Scores and dp, a thread for each (batch, head, place, place);
  softmax and ds, a warp of 32 threads for each row, its largest and its sum found across the warp
  (`shfl.sync.bfly`); out, dq, dk and dv, a thread for each number. Layer norm and its gradient, a warp for each
  row the same way. Column sums, a thread for each column and 32 rows.
- **Adam in one launch.** `adam_many(entries, ...)` takes up to 64 parameters at once: each one's p, g, m, v and
  count go in a table passed as the kernel's one parameter, the block's y its parameter; and it leaves each g 0.
  learn.folio keeps those zeros (a parameter's `zeroed`), and the next step's matmuls, column sums and embedding
  gradients add to them where they are, so they need no zeros of their own and no adds after.
- **Checked**: every loss and gradient on the card the processor's to within 2 x 10^-5, as before, and now
  four steps of Adam too, with a gradient shared out over 160 rows, an embedding, a layer norm and a parameter
  left out of one step: each parameter after them the processor's.

181 launches a step became 117. On the same GTX 1650, PyTorch 2.6 with the same model, sizes and steps:

| 2,000 steps | Folio | PyTorch |
|:--|--:|--:|
| time a step | **3.1 ms** | 9.1 ms |
| loss at the last step | 1.377 | 1.521 |
| loss on the tenth of the text it never learned from | 1.735 | 1.720 |

The digit reader (§162) learns 10 rounds of 6,000 drawings in 0.11 s on the card, to PyTorch's 0.47.

**On the processor**, the digit reader took 3.0 s; PyTorch, 0.50. Two things in machine code take it to 1.41 s,
every number the same to the last bit:

- **Adam in one loop.** arrays.folio's `adam_step(p, g, m, v, rate, b1, b2, eps, t)` moves p, m and v in place:
  machine code's `rt_k_adam` goes over the numbers twice, first only to see nothing goes wrong (a NaN, a square
  root below 0, a division by 0, which Folio then does as it would), then putting each in, each step the one
  arrays.folio's own takes, in its order. It had been ten arrays made one after another, 2.4 ms for a 256 by
  256 layer.
- **matmul's threads kept.** §166 started a thread for each run of a multiply and waited for it to end: about
  0.6 ms on Windows, more than a 200 by 256 by 256 multiply's own work. Now the first multiply big enough starts
  one for each core but one, and each waits for its next run: it spins a while (a training loop's next multiply
  is soon), then sleeps on an event (Windows) or a futex (Linux), and its slot in `mm_pool` says when it's done.
  Whoever multiplies takes the pool; a second thread that wants it at once does its multiply alone. 200 by 256
  by 256 went from 1.15 ms to 0.40, and sharing out starts from 2^19 multiplies, not 2^21. A library, which can
  be unloaded with its threads waiting, still starts them for each run.

PyTorch is still ahead there: its numbers are 32-bit and MKL's, Folio's 64-bit and its own.

## 169. Lists that grow where they are, and `for each` without a copy

A program that turned 10 million numbers into floats and back, through memory.folio, took 241 ms, where C took
62. Most of it was lists: `add` to a full list made a block twice as big and copied the list into it, so a list
of 10 million had made blocks of 16, 32, ... 128 MB, each new memory the system had to give it page by page,
and the collector ran over them; `for each` copied the list it went through, 80 MB for 10 million numbers, so
the loop could change the list and still see it as it was; and memory.folio's `get_many` made its list of
zeros with `add`.

- **Growing where it is.** A list's numbers in a big block (pages of their own) that are the last of the heap's
  pages get the pages after them, never used and so 0, when the list is full: `rt_gc_extend`. No new block, no
  copy, and the block a `for each` holds stays where it is. A list that isn't last, as when two grow at once,
  is copied as before.
- **`for each` over the list itself.** When nothing in the loop can change a list (it sets variables and adds
  numbers to ones that hold numbers, in ifs and loops of the same, with no call, `say`, item set or try, and a
  `+` only of numbers, as text joined to a record could run its `shown`), and every item is a number
  (`rt_items_view` looks, and copies if not), it goes through the list's own numbers.

| 10 million numbers | before | now |
|:--|--:|--:|
| `add i * 0.5 to xs` | 71 ms | 30 ms |
| `for each x in xs`, adding them up | 34 ms | 18 ms |
| `get_many` of 10 million floats | 103 ms | 45 ms |
| the whole program | 241 ms | 145 ms (C 62, Rust 62) |

On Linux the same: `add` 176 ms to 80 under WSL, and `for each` 120 to 37.

- **Checked**: lists grown where they are and where they can't be (two at once), a loop that sets an item of the
  list it goes through still seeing it as it was, lists with an item that isn't a number, adding to the list
  gone through, nested loops and `stop`, each against the JavaScript engine, on Windows and Linux.
- **Calls**: `fib(32)`, 7 million calls, is 15 ms of work in Folio to C's 10, with C's numbers doubles too, as
  Folio's are, so the difference is in the call: the calls in progress counted, the function's number pushed
  for a mistake's trail, and its inputs kept in its frame. Keeping a function's inputs in registers is next.

## 170. Training as GPT-2 was trained: AdamW, a warmup and a cosine, clipping and dropout

gpt.folio trained with plain Adam at one rate. Most transformers are trained with four more things, and
learn.folio has them now, on the card and on the processor:

- **`adamw(parameters, rate, decay)`**: Adam, and each parameter of more than one row (the weights and
  embeddings, not a bias or a layer norm's row, as nanoGPT has it) times `1 - rate * decay` at each step, apart
  from its gradient. On the card it's in the launch Adam was already: each entry of `adam_many`'s table has a
  flag for it, and the factor is in the table's first bytes, where there was room.
- **`clip_gradients(opt, most)`**: at each step, when the square root of the sum of the squares of every
  gradient is more than `most`, each gradient times `most` over it, as PyTorch's `clip_grad_norm_`. On the card
  nothing waits for it: `sumsq_many` adds up the squares of every gradient into one number on the card, a warp
  at a time with one atomic add each, and `adam_many` reads that number and works out its own factor, so a
  step is still two launches and no copy back. `gradient_norm(opt)` gives the number, for a program that wants
  to see it.
- **`cosine_rate(s, steps, warmup, top, bottom)`**: up from 0 to `top` over the first `warmup` steps, then down
  to `bottom` along half a cosine. A program sets `opt's rate` to it at each step, as `opt's rate` was always
  read at the step.
- **`dropout(m, chance)`**, with `training(no)` to use a network and `training(yes)` to train it again: each
  number 0 at the chance, the rest over `1 - chance`, and the gradient through the same ones. On the card the
  choice is a hash of each number's place and a seed, one launch for the mask, with no random numbers to
  upload.

For gpt.folio, AdamW with a decay of 0.1, a warmup of 100 steps, a cosine down to a tenth and clipping to 1 took
the loss on text it hadn't seen from 1.72 to 1.64 in the same 2,000 steps, at a higher rate (0.006, where 0.003
was best for plain Adam), and the step still takes 3.0 ms. Dropout hurt at 2,000 steps (1.64 to 1.67), as a
model this small hasn't started learning the text by heart, and helped at 6,000 (1.66 to 1.59), so gpt.folio
uses 0.1 only past 3,000 steps.

- **Checked**: AdamW's decay against the sum worked out by hand, a bias not decayed, clipping to 1 of gradients 3
  and 4, the cosine at its ends and middle, and dropout's share and gradient, on every engine; on the card,
  AdamW and clipping over four steps against the processor's to a float's precision (and without clipping the
  card's numbers are 0.02 away, so the test would see it gone), and dropout's share of 100,000, its gradient, a
  new choice each time and nothing dropped while `training(no)`.
- **Writing** was already quick: 400 letters in 0.24 s, the model run over up to 64 letters for each one. A cache
  of each place's keys and values would save most of that, and isn't worth its size here.

## 171. Training on the processor, twice as fast

The digit reader learned its 10 rounds on the processor in 1.41 s, to PyTorch's 0.50. A step of it, 200 drawings
through layers of 256 by 256 and 256 by 10, took 4.0 ms, and its two big matrix multiplies were only 0.75 ms of
that. The rest was the small things around them, which, timed one at a time, were each slower than they had to be:

| a step's part | before | now |
|:--|--:|--:|
| `adam_step`, 65,536 numbers | 637 µs | 133 µs |
| relu's gradient: `above_zero`, then `times` | 474 µs | 137 µs, `relu_gradient` |
| `cross_entropy`, 200 by 10 | 310 µs | 73 µs |
| 200 by 256 times 256 by 10 | 183 µs | 73 µs |
| a turned copy of 200 by 256, for a gradient | 167 µs | none, `matmul_turned` |
| a new array of 51,200 zeros | 87 µs | 50 µs |
| the whole step | 4.0 ms | 1.64 ms |

- **Adam 4 at a time.** `rt_k_adam` works through the numbers with AVX, 4 to a register, each of the 4 the same
  multiply, add, square root and divide as one at a time, so the same bits; the check before anything is changed
  is a compare of the 4 at once, gathered over the whole pass and looked at once at the end.
- **relu's gradient in one go.** `arrays's relu_gradient(g, x)`, g where x is above 0 and 0 elsewhere, is one
  compare and a mask in `rt_k_binary`; `above_zero` is a compare and a mask too, where it was a branch for each
  number that, on numbers whose signs are as likely either way, went the wrong way half the time.
- **exp in machine code.** math.folio's `exp` is Folio: the nearest whole number of halvings, a 20-term series,
  then doubling back, 131 ns a call. `rt_k_exp` does the same steps 4 at a time, the doubling as a multiply by 2
  to the power of the halvings, which is exact while the numbers stay in the doubles' range; past 700 either way
  it leaves them to Folio. `arrays's exp` uses it, and learn.folio's `cross_entropy` on the processor is now
  arrays' `max`, `minus`, `exp`, `sum` and `divided_by` and a loop over the rows, not a loop over every number.
- **`matmul_turned(a, b)`**, a turned over times b, reads a where it is: the kernel steps along a's column for
  each term, not its row, and that step is kept for its threads with the rest. A layer's weights' gradient, x
  turned over times what came back, needed a turned copy of x first.
- **The last columns.** A matrix multiply does 4 rows by 8 columns at a time in registers, and the columns past a
  multiple of 8 one row at a time, out's row in memory, a load and a store for every term, each waiting on the
  last: for 256 by 10, the last 2 columns were nearly all of the time. They're 4 rows by 2 columns at a time now,
  each number added up in a register.
- **Room without a copy.** arrays.folio made every array's numbers by copying the first n of a list of zeros it
  kept, on top of the zeros the collector's new block already is. `rt_k_room` gives a new list that block; own
  kernels run with the program's lists to themselves, and the collector looks through the whole stack and every
  register, so the kernel can ask for it.

Each is still Folio's own numbers, to the last bit: tests run Adam over 1,003 numbers with AdamW's keep and
without, relu's gradient and slope, `exp` from -690 to 690 and past 700, and matrix multiplies of shapes with rows
past the fours, columns past the eights, a b too long to copy and enough to share over threads, normal and turned,
in machine code and on the JavaScript engine, and compare their bits.

The digit reader now learns its 10 rounds on the processor in **0.65 s**, from 1.41, to PyTorch's 0.50, still
99.4% right, the loss the same to the last digit shown. What's left is mostly what PyTorch does differently by
design: its numbers are 32-bit floats, 8 to a register where Folio's doubles are 4, its multiplies fuse a multiply
and an add, and its allocator hands back memory it hasn't zeroed. Folio's numbers are doubles, added in Folio's
own order, everywhere.

## 172. WebAssembly loops V8 can keep in registers, and a step count put right

The website runs programs on the WebAssembly engine, and its loops were 2 to 6 times as slow as the same loop in
plain JavaScript: 100 million rounds of `add i to total`, run again and again in one process, took 332 ms, to
JavaScript's 77, though `total` and `i` were already f64 locals (DESIGN §146) and each round was an f64 compare,
an add and a count of steps. A loop built by hand with the same instructions ran in 84 ms. What made the
difference was calls in the round that never happen: the check that a name has a value called `noValueYet` inside
an `if`, a division called `arithRest` for 0, and the count of steps called `refill` when it ran out. V8's
optimizing compiler keeps a loop's numbers in registers only when nothing in the loop can call out, taken or not.

- **Mistakes at the function's end.** Each function is now `block block`, its code, `return`, then the two
  mistakes: a name with no value yet, and a division by 0. A check in the code puts what the mistake needs in
  locals and branches there. Inside a `try` the mistake is still made where it is, as a branch out of a `try`
  would pass its handler; on the way out of a loop, its count of steps goes into the global first.
- **More steps outside the round.** A loop is two: the inner one runs rounds and counts down, and branches out
  to the outer one when its count runs out, which asks JavaScript for more and goes round again.
- **A count of steps put right.** A mistake that a `try` inside a loop caught, coming back from a call, left the
  loop counting from where it was before the call, as the steps the call took were in the global: a program
  limited to 500 steps did three times as many rounds on WebAssembly as on the VM and the JIT. After a `try`
  catches, the loop's count is now the smaller of its own and the global's, as a loop's `catch_all` already did;
  a test runs mistakes from loops caught further out under four step limits, and every engine stops at the same
  place.

wasm.folio does each the same way, and still makes wasm.js's bytes on every program the engines are tested
with, and itself; folio.wasm is made again, 2.14 MB where it was 2.05, as each of its functions has the
two mistakes at its end.

What it gains depends on V8 having optimized the code, and V8 optimizes a WebAssembly function for its next call,
never in the middle of one: there is no on-stack replacement. A program's top level is one function, called once,
so a Run on the website, or the first run in a process, goes through its loops in V8's baseline compiler from
start to end. Later runs of the same module, in the same process, get the optimized code:

| on the WebAssembly engine, Node.js | first run, before | first run, now | later runs, before | later runs, now | plain JavaScript |
|:--|--:|--:|--:|--:|--:|
| loop: 100 million rounds of `add` | 394 ms | 393 ms | 332 ms | 95 ms | 77 ms |
| float: 30 million of `1 / (i * i)` | 204 ms | 169 ms | 125 ms | 60 ms | 38 ms |
| primes | 314 ms | 287 ms | 89 ms | 85 ms | 58 ms |
| fib(32) | 166 ms | 162 ms | 134 ms | 126 ms | 23 ms |

In Chrome, on the playground, the loop's Run went from 740 to 840 ms to 620 to 700. A Run as fast as a later run
wants a program's loops in functions of their own, which V8 would optimize while they're called again (DESIGN
§173). fib calls a function V8 has already optimized, so it's what it was.

The JIT's call trail, the function and the place of each call in progress, is two arrays made at their full size
once (2,000, as deep as the JIT goes before the VM takes over), not grown: fib on the JIT 130 to 120 ms. Its
loops stay slower than WebAssembly's, as V8 boxes a number that a helper's other way could make text; that wants
the JIT to know which names only hold numbers, as WebAssembly does. (JavaScript has on-stack replacement, so the
JIT's first run is as fast as its later ones.)

**Native code.** memory.folio's `get_many` made its list by copying a million zeros and adding the rest one at a
time; it has `rt_k_room`'s block now (DESIGN §171): 10 million floats back from bytes in 18 ms, not 47, and the
floats program in 120 ms, not 150 (C 67). A call stays about 1.4 times C's: taking out the count of calls in
progress, the function's number in its frame or the call's number after it each saved about 2% of fib(32), and
each is what makes "too much recursion" come at the same depth as on every engine and a mistake's trail say
where each call came from. On Linux, under WSL, the new kernels give the JavaScript engine's numbers to the last
bit, and the digit reader learns on the processor in 0.8 s.

## 173. A top-level loop in a function of its own, called a chunk of rounds at a time

V8 makes a WebAssembly function's optimized code for the function's next call, and never switches to it in the
middle of a call. A program's top level is one function, called once, so its loops ran in V8's first, plain code
from start to end: 100 million rounds of `add` took 397 ms on a first run, where the same module run again took
92. A loop written by hand the same way, in a function called again and again for 65,536 rounds at a time, took
90 ms on its first run, whatever the chunk.

So each loop at the top level (an outermost one; a function's loops get optimized code when it's called again) is
now a function of its own:

- **The same code.** The new function has the top level's input and locals at the same places, so the loop's
  test and body are generated into it as they were, and a temporary the body needs is a new local after them.
- **Handed over in globals.** A global for each of those locals; the top level puts its locals in them before the
  first call, each call takes them at its start and puts them back as it returns, and the top level takes them
  back after the last. A call gives 1 to be called again, after 65,536 rounds, and 0 when the loop is done.
- **The count of steps** is the loop's own local, as before (DESIGN §172), from the global at each call's start
  and back into it as the call returns.
- **Mistakes.** The mistakes at the function's end put the locals back before they're made. A loop inside a `try`
  at the top level has its rounds in a `try` of their own too, whose `catch_all` puts the locals and the count
  back, and the top level's `catch_all` takes them, so the `try` sees what the loop changed. Without a `try`
  around it, a mistake that leaves the loop ends the program, and its rounds aren't in a `try`: V8's code for
  the float loop took 94 ms in one and 63 out of one. A `return` at the top level is a mistake before the
  program runs, so a loop never needs to give one back.

wasm.folio does each the same way, and makes wasm.js's bytes on every program the engines are tested with, and
itself; folio.wasm is made again, 2.19 MB. A test runs five programs on every engine, each unlimited and under
two step limits: loops past 65,536 rounds whose variables are used after, mistakes caught around a loop (a
division by 0, a name with no value yet) and inside one, `stop`, a nested loop, a function made in a loop, and
`for each`, `repeat` and `while`; taking out any of the hand-overs (the locals back after the loop, back as a
mistake leaves it, or back before either mistake at the end) makes it fail.

| on the WebAssembly engine, Node.js | first run, before | first run, now | later runs, before | later runs, now |
|:--|--:|--:|--:|--:|
| loop: 100 million rounds of `add` | 397 ms | 144 ms | 92 ms | 111 ms |
| primes | 292 ms | 148 ms | 87 ms | 95 ms |
| float: 30 million of `1 / (i * i)` | 169 ms | 98 ms | 60 ms | 64 ms |
| fib(32) | 162 ms | 162 ms | 127 ms | 129 ms |

On the playground in Chrome, a Run of the loop went from 674 ms to 449, and run again from 374 to 172; the float
loop from 190 to 140. Later runs of the same module are a little slower, the count of a chunk's rounds being one
more thing each round does; folding it into the count of steps would change what every call inside a loop hands
over, and wasn't worth that here.

## 174. Small whole numbers added and compared in place, on WebAssembly

After DESIGN §173, fib(32) on the WebAssembly engine still took 162 ms on a first run, to plain JavaScript's 23.
Taking out a call's parts one at a time (the check that it's a function, the count of its inputs, the count of
steps, the trail a mistake shows) saved about 5% each: the time was in what fib does between its calls. `n is
less than 2`, `n - 1`, `n - 2` and the `+` of the two calls' answers were each a call into the runtime, which
looked at what both sides were, and the `if` called another to see its yes or no; and every read of `n` checked
it had a value, which an input always has.

- **A whole number written in the program** (`1` in `n - 1`, `2` in `n is less than 2`, from -2^30 up to 2^30)
  is an `i32.const` beside the other side, which, when it's an i31 (a number from 2 up as unsigned, as 0 and 1
  are no and yes), is taken away, added or compared there and then: a sum that's still an i31 (and not 0 or 1,
  which are boxes of their own) goes on as one. Anything else goes to the runtime as before, with both sides as
  they were, so what it says (a number that's a box, text, an amount, a mistake) is what it said. `is` keeps a
  written 0 or 1 out of it: those are boxes, never the i31 no or yes.
- **A comparison an `if` or a `while` tests** is its i32, with no box made and no call to see it's a yes or no.
- **An input** is read with no check that it has a value.

Inlined beside any two values, not only beside a written number, it was no faster, and folio.wasm, the compiler
the website runs, grew from 470 KB to 562 squeezed: the compiler is made of this code too. Beside a written
number only, folio.wasm is 445 KB squeezed (2.07 MB), smaller than before, as each written number it uses this
way is a constant where it was a global's box.

| on the WebAssembly engine, Node.js | first run, before | first run, now | later runs, before | later runs, now |
|:--|--:|--:|--:|--:|
| fib(32) | 162 ms | 145 ms | 127 ms | 110 ms |
| primes | 148 ms | 136 ms | 95 ms | 89 ms |

wasm.folio does the same, and makes wasm.js's bytes. A test runs both ends of what an i31 holds, sums that come
out 0 or 1, yes and no beside numbers, text, and mistakes, on every engine; taking out the check for a sum past
an i31, or for yes and no, makes it fail. The rest of fib's time is the call itself: a function value called
through `call_ref`, which V8 doesn't put in line. A call to a function the program never sets again could be a
direct `call`, and inputs only ever given numbers f64s; both are bigger changes to both compilers.

## 175. \r is an r, and folio check says so

Text has two escapes for characters that can't be typed into it, `\n` and `\t`, and a backslash before anything
else stands for what comes after it, so that `\"`, `\\` and `\{` work: SPEC.md promises it, for every Folio 1.
`"\r"` is therefore an `r`, and code that wrote it for a carriage return did something else, with no word from
Folio. Writing the tokenizer package, a line's end trimmed with `"\r"` took the `r` off `for` in a BERT
vocabulary, and the Bob exercise's example answer, trimming its spaces, trimmed `r`s.

Making `\r` a carriage return would be the fix, and it was made, then taken back: a program that wrote `"\r"` and
meant the `r` it has always been would change, and Folio 1 keeps every program meaning what it meant
(VERSIONING.md). So `\r` stays an `r` in Folio 1, and is a carriage return for Folio 2 to make.

What Folio 1 can do is say so. Both of Folio's readers, folio.js's and compiler.folio's, note each `\r` in text,
in a value in text too, as they read it, and `folio check` and the playground's checker give a warning there: it
"looks wrong", a kind of its own that, as "unused" does, leaves folio check ending with 0. The language server
shows it as you type, as it shows the rest. Making the letter after any backslash a warning would be too much:
`\}` beside `\{` (as properties.test.folio has it) and `\'` mean what they say.

The trying-out found that "\r" was written for a carriage return in three of Folio's own files: gpu.folio's PTX
reader (where it made `r` a space), compiler.folio's JavaScript strings, and the Bob example; each now makes a
carriage return from its byte, `(list of 13) as bytes as text`, which is what Folio 1 has for one, and Bob's tests
have exercism's "other whitespace" case, which the old example fails. A test runs `\r` beside `\n` and `\t`, in a
value in text, `\\r` and `\q` on every engine, in the compiler written in Folio and through tidy, with check()'s
warning at each place; folio.exe's check says what check() says of the same program.

## 176. Kernels of your own on the graphics card

gpu.folio ran about 45 kernels, written in it in PTX, NVIDIA's assembly for the card, which the driver makes the
card's own as it loads: the maths learn.folio and the GPT need. A program could use those and nothing else, so
the card was there for what gpu.folio had thought of, and for nothing a program needed of its own. CUDA's way is
to write a kernel in C++ and compile it with nvcc, from the CUDA toolkit; gpu.folio needs only the driver, and
the driver takes PTX.

- **kernel(ptx, name)** loads a module of PTX, once for its text however many of its kernels are asked for, and
  finds the .entry called name. Each input's type comes from the .entry's own `.param` lines, so a launch packs
  each as the kernel reads it, with nothing more said. A name the PTX hasn't is a mistake that lists the ones
  it has; PTX the driver can't take is a mistake with the driver's own log, which says the line and what's
  wrong there: the same loading gpu.folio's own code has, now one function for both.
- **launch(kernel, grid, block, inputs)**, and **launch_with** for bytes of shared memory a block, run it on a
  grid of blocks of threads, each a number or 1 to 3 axes. Numbers or bytes on the card go to a 64-bit input as
  where they are; a number to `.f32` as a float and to `.f64` as a double; a whole number to the rest, checked
  against its type's range by memory.folio, which writes each input into its 8 bytes. A count, a type, a range,
  a whole number or a grid that's wrong is said before the card sees it, naming the input and its type. A
  launch doesn't wait for the card, as CUDA's don't: the next download, download_bytes or finish() does, and a
  mistake the kernel made (writing where it mustn't) is said there; after it the card does nothing more for the
  program, as CUDA leaves a context.
- **upload_bytes, room and download_bytes** keep bytes on the card, as a kernel wants for whole numbers or
  anything else that isn't 32-bit floats; memory.folio puts C's kinds of number into bytes and takes them out.
  `free` gives bytes back to the driver at once, as they don't come in the sizes training reuses.

A launch of a kernel with four inputs takes 14 µs on a GTX 1650, as long as gpu.folio's own `plus` (most of it
the driver's), so a kernel of your own costs nothing more than one of gpu.folio's.

A test builds a program for the processor that loads six kernels from one module and checks each against what it
must give: a saxpy past a block's edge, whole numbers squared in bytes, a 2D grid of 2D blocks, sums in shared
memory, a double, a byte and a 64-bit whole number as inputs, and a kernel with no inputs on a 3D grid; then every
mistake a launch can make, a name the module hasn't, PTX with an instruction that isn't one, and a kernel that
writes to address 0. Putting a float input as a double, or launching with no shared memory, makes it fail. PTX is
what's needed to write one, which is the card's assembly; kernels written in Folio itself, compiled to PTX, would
be the next step, and Vulkan's compute for cards that aren't NVIDIA's after that.

## 177. A list in brackets

`list of 1, 2, 3` takes every comma after it, so a list given to a function with more after it has to be put in
brackets of its own: `f((list of 1, 2), 3)`, or the list takes the 3 and f gets one input. Writing the four
packages of 2026-11-07 (pdftext, tokenizer, vectors, rag), that was the mistake made most: a call that said it
needed 4 inputs but got 2, a dozen times, and a test that passed a list it didn't mean to.

`[1, 2, 3]` is now a list, as `list of 1, 2, 3` is, and it ends at its `]`: `f([1, 2], 3)` gives two inputs.
`[]` is an empty list, a comma may come before the `]` (as a list over several lines has one), and
`[x * 2 for each x in xs where x is greater than 1]` builds one, as `list of` does. It's the same list to every
engine: both of Folio's readers, folio.js's and compiler.folio's, make the `list` (or the built list) `list of`
makes, so nothing after reading changed, and the compiler written in Folio writes the same JavaScript as the
JIT, to the byte. Tidy writes no space after `[` or before `]`, in folio.js and in folio.folio.

A `[` was a mistake before ("make a list with 'list of 1, 2, 3'"), so no program that ran means anything else
now, as Folio 1 promises (VERSIONING.md). `list of` stays as it is: making it end at a bracket would change what
programs that ran mean. A `{[` in text is still a `{` and a `[`, not a value, as it was.

A test runs lists in brackets on every engine (empty, inside one another, as one input of two, over lines, built
`for each`, in `for each`, inside `list of`), has the compiler written in Folio write the JavaScript the JIT
writes for them and for their mistakes, and tidies them; a machine code case does the same.

## 178. What kind a value is

Folio had no way to ask what kind a value is. A program that read JSON, where a field may be a number, text or a
list, had to try something only one kind allows and catch the mistake: the packages of 2026-11-07 did that in a
dozen places, and the language's own `shown` does it with a function whose input says `as a function`.

`x is a number` asks it now, and so do `x is a list`, `a record`, `a dictionary`, `a function`, `bytes`,
`some text`, `either yes or no`, and `x is a dog`, a record the kind dog made; `is not` turns each round. Each
is the same test an input's kind is (`with x as a number`), so a number is a number and not an amount, and on
every engine it's one: the VM's, the JIT's and WebAssembly's through vm.js's `fitsKind`, machine code through the
routine that checks inputs, `rt_fits_kind`. `a dog` is a function of the language's own, `made_by`, which looks
at the record's `kind` field; a puppy made `from dog(...)` is a puppy, not a dog.

`x is text` and `x is yes or no` would read best, but they meant something already: `is text` compares x with a
variable called text, which many functions have as an input, and `x is yes or no` is `(x is yes) or no`. Folio 1
keeps what lines that ran mean (VERSIONING.md), so text is `some text` and yes or no is `either yes or no`;
`x is a text` is a mistake that says to write `some text`.

Every phrase was a mistake before, with one care. A say's values stand side by side, so `say x is a dog` said
`x is a`, then `dog`, where the program had variables called a and dog. In a say, outside brackets, a phrase
that starts with a name (`a dog`, `a function`, `some text`, `either yes or no`) keeps that meaning in a file
that may give the name a value: one where the word is written anywhere but in a phrase of the language, or
that uses another file without `as`. Elsewhere, and in brackets, it's always what kind the value is. `a number`,
`a list`, `a record` and `a dictionary` need no care: `say x is a number of "5"` and the like, where the next
word makes them a value, keep their meaning, and anywhere else they were mistakes.

A test runs every kind against every kind of value on every engine, the say that keeps its meaning, and the
compiler written in Folio writing the same JavaScript; a machine code case does the same.

## 179. add to a field or an item

`add x to r's items` was a mistake: add took a variable, and a field had to be read into one, added to and set
back, three lines for one thought. It was the second most common slip writing the packages, after the list in
brackets. Now `add` takes what `set` takes: a variable, a field (`r's items`, `count of r`, `self's total`) or an
item (`item "a" of counts`, `byte 3 of block`).

Both readers write it as what a program would write: what's added, then what has the field or item and its
item's number, each worked out once, then what's there read into a variable of the program's own, added to as
add adds to a variable, and set back. So a list grows where it is, which every other variable holding it sees,
and a number or text is changed in its record. No engine changed. A field that isn't there is the mistake
reading it is, and adding text to a number the mistake add makes of it.

## 180. Text on the lines after `"""`

Text was written on one line, with `\n` for each new line, which made a page of HTML, a prompt for a model or a
block of JSON hard to read and harder to change. `"""` at the end of a line now starts text written on the lines
after it, up to a line with only `"""`:

```text
set prompt to """
    You answer from these notes only.
    Say "I don't know" when they don't say.
    """
```

Each line is the text as it's written, less the closing `"""`'s indent, so the text can be indented with the
code; a line of only spaces is an empty line, and a line that starts left of the closing `"""` is a mistake.
Nothing in it is a value or follows a `\`: `{`, `\` and `"` are themselves, as JSON and regular expressions want.
For a value in it, join it on or use `replace`.

`"""` was the empty text and then a text that isn't closed, at a line's end a mistake, so no program that ran
means anything else; with anything after it on its line (`"""a"""`, `""""""`) it's the texts it was. Both
tokenizers read it; tidy, in folio.js and folio.folio, moves the text's lines with its closing `"""` to 4 in from
the line that opens it, so what the text holds doesn't change. A text with no closing line is a mistake the shell
waits on for more lines. VS Code's grammar colours it; tree-sitter's still reads it as the texts it was.

## 181. Folio's own words as field names

`length`, `number`, `read`, `keys`, `list` and the other words of the language couldn't be names, so a record from
JSON with a field called `length` or `number` couldn't be read, and a package couldn't call a field what it is.
After `'s`, in `record with`, and after `in order by`, no phrase of the language can start, so any word can be a
field's name there now: `r's length`, `record with read yes, number 3`, `set r's list to xs`, `add 1 to r's
length`, `rows in order by number`. Each was a mistake before. Variables, inputs and functions keep the rule,
since there a word starts its phrase, and `length of r` is still the length.

## 182. Operations of your own that train

learn.folio's operations each know their gradient, and a model could only be made of them. A new activation, a
loss of your own, or a kernel written for the card (DESIGN §176) couldn't train: backward() didn't know how to send
a gradient through it.

`custom(inputs, forward, backward)` is an operation of your own. forward is given the inputs, a list of matrices,
and gives the result; backward is given the result's gradient, the inputs and the result, and gives each input's
gradient, or nothing for one it doesn't change. The result is remembered as learn's own results are, so
backward() calls the function at its turn and adds what it gives to each input that a parameter went into. Both
functions are given the matrices as they are, sharing their numbers, but remembered by nothing, so they can use
learn's operations freely, or launch kernels of their own on each matrix's data. As PyTorch's
`torch.autograd.Function` has it, with a forward and a backward, and nothing else to register.

A test checks the gradients through two of them, x cubed and a product with a matrix that learns nothing, against
the slopes worked out by nudging each number, on every engine and in machine code; and on the card, x squared
written as two PTX kernels, its forward and its backward, gives the gradient 2 x w exactly and trains until x
squared is its target. A backward that gives a gradient of the wrong shape, or a forward that gives no matrix, is
a mistake that says so.

## 183. 16-bit floats in safetensors

Models on Hugging Face keep their weights in 16-bit floats more often than not: half floats (F16), or brain
floats (BF16), a float's first 16 bits. learn.folio's load() read F32 and F64 only, so it couldn't open them, and
save() wrote twice the room needed.

load() reads F16 and BF16 now, each pattern's number looked up in a table of all 65,536 made the first time, and
save(named, file, "F16") or "BF16" writes them, each number rounded to the nearest pattern, a half to the even
one, as IEEE 754 and PyTorch round; too big is infinity. Rounding a number to the nearest whole one with Folio's
comparisons, which go to 15 digits, could be wrong for a number a hair from a half, so it adds 2^52 and takes it
away, which the processor rounds exactly. A test saves ten numbers each way, among them 0.1, 65,504, the smallest
half float and 70,000, and checks the bytes against Python's struct (F16) and against rounding worked out exactly
(BF16), and what load() gives back.

The card still works in 32-bit floats: training in 16 is for cards with the arithmetic for it, which a GTX 1650
has only in part. folio-tokenizer's gpt.folio, a GPT of 931,584 parameters on BPE tokens the package learns from
its text, saves its weights in F16: 1.9 MB, not 3.7.

## 184. Where fib's time went on WebAssembly

fib(32) took 146 ms on a first run on the WebAssembly engine, and 114 run again in the same process, where
JavaScript takes 78 and machine code 23. Each call goes through `call_ref`, a closure's function, so the guess was
that calling a function straight, by its index, would be the next step. It was tried: a call to a function made by
one `to` at the program's top level, whose name nothing else sets, checked to have its value and then called by
`call` with the scope from its closure, or, in its own code, with its own. fib's 7 million calls went that way, and
it took the same time, 138 ms with it and 137 without, 105 and 103 again: V8 sees that each `call_ref` here always
calls the same function, and calls it as directly. It was left out.

A profile said where the time was: a third of it in three small functions of the runtime's, `box`, `add` and `sub`,
called from fib. `n - 1` and `n - 2` are worked out in place on small whole numbers (DESIGN §174), but 0 and 1 are
boxes (the i31 values 0 and 1 are no and yes), so an answer of 0 or 1 went to the shared code, which checked both
sides again, worked the sum out in floats, and boxed it. Most of fib's calls are near the bottom of its tree,
where n - 1 and n - 2 are 0 or 1. Now an answer of 0 or 1 goes straight to `box`, which gives the box made once
for it: fib(32) takes 138 ms on a first run, not 146, and 104 run again, not 114. Adding two values worked out
in place as floats, where neither side is written in the program, was tried too and made no difference, as V8
already makes the call cheap; it was left out too.

Both back ends write the same bytes, as a test holds them to, and folio.wasm makes itself again.

## 185. Training on the processor, faster, and in floats when asked

On a Ryzen 5 4600H, digits-learn.folio took 0.65 s on the processor for 10 rounds of 6,000 pictures, where PyTorch
takes 0.50; on a GTX 1650 Folio was already faster than PyTorch. A batch of 200 took 1.8 ms: the two large
matmuls 45% of it, Adam's step 16%, and the rest elementwise work and the loss.

Three things were tried and measured no faster, and are left out: two terms at a time in matmul's inner loop (the
processor wasn't short of instructions to run), 6 threads (one for
each core) instead of 8, which was 3 to 5% faster but needs the cores counted on every processor, and the pool's
threads spinning longer between multiplies, which was slower, as they took time from the thread with the rest of
the work.

What helped:

- **Each kernel's numbers checked 4 at a time.** Before a matmul, machine code checks that every number it's given
  is a number, as anything else is for Folio to say a mistake about. That was a load, a compare and a branch a
  number, 116,000 of them for a 200 by 256 by 256 matmul: now, with AVX, it's 4 at a time, any NaN among them
  kept and looked at once at the end.
- **Elementwise work 4 at a time (numbers_binary).** `+`, `-`, `*`, the larger and smaller of two, relu, relu's
  gradient and a copy, where a's numbers are side by side and b's are too or are one number, as plus, times,
  add_row and relu have them, are done 4 at a time with AVX. Each of the 4 is the one at a time's to the bit, as
  vaddpd and vmaxpd work each place as addsd and maxsd do; a NaN that would make the one at a time give it to
  Folio still does.
- **matmul in floats, when asked (`use_floats(yes)`).** The graphics card works in 32-bit floats, about 7 digits,
  and so does PyTorch on the processor. `arrays's matmul_floats(a, b)` and `matmul_turned_floats(a, b)` round each
  number to a float and add each sum up in floats, 8 to a register: b's columns made floats once into room kept
  from one multiply to the next, then each four of a's rows made floats once and multiplied by each sixteen of
  b's, a float multiply then a float add a term at a time, on every core as matmul is. Rows past the fours and
  columns past the sixteens are worked out in Folio's own numbers, so nothing is less than a float's 7 digits.
  learn.folio's `use_floats(yes)` uses them for every matmul on the processor. On the JavaScript engines, and with
  BLAS, they're matmul.

A 200 by 256 by 256 matmul takes 0.24 ms in floats, not 0.40; 1,024 by 1,024 by 1,024, 14 ms, not 23 (153
GFLOPS, not 96). A batch of the digit reader takes 1.5 ms, not 1.8, and 1.25 ms in floats; digits-learn.folio on
the processor takes 0.60 s, and 0.52 s with floats, beside PyTorch's 0.50, still 99.4% right. Adam's step goes
over every parameter twice, to change nothing if anything goes wrong; a first pass that looked without the square
root and the division was tried and made no difference, as the step waits on memory, not on those.

Tests check matmul_floats against matmul to 7 digits for shapes on and off the blocks, turned and not, in machine
code and on every engine, where it's matmul; numbers_binary's every operation 4 at a time against Folio's own,
to the bit, with b one number or a row, and a NaN in the middle of the fours; and learn's gradients through
matmul in floats against the slopes worked out by nudging.

## 186. ONNX outputs kept where ONNX Runtime made them

folio-ask, a program that answers questions from a folder of documents, writes its answers with
Qwen2.5-0.5B-Instruct (int8, 512 MB) through onnx.folio. Each token is a run of the model, given the keys and
values of every token before it (24 layers, two of each, 1 by 2 by the tokens so far by 64) and giving them back
with one more. `run` made every output an array of Folio's numbers and every input a tensor again, so each token
carried the whole cache out of ONNX Runtime and back in, and copied each input twice on the way (`array` copied an
array it was given, and `numbers_of` copied its numbers again). On a Ryzen 5 4600H, after a prompt of 662 tokens,
a token took 277 ms at best, and reading the prompt 7.3 s. (Each time here is the best of three runs, taken in
turn: on this laptop the same run takes up to half again as long from one time to the next.)

- **Outputs kept (`run_keeping`).** `run_keeping(model, inputs, names)` runs the model as `run` does, but each
  output it names stays where ONNX Runtime put it: an `onnx_value` record holding its OrtValue, shape and type. An
  ONNX value given to `run` or `run_keeping` as an input goes in as it is, after a check that it's the type the
  model takes. The writer keeps every `present.*` and the logits, gives the presents back as the next token's
  `past_key_values.*`, and releases the ones before.
- **Only what's wanted read (`numbers_from`).** The logits are 151,936 numbers for each token given, so a prompt
  read 64 tokens at a time made 9.7 million numbers a run, of which the writer wants the last row.
  `numbers_from(value, first, count)` copies those `count` numbers from the tensor's memory and converts only
  them. `array_of` reads them all, and `shape_of` says the shape.
- **Given back (`release`).** A kept value holds ONNX Runtime's memory until `release`, which marks it released:
  using it again is a mistake that says so, and releasing it again does nothing.
- **No copies of an array given.** `run` takes an array's own numbers, which it reads and doesn't change, where it
  made two copies.

A token went from 277 ms to 189, and reading the prompt from 7.3 s to 4.6. Of the 189 ms, about 2 are Folio's: the
inputs, the last row read, and picking the most likely token from it. The rest was ONNX Runtime, and its own
time had a cause of its own: the model keeps its table of token vectors (151,936 by 896) as 8-bit whole numbers,
and uses it twice, to look up each token's vector and, turned, to make the logits. ONNX Runtime keeps a
DequantizeLinear on a weight as it is, so as not to break the patterns it fuses, so the whole table was made
floats again on every run: 136 million numbers.

- **Settings for a session (`load_with`).** `load_with(file, settings)` makes the session with a dictionary of
  settings: `"threads"` (SetIntraOpNumThreads), `"optimization"` (`"none"`, `"basic"`, `"extended"` or `"all"`,
  SetSessionGraphOptimizationLevel) and any of ONNX Runtime's session settings by name (AddSessionConfigEntry,
  the C API's 131st function, which onnx.folio asks for from version 4 of the API, so an older ONNX Runtime says
  it doesn't have it rather than calling what isn't there). With `"session.disable_quant_qdq"` set to `"1"`,
  ONNX Runtime folds the DequantizeLinear of a weight into a weight of floats once, when the model's loaded.
  It's a setting, not the default: it takes more memory, and a model made to be fused that way is faster with
  the patterns kept.

With it, a token takes 49 ms and the prompt 2.5 s, 5.6 and 2.9 times as fast as before. Loading takes as long,
within the noise (4.4, 4.6 and 4.6 s at best), and the program 2.8 GB at most instead of 2.4. Two things found on
the way are the model's and Windows' ONNX Runtime's, not onnx.folio's, and folio-ask works round them: ONNX Runtime
1.17 reads ONNX's format up to 9, and onnx-community's export says 10 while using nothing 10 added; and with nothing
in the cache yet, it let each of several tokens given at once see the ones after it, so the writer gives the first
token alone.

Tested in machine code, with a model the test writes that's relu(x + 1) of 3 numbers: an output kept, its shape,
two of its numbers and all of them, given back as an input, kept again and read, released twice, and shown once
released; and a released value read, a double given where a float is taken, numbers past the end, an output the
model doesn't have, a setting it doesn't know, a negative number of threads, and a list where an ONNX value is
wanted, each with what it says.

## 187. math.folio's sqrt, the processor's own

Five heavier programs, written alike in Folio and in Rust (rustc -O) and each giving the same output, were timed
on a Ryzen 5 4600H, the best of three runs, less an empty program's time: n-body (500,000 steps of 5 planets,
records of numbers), binary-trees (depth 16, records made and dropped), spectral-norm (n = 1,000), fannkuch-redux
(n = 10, a list's items swapped) and counting the pieces of 1 to 6 letters of a million letters (dictionaries
and text). Folio took 4.9 to 5.8 times as long as Rust on three, was faster on binary-trees (491 ms to Rust's
659, whose every node is a call to the system's allocator), and took 55 times as long on n-body: 1,201 ms to
Rust's 22.

n-body takes a square root ten times a step, 5 million in all, and math.folio's sqrt works it out in Folio: the
number brought between 1 and 4 by powers of 4, six rounds of Newton's method, and the last step settled by
Dekker's exact product, so that it gives the double nearest the true root, as a processor's own does. That's
dozens of operations and three loops where sqrtsd is one instruction, and sqrtsd gives the same double, as
IEEE 754 has every square root rounded to the nearest.

- **sqrt by sqrtsd.** math.folio names a function of Folio's own (§118), `use the library "folio"`'s
  `number_sqrt`, and its sqrt, once it has made sure the number isn't below 0 (comparing anything but a number
  with 0 is a mistake, so it's a number by then), gives what that gives. machine.folio makes the call's body two
  instructions, the input loaded and sqrtsd, rather than a C call; nothing is loaded or asked for. On the
  JavaScript engines, which can't call a library, a try finds it isn't there as math.folio starts, and sqrt works
  it out in Folio as before.

n-body went from 1,201 ms to 412, 19 times Rust's time instead of 55, with the same output to the last digit.
The rest is reading and setting records' fields, whose values can be anything, so each sum looks at what it was
given; that's for another time.

A test runs a program in machine code and on the JavaScript engine and wants the same output: the roots of 0, 1,
2, 3, 16, 0.1, a third, 2^1000, 10^300, 2^-1074, 2^-600 and a number of 15 digits, each with r * r - x, which a
root a step out would change; a sum of 100,000 roots; and the mistakes for -1, text and an amount.
