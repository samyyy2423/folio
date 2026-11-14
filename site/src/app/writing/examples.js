// The programs the Writing Folio page shows, each with what it says (site.test.mjs runs every one on Folio's
// engine and holds it to that). `files` are the other files a program uses, by name.

export const LOGIC = [
  {
    id: "values",
    title: "Values and names",
    text: "set gives a name a value. Lists, records and dictionaries hold more than one. add puts a value on the end of a list, or adds to a number.",
    code: `set name to "Ada"
set scores to list of 70, 90, 55
set sam to record with name "Sam", age 21
set ages to dictionary where "Ada" is 36, "Alan" is 41

add 80 to scores
say name " has " length of scores " scores"
say sam's name " is " sam's age
say item "Alan" of ages`,
    says: ["Ada has 4 scores", "Sam is 21", "41"],
  },
  {
    id: "deciding",
    title: "Deciding",
    text: "if, else if and else, ended by one end. Comparisons are words: is, is at least, is less than. match picks one of several cases.",
    code: `set total to 215
if total is at least 200
    say "We won!"
else if total is at least 150
    say "Close"
else
    say "Next time"
end

match "walk"
    when "go", "walk"
        say "moving"
    when "stop"
        say "standing still"
    else
        say "what?"
end`,
    says: ["We won!", "moving"],
  },
  {
    id: "repeating",
    title: "Repeating",
    text: "for each goes through a list, or counts. where skips the items you don't want, so the loop needs no if inside it. repeat while goes on as long as something holds.",
    code: `set scores to list of 70, 90, 55, 100
for each score in scores where score is at least 80
    say score
end

for each i from 10 to 1 by -3
    say i
end

set n to 1
repeat while n is less than 100
    set n to n * 2
end
say n`,
    says: ["90", "100", "10", "7", "4", "1", "128"],
  },
  {
    id: "functions",
    title: "Functions",
    text: "to makes a function; with names its inputs. An input can say what it must be, and can have a value for when it's left out. where says what a call needs, and Folio checks it at every call.",
    code: `to area with width as a number, height as a number gives a number
    return width * height
end

to greet with name, greeting or "Hello"
    say greeting ", " name "!"
end

to withdraw with amount where amount is greater than 0
    say "took " amount
end

say area(3, 4)
greet "Sam"
greet("Ada", greeting "Hi")
withdraw 20`,
    says: ["12", "Hello, Sam!", "Hi, Ada!", "took 20"],
  },
  {
    id: "mistakes",
    title: "When things go wrong",
    text: "fail with stops with a mistake of your own. try catches a mistake, from however deep it came, and if it fails says what to do instead. expect checks that something is so.",
    code: `to divide with a, b
    if b is 0
        fail with "can't divide by zero"
    end
    return a / b
end

try
    say divide(10, 0)
if it fails with why
    say "Folio says: " why
end

expect divide(10, 4) is 2.5
say "all good"`,
    says: ["Folio says: can't divide by zero", "all good"],
  },
];

// Writing less: the long way, then the Folio way, saying the same thing
export const SHORTER = [
  {
    id: "give",
    title: "Let give build the list",
    text: "A function that collects things can give each one, and hands back the list when it ends: no empty list to make, no add. Counting by 2 does away with the if.",
    long: `set squares to empty list
for each n from 1 to 10
    if n is divisible by 2
        add n * n to squares
    end
end
say squares`,
    short: `to even_squares_to with n
    for each k from 2 to n by 2
        give k * k
    end
end
say even_squares_to(10)`,
    says: ["[4, 16, 36, 64, 100]"],
  },
  {
    id: "match",
    title: "Use match for many cases",
    text: "A long chain of else if on one value reads better as match, and each case can list more than one value.",
    long: `set day to "Sat"
if day is "Sat"
    say "weekend"
else if day is "Sun"
    say "weekend"
else
    say "weekday"
end`,
    short: `set day to "Sat"
match day
    when "Sat", "Sun"
        say "weekend"
    else
        say "weekday"
end`,
    says: ["weekend"],
  },
  {
    id: "unpack",
    title: "Set several names at once",
    text: "set takes more than one name. It also swaps two values without a third.",
    long: `set low to 1
set high to 10
set spare to low
set low to high
set high to spare
say low " " high`,
    short: `set low, high to 1, 10
set low, high to high, low
say low " " high`,
    says: ["10 1"],
  },
];

// A larger program: a kind for the data, its functions in a file of their own, and tests
export const CART = `# cart.folio: what a line in a cart is, and what a cart costs
kind line with name, price, count or 1
end

to cost with one as a line gives a number
    return one's price * one's count
end

to cost_of with lines as a list of lines gives a number
    set sum to 0
    for each one in lines
        add cost(one) to sum
    end
    return sum
end`;

export const SHOP = `# shop.folio: the program itself, short because cart.folio does the work
use "cart.folio" as cart

set basket to list of cart's line("pen", 2, count 3), cart's line("book", 12)
say "items: " length of basket
say "to pay: " cart's cost_of(basket)`;

export const SHOP_SAYS = ["items: 2", "to pay: 18"];

export const CART_TEST = `# cart.test.folio: what cart.folio must do; folio test runs every test_ function
use "cart.folio" as cart

to test_a_line_costs_its_price_times_its_count
    expect cart's cost(cart's line("pen", 2, count 3)) is 6
end

to test_an_empty_cart_costs_nothing
    expect cart's cost_of(empty list) is 0
end`;
