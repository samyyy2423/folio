# Instructions append

## In Moth

`square(n)` gives how many grains are on square `n`, and `total_grains()` how many there are on the whole board. The numbers grow past the 15 digits a Moth number keeps, so give them as text: `use "big.moth"` works with whole numbers of any size, as text.

A square that isn't from 1 to 64 is a mistake: `fail with "square must be between 1 and 64"`.

Write it in `grains.moth`, and run the tests with `moth test grains.test.moth`.
