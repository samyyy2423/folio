# Testing

You want to know your code does what you meant, now and after every change. Moth's tests are functions whose
names start with `test_`, in files ending in `.test.moth`, and `expect` says what should be so; `moth test`
runs each in a run of its own and says which failed, where, and what was there instead.

## The code

A shop's prices, with a discount for bigger ones:

```moth file=prices.moth
# a price with the shop's discount: 10% off at 100 or more, 20% off at 500 or more, to the cent
to discounted with price
    if price is less than 0
        fail with "a price can't be below 0, not " + price
    end
    set rate to 0
    if price is at least 500
        set rate to 0.2
    else if price is at least 100
        set rate to 0.1
    end
    return (price * (1 - rate) * 100 rounded) / 100
end

# the total of a basket, a list of records with a price and how many
to basket_total with basket
    set sum to 0
    for each line in basket
        set sum to sum + discounted(price of line) * count of line
    end
    return sum
end
```

## Its tests

`use` the file `as` a name, and write a `test_` function for each thing it should do. `expect` takes any
comparison; a `try` checks a mistake is the one it should be.

```moth file=prices.test.moth
use "prices.moth" as shop

to test_no_discount_under_100
    expect shop's discounted(99.99) is 99.99
end

to test_ten_percent_from_100
    expect shop's discounted(100) is 90
    expect shop's discounted(250) is 225
end

to test_twenty_percent_from_500
    expect shop's discounted(500) is 400
end

to test_a_basket
    set basket to list of (record with price 10, count 3), (record with price 200, count 1)
    expect shop's basket_total(basket) is 210
end

to test_a_price_below_0_is_a_mistake
    try
        shop's discounted(-5)
        expect "a mistake" is "no mistake"
    if it fails with why
        expect why is "a price can't be below 0, not -5"
    end
end
```

```console
$ moth test prices.test.moth
✓ test_no_discount_under_100
✓ test_ten_percent_from_100
✓ test_twenty_percent_from_500
✓ test_a_basket
✓ test_a_price_below_0_is_a_mistake
5 passed
```

## When a test fails

A test is often wrong about the edges. This one thinks 499.99 is in the top band:

```moth file=edge.test.moth
use "prices.moth" as shop

to test_just_under_500
    expect shop's discounted(499.99) is 450
end
```

```console
$ moth test edge.test.moth
✗ test_just_under_500
    edge.test.moth:4:5: expected 449.99 to be 450
        expect shop's discounted(499.99) is 450
        ^
0 passed, 1 failed
```

It says the line, both sides of the comparison, and ends with 1, so a script or CI stops there. Here the code
is right and the test is wrong: 499.99 is under 500, so it's 10% off.

## Testing what's always so

A test of a few prices checks those prices. A test of what must be so for *every* price checks many, picked at
random, and finds the ones you didn't think of:

```moth file=properties.test.moth
use "prices.moth" as shop

# whatever the price, the discount never makes it more, nor below 0, nor takes more than a fifth
to test_any_price
    repeat 1000 times
        set price to (random number from 0 to 100000) / 100
        set paid to shop's discounted(price)
        expect paid is at most price
        expect paid is at least price * 0.8 - 0.005
    end
end

# a cent more never costs less
to test_a_higher_price_never_costs_less
    for each cents from 9900 to 10100
        set price to cents / 100
        expect shop's discounted(price + 0.01) is at least shop's discounted(price)
    end
end
```

```console
$ moth test properties.test.moth
✓ test_any_price
✗ test_a_higher_price_never_costs_less
    properties.test.moth:17:9: expected 90 to be at least 99.99
            expect shop's discounted(price + 0.01) is at least shop's discounted(price)
            ^
1 passed, 1 failed
```

The second found something no single example showed: 99.99 costs 99.99, and a cent more costs 90. That's the
discount doing what it says, but a shop may not want a customer to pay less by buying more; a test like this
is how you find out to ask. The first test picks a different thousand prices each run; the second goes
through every cent from 99 to 101, so when it fails, it fails again the same way when you look.

## Every test

`moth test` with no file runs every `.test.moth` file in the folder and the folders inside it, each named
before its tests, then how many passed and failed in all:

```console
$ moth test
edge.test.moth
✗ test_just_under_500
    edge.test.moth:4:5: expected 449.99 to be 450
        expect shop's discounted(499.99) is 450
        ^
prices.test.moth
✓ test_no_discount_under_100
✓ test_ten_percent_from_100
✓ test_twenty_percent_from_500
✓ test_a_basket
✓ test_a_price_below_0_is_a_mistake
properties.test.moth
✓ test_any_price
✗ test_a_higher_price_never_costs_less
    properties.test.moth:17:9: expected 90 to be at least 99.99
            expect shop's discounted(price + 0.01) is at least shop's discounted(price)
            ^
6 passed, 2 failed
```

Run it in CI as it is: it ends with 0 only when every test passed. `moth coverage` says which lines the tests
never ran.

## See also

- Every library in [the standard library](https://samyyy2423.github.io/moth/docs/) has a `.test.moth` file of its own, which `moth test` runs
  on every push: [stats.moth's](https://github.com/samyyy2423/moth/blob/main/tools/stats.test.moth) is a
  good one to read.
