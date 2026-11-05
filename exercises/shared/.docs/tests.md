# Tests

Each exercise's tests are in the file ending in `.test.moth`. In the exercise's folder, run them with:

```text
moth test
```

`moth test` runs each function whose name starts with `test_`, each in a run of its own, and says which
passed (`✓`) and which failed (`✗`), with the line of the `expect` that wasn't so and what was there instead:

```text
✗ test_year_divisible_by_100_not_divisible_by_400_in_common_year
    leap.test.moth:23:5: expected yes, but got no
        expect not leap's leap_year(2100)
        ^
...
6 passed, 3 failed
```

It ends with 0 when every test passed, and 1 when one didn't. Write your solution in the file the exercise
gives you, keeping the names of its functions: the tests `use` it, as `use "leap.moth" as leap`.
