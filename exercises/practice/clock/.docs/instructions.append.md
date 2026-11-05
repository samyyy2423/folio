# Instructions append

## In Moth

`create(hour, minute)` gives a clock, which `say`, and a value in text (`"{clock}"`), show as `08:00`: a record of a kind with a `shown` function does.

`add_minutes(clock, minutes)` and `subtract_minutes(clock, minutes)` give the clock so many minutes later or earlier, and `equal(a, b)` gives yes if two clocks show the same time. Hours and minutes can be any whole numbers, below 0 too: a clock goes round.

Write it in `clock.moth`, and run the tests with `moth test clock.test.moth`.
