// Writes Moth's practice exercises, in Exercism's track format, from Exercism's problem-specifications (MIT):
//
//     git clone https://github.com/exercism/problem-specifications
//     node exercises/bin/generate.mjs problem-specifications exercises
//
// For each exercise in EXERCISES below: its instructions as problem-specifications has them, what it asks for
// in Moth (.docs/instructions.append.md), a stub and an example solution, its canonical cases as Moth tests,
// and tests.toml, which says which cases those are, as configlet keeps it. A case another one reimplements is
// left out, as is one Moth can't hold (`skip`), with why. Each exercise keeps the uuid config.json gave it.
// To add an exercise, add it to EXERCISES and run this again; exercises.test.js says whether its example
// passes every test.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const [specs, out] = process.argv.slice(2);
if (!specs || !out) throw new Error("usage: node exercises/bin/generate.mjs <problem-specifications> <exercises>");
const configFile = join(out, "config.json");
const uuids = Object.fromEntries(existsSync(configFile) ? JSON.parse(readFileSync(configFile, "utf8")).exercises.practice.map((e) => [e.slug, e.uuid]) : []);

// a JSON value as Moth
function moth(v) {
  if (v === null) return "nothing";
  if (v === true) return "yes";
  if (v === false) return "no";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const parts = [];
    let text = "";
    for (const ch of v) {
      const code = ch.codePointAt(0);
      if (ch === "\n") text += "\\n";
      else if (ch === "\t") text += "\\t";
      else if (ch === "\\") text += "\\\\";
      else if (ch === '"') text += '\\"';
      else if (ch === "{") text += "\\{";
      else if (code < 32) {
        parts.push(`"${text}"`, `(list of ${code}) as bytes as text`);
        text = "";
      } else text += ch;
    }
    parts.push(`"${text}"`);
    const kept = parts.filter((p, i) => p !== '""' || parts.length === 1);
    return kept.length === 1 ? kept[0] : `(${kept.join(" + ")})`;
  }
  if (Array.isArray(v)) return v.length ? `(list of ${v.map(moth).join(", ")})` : "empty list";
  const keys = Object.keys(v);
  return keys.length ? `(dictionary where ${keys.map((k) => `${moth(k)} is ${moth(v[k])}`).join(", ")})` : "empty dictionary";
}
const bare = (s) => s.replace(/^\((.*)\)$/s, "$1"); // a value at the end of an expect needs no brackets

const fails = (call, why) => [`    try`, `        ${call}`, `        expect "a mistake" is "no mistake"`, `    if it fails with why`, `        expect why is ${moth(why)}`, `    end`];
const expects = (call, expected) => (expected && typeof expected === "object" && "error" in expected ? fails(call, expected.error)
  : expected === true ? [`    expect ${call}`] : expected === false ? [`    expect not ${call}`] : [`    expect ${call} is ${bare(moth(expected))}`]);

const pow2 = (n) => (2n ** BigInt(n)).toString();

// each exercise: its file's name, what it practises, difficulty, the Moth it asks for, a stub, an example, and
// what each canonical case tests
const EXERCISES = {
  "hello-world": { difficulty: 1, api: ["`hello()` gives the text `Hello, World!`."],
    stub: `to hello\n    return "Goodbye, Mars!"\nend\n`,
    example: `to hello\n    return "Hello, World!"\nend\n`,
    test: (c, a) => expects(`${a}'s hello()`, c.expected) },
  "two-fer": { difficulty: 1, api: ["`two_fer(name)` gives what to say, and `two_fer()`, with no name, what to say to no one in particular: its input is `name or nothing`."],
    stub: `to two_fer with name or nothing\n    fail with "Please write two_fer"\nend\n`,
    example: `to two_fer with name or nothing\n    if name is nothing\n        set name to "you"\n    end\n    return "One for " + name + ", one for me."\nend\n`,
    test: (c, a) => expects(c.input.name === null ? `${a}'s two_fer()` : `${a}'s two_fer(${moth(c.input.name)})`, c.expected) },
  "leap": { difficulty: 1, api: ["`leap_year(year)` gives yes if the year is a leap year, and no if it isn't."],
    stub: `to leap_year with year\n    fail with "Please write leap_year"\nend\n`,
    example: `to leap_year with year\n    return (year is divisible by 4 and not (year is divisible by 100)) or year is divisible by 400\nend\n`,
    test: (c, a) => expects(`${a}'s leap_year(${c.input.year})`, c.expected) },
  "raindrops": { difficulty: 1, api: ["`convert(n)` gives the raindrop sounds for the whole number `n`, as text."],
    stub: `to convert with n\n    fail with "Please write convert"\nend\n`,
    example: `to convert with n\n    set sounds to ""\n    if n is divisible by 3\n        add "Pling" to sounds\n    end\n    if n is divisible by 5\n        add "Plang" to sounds\n    end\n    if n is divisible by 7\n        add "Plong" to sounds\n    end\n    if sounds is ""\n        return "" + n\n    end\n    return sounds\nend\n`,
    test: (c, a) => expects(`${a}'s convert(${c.input.number})`, c.expected) },
  "bob": { difficulty: 2, api: ["`response(hey_bob)` gives what Bob says back to `hey_bob`."],
    stub: `to response with hey_bob\n    fail with "Please write response"\nend\n`,
    example: `# whether text has a letter in it
to has_letters with words
    return uppercase of words is not lowercase of words
end

# the text without spaces, tabs, new lines or returns at either end
to trimmed with words
    set spaces to list of " ", "\\t", "\\n", (list of 13) as bytes as text
    set letters to split words by ""
    set first to 1
    set last to length of letters
    repeat while first is at most last and item first of letters is in spaces
        add 1 to first
    end
    repeat while last is at least first and item last of letters is in spaces
        set last to last - 1
    end
    if last is less than first
        return ""
    end
    return items first to last of words
end

to response with hey_bob
    set said to trimmed(hey_bob)
    set shouting to has_letters(said) and said is uppercase of said
    set asking to said is not "" and item (length of said) of said is "?"
    if said is ""
        return "Fine. Be that way!"
    else if shouting and asking
        return "Calm down, I know what I'm doing!"
    else if shouting
        return "Whoa, chill out!"
    else if asking
        return "Sure."
    end
    return "Whatever."
end
`,
    test: (c, a) => expects(`${a}'s response(${moth(c.input.heyBob)})`, c.expected) },
  "isogram": { difficulty: 2, api: ["`is_isogram(phrase)` gives yes if no letter is in the phrase twice, whatever its case; spaces and hyphens can be."],
    stub: `to is_isogram with phrase\n    fail with "Please write is_isogram"\nend\n`,
    example: `to is_isogram with phrase\n    set seen to empty dictionary\n    for each letter in split lowercase of phrase by ""\n        if letter is not " " and letter is not "-"\n            if letter is in seen\n                return no\n            end\n            set item letter of seen to yes\n        end\n    end\n    return yes\nend\n`,
    test: (c, a) => expects(`${a}'s is_isogram(${moth(c.input.phrase)})`, c.expected) },
  "pangram": { difficulty: 1, api: ["`is_pangram(sentence)` gives yes if the sentence has every letter from a to z, whatever their case."],
    stub: `to is_pangram with sentence\n    fail with "Please write is_pangram"\nend\n`,
    example: `to is_pangram with sentence\n    set small to lowercase of sentence\n    for each letter in split "abcdefghijklmnopqrstuvwxyz" by ""\n        if position of letter in small is 0\n            return no\n        end\n    end\n    return yes\nend\n`,
    test: (c, a) => expects(`${a}'s is_pangram(${moth(c.input.sentence)})`, c.expected) },
  "word-count": { difficulty: 3, api: ["`count_words(sentence)` gives a dictionary of each word, in small letters, to how many times it's in the sentence, in any order."],
    stub: `to count_words with sentence\n    fail with "Please write count_words"\nend\n`,
    example: `# whether a character is part of a word: a letter, a digit, or an apostrophe
to in_a_word with c
    return uppercase of c is not lowercase of c or position of c in "0123456789'" is greater than 0
end

to count_words with sentence
    set counts to empty dictionary
    set words to empty list
    set word to ""
    for each c in split (lowercase of sentence + " ") by ""
        if in_a_word(c)
            add c to word
        else if word is not ""
            add word to words
            set word to ""
        end
    end
    for each found in words
        # an apostrophe at either end is a quote, not part of the word
        repeat while length of found is greater than 0 and item 1 of found is "'"
            set found to items 2 to (length of found) of found
        end
        repeat while length of found is greater than 0 and item (length of found) of found is "'"
            set found to items 1 to (length of found - 1) of found
        end
        if found is not ""
            if found is in counts
                set item found of counts to item found of counts + 1
            else
                set item found of counts to 1
            end
        end
    end
    return counts
end
`,
    test: (c, a) => expects(`${a}'s count_words(${moth(c.input.sentence)})`, c.expected) },
  "anagram": { difficulty: 3, api: ["`find_anagrams(subject, candidates)` gives the candidates that are anagrams of the subject, as a list, in the order they were given. A word isn't its own anagram, and the case of the letters doesn't matter."],
    stub: `to find_anagrams with subject, candidates\n    fail with "Please write find_anagrams"\nend\n`,
    example: `# a word's letters, small, in order
to letters_of with word
    return (split lowercase of word by "") in order
end

to find_anagrams with subject, candidates
    set found to empty list
    for each candidate in candidates
        if lowercase of candidate is not lowercase of subject and letters_of(candidate) is letters_of(subject)
            add candidate to found
        end
    end
    return found
end
`,
    test: (c, a) => expects(`${a}'s find_anagrams(${moth(c.input.subject)}, ${moth(c.input.candidates)})`, c.expected) },
  "acronym": { difficulty: 1, api: ["`abbreviate(phrase)` gives the phrase's acronym, in capitals."],
    stub: `to abbreviate with phrase\n    fail with "Please write abbreviate"\nend\n`,
    example: `to abbreviate with phrase\n    set made to ""\n    set starting to yes\n    for each c in split phrase by ""\n        if c is " " or c is "-"\n            set starting to yes\n        else if uppercase of c is not lowercase of c\n            if starting\n                add uppercase of c to made\n            end\n            set starting to no\n        end\n    end\n    return made\nend\n`,
    test: (c, a) => expects(`${a}'s abbreviate(${moth(c.input.phrase)})`, c.expected) },
  "hamming": { difficulty: 1, api: ["`distance(strand1, strand2)` gives how many places the two DNA strands differ at. Strands of different lengths are a mistake: `fail with \"strands must be of equal length\"`."],
    stub: `to distance with strand1, strand2\n    fail with "Please write distance"\nend\n`,
    example: `to distance with strand1, strand2\n    if length of strand1 is not length of strand2\n        fail with "strands must be of equal length"\n    end\n    set differ to 0\n    for each k from 1 to length of strand1\n        if item k of strand1 is not item k of strand2\n            add 1 to differ\n        end\n    end\n    return differ\nend\n`,
    test: (c, a) => expects(`${a}'s distance(${moth(c.input.strand1)}, ${moth(c.input.strand2)})`, c.expected) },
  "rna-transcription": { difficulty: 1, api: ["`to_rna(dna)` gives the RNA complement of a DNA strand: G to C, C to G, T to A and A to U."],
    stub: `to to_rna with dna\n    fail with "Please write to_rna"\nend\n`,
    example: `to to_rna with dna\n    set complement to dictionary where "G" is "C", "C" is "G", "T" is "A", "A" is "U"\n    set rna to ""\n    for each nucleotide in split dna by ""\n        add item nucleotide of complement to rna\n    end\n    return rna\nend\n`,
    test: (c, a) => expects(`${a}'s to_rna(${moth(c.input.dna)})`, c.expected) },
  "grains": { difficulty: 1, api: ["`square(n)` gives how many grains are on square `n`, and `total_grains()` how many there are on the whole board. The numbers grow past the 15 digits a Moth number keeps, so give them as text: `use \"big.moth\"` works with whole numbers of any size, as text.", "A square that isn't from 1 to 64 is a mistake: `fail with \"square must be between 1 and 64\"`."],
    stub: `to square with n\n    fail with "Please write square"\nend\n\nto total_grains\n    fail with "Please write total_grains"\nend\n`,
    example: `use "big.moth" as big\n\nto square with n\n    if n is less than 1 or n is greater than 64\n        fail with "square must be between 1 and 64"\n    end\n    return big's power(2, n - 1)\nend\n\nto total_grains\n    return big's minus(big's power(2, 64), 1)\nend\n`,
    test: (c, a) => (c.property === "total" ? [`    expect ${a}'s total_grains() is "${(2n ** 64n - 1n).toString()}"`]
      : typeof c.expected === "object" ? expects(`${a}'s square(${c.input.square})`, c.expected) : [`    expect ${a}'s square(${c.input.square}) is "${pow2(c.input.square - 1)}"`]) },
  "collatz-conjecture": { difficulty: 1, api: ["`steps(n)` gives how many steps it takes `n` to reach 1. A number below 1 is a mistake: `fail with \"Only positive integers are allowed\"`."],
    stub: `to steps with n\n    fail with "Please write steps"\nend\n`,
    example: `to steps with n\n    if n is less than 1\n        fail with "Only positive integers are allowed"\n    end\n    set taken to 0\n    repeat while n is not 1\n        if n is divisible by 2\n            set n to n / 2\n        else\n            set n to 3 * n + 1\n        end\n        add 1 to taken\n    end\n    return taken\nend\n`,
    test: (c, a) => expects(`${a}'s steps(${c.input.number})`, c.expected) },
  "armstrong-numbers": { difficulty: 1, api: ["`is_armstrong_number(n)` gives yes if `n` is the sum of its own digits each raised to the power of how many digits it has."],
    stub: `to is_armstrong_number with n\n    fail with "Please write is_armstrong_number"\nend\n`,
    example: `to is_armstrong_number with n\n    set digits to split ("" + n) by ""\n    set sum to 0\n    for each digit in digits\n        set sum to sum + (number of digit) to the power of length of digits\n    end\n    return sum is n\nend\n`,
    skip: (c) => (c.scenarios ?? []).includes("big-integer") && "Moth's numbers keep 15 digits",
    test: (c, a) => expects(`${a}'s is_armstrong_number(${c.input.number})`, c.expected) },
  "reverse-string": { difficulty: 1, api: ["`reverse(value)` gives the text backwards."],
    stub: `to reverse with value\n    fail with "Please write reverse"\nend\n`,
    example: `to reverse with value\n    set made to ""\n    for each c in split value by ""\n        set made to c + made\n    end\n    return made\nend\n`,
    skip: (c) => /^grapheme cluster/.test(c.description) && "Moth's text is a list of code points, and a letter with a mark on it written apart is two",
    test: (c, a) => expects(`${a}'s reverse(${moth(c.input.value)})`, c.expected) },
  "matching-brackets": { difficulty: 2, api: ["`is_paired(value)` gives yes if every `[`, `{` and `(` in the text is closed by its own `]`, `}` or `)`, in order. Other characters don't matter. In Moth's text, a `{` right before a letter starts a value, so write `\\{` for the brace."],
    stub: `to is_paired with value\n    fail with "Please write is_paired"\nend\n`,
    example: `to is_paired with value\n    set closing to dictionary where "(" is ")", "[" is "]", "\\{" is "}"\n    set waiting to empty list\n    for each c in split value by ""\n        if c is in closing\n            add item c of closing to waiting\n        else if c is ")" or c is "]" or c is "}"\n            if length of waiting is 0 or item (length of waiting) of waiting is not c\n                return no\n            end\n            if length of waiting is 1\n                set waiting to empty list\n            else\n                set waiting to items 1 to (length of waiting - 1) of waiting\n            end\n        end\n    end\n    return length of waiting is 0\nend\n`,
    test: (c, a) => expects(`${a}'s is_paired(${moth(c.input.value)})`, c.expected) },
  "clock": { difficulty: 3, api: ["`create(hour, minute)` gives a clock, which `say`, and a value in text (`\"{clock}\"`), show as `08:00`: a record of a kind with a `shown` function does.", "`add_minutes(clock, minutes)` and `subtract_minutes(clock, minutes)` give the clock so many minutes later or earlier, and `equal(a, b)` gives yes if two clocks show the same time. Hours and minutes can be any whole numbers, below 0 too: a clock goes round."],
    stub: `to create with hour, minute\n    fail with "Please write create"\nend\n\nto add_minutes with clock, minutes\n    fail with "Please write add_minutes"\nend\n\nto subtract_minutes with clock, minutes\n    fail with "Please write subtract_minutes"\nend\n\nto equal with a, b\n    fail with "Please write equal"\nend\n`,
    example: `kind clock_time with minutes
    to shown with self
        set hours to (minutes of self - remainder of minutes of self divided by 60) / 60
        set left to remainder of minutes of self divided by 60
        set hh to "" + hours
        set mm to "" + left
        if hours is less than 10
            set hh to "0" + hh
        end
        if left is less than 10
            set mm to "0" + mm
        end
        return hh + ":" + mm
    end
end

# minutes into the day, from 0 to 1439, however far round the clock they've gone
to round_the_clock with minutes
    return remainder of (remainder of minutes divided by 1440 + 1440) divided by 1440
end

to create with hour, minute
    return clock_time(round_the_clock(hour * 60 + minute))
end

to add_minutes with clock, minutes
    return clock_time(round_the_clock(minutes of clock + minutes))
end

to subtract_minutes with clock, minutes
    return clock_time(round_the_clock(minutes of clock - minutes))
end

to equal with a, b
    return minutes of a is minutes of b
end
`,
    test: (c, a) => {
      const i = c.input;
      if (c.property === "create") return [`    expect "{${a}'s create(${i.hour}, ${i.minute})}" is ${moth(c.expected)}`];
      if (c.property === "add" || c.property === "subtract") return [`    expect "{${a}'s ${c.property}_minutes(${a}'s create(${i.hour}, ${i.minute}), ${i.value})}" is ${moth(c.expected)}`];
      return expects(`${a}'s equal(${a}'s create(${i.clock1.hour}, ${i.clock1.minute}), ${a}'s create(${i.clock2.hour}, ${i.clock2.minute}))`, c.expected);
    } },
  "sieve": { difficulty: 2, api: ["`primes(limit)` gives the prime numbers up to `limit`, as a list, smallest first, found by the Sieve of Eratosthenes."],
    stub: `to primes with limit\n    fail with "Please write primes"\nend\n`,
    example: `to primes with limit\n    set crossed to empty dictionary\n    set found to empty list\n    for each n from 2 to limit\n        if not (n is in crossed)\n            add n to found\n            set multiple to n * n\n            repeat while multiple is at most limit\n                set item multiple of crossed to yes\n                set multiple to multiple + n\n            end\n        end\n    end\n    return found\nend\n`,
    test: (c, a) => expects(`${a}'s primes(${c.input.limit})`, c.expected) },
  "luhn": { difficulty: 2, api: ["`valid(value)` gives yes if the text is a number the Luhn formula says is valid. Spaces are allowed; anything else that isn't a digit isn't."],
    stub: `to valid with value\n    fail with "Please write valid"\nend\n`,
    example: `to valid with value\n    set digits to empty list\n    for each c in split value by ""\n        if c is not " "\n            if position of c in "0123456789" is 0\n                return no\n            end\n            add number of c to digits\n        end\n    end\n    if length of digits is at most 1\n        return no\n    end\n    set sum to 0\n    set doubling to no\n    set k to length of digits\n    repeat while k is at least 1\n        set d to item k of digits\n        if doubling\n            set d to d * 2\n            if d is greater than 9\n                set d to d - 9\n            end\n        end\n        set sum to sum + d\n        set doubling to not doubling\n        set k to k - 1\n    end\n    return sum is divisible by 10\nend\n`,
    test: (c, a) => expects(`${a}'s valid(${moth(c.input.value)})`, c.expected) },
  "difference-of-squares": { difficulty: 1, api: ["`square_of_sum(n)` gives the square of the sum of the first `n` whole numbers, `sum_of_squares(n)` the sum of their squares, and `difference_of_squares(n)` the one less the other."],
    stub: `to square_of_sum with n\n    fail with "Please write square_of_sum"\nend\n\nto sum_of_squares with n\n    fail with "Please write sum_of_squares"\nend\n\nto difference_of_squares with n\n    fail with "Please write difference_of_squares"\nend\n`,
    example: `to square_of_sum with n\n    set sum to n * (n + 1) / 2\n    return sum * sum\nend\n\nto sum_of_squares with n\n    return n * (n + 1) * (2 * n + 1) / 6\nend\n\nto difference_of_squares with n\n    return square_of_sum(n) - sum_of_squares(n)\nend\n`,
    test: (c, a) => expects(`${a}'s ${{ squareOfSum: "square_of_sum", sumOfSquares: "sum_of_squares", differenceOfSquares: "difference_of_squares" }[c.property]}(${c.input.number})`, c.expected) },
  "scrabble-score": { difficulty: 1, api: ["`score(word)` gives the word's Scrabble score, whatever the case of its letters."],
    stub: `to score with word\n    fail with "Please write score"\nend\n`,
    example: `to score with word\n    set values to dictionary where "aeioulnrst" is 1, "dg" is 2, "bcmp" is 3, "fhvwy" is 4, "k" is 5, "jx" is 8, "qz" is 10\n    set sum to 0\n    for each letter in split lowercase of word by ""\n        for each letters in keys of values\n            if position of letter in letters is greater than 0\n                set sum to sum + item letters of values\n            end\n        end\n    end\n    return sum\nend\n`,
    test: (c, a) => expects(`${a}'s score(${moth(c.input.word)})`, c.expected) },
  "nucleotide-count": { difficulty: 1, api: ["`nucleotide_counts(strand)` gives a dictionary of how many of each of \"A\", \"C\", \"G\" and \"T\" the strand has. Any other letter is a mistake: `fail with \"Invalid nucleotide in strand\"`."],
    stub: `to nucleotide_counts with strand\n    fail with "Please write nucleotide_counts"\nend\n`,
    example: `to nucleotide_counts with strand\n    set counts to dictionary where "A" is 0, "C" is 0, "G" is 0, "T" is 0\n    for each n in split strand by ""\n        if not (n is in counts)\n            fail with "Invalid nucleotide in strand"\n        end\n        set item n of counts to item n of counts + 1\n    end\n    return counts\nend\n`,
    test: (c, a) => expects(`${a}'s nucleotide_counts(${moth(c.input.strand)})`, c.expected) },
  "prime-factors": { difficulty: 2, api: ["`factors(value)` gives the prime factors of a whole number, as a list, smallest first, each as many times as it divides it."],
    stub: `to factors with value\n    fail with "Please write factors"\nend\n`,
    example: `to factors with value\n    set found to empty list\n    set divisor to 2\n    repeat while value is greater than 1\n        if divisor * divisor is greater than value\n            add value to found\n            return found\n        end\n        repeat while value is divisible by divisor\n            add divisor to found\n            set value to value / divisor\n        end\n        add 1 to divisor\n    end\n    return found\nend\n`,
    test: (c, a) => expects(`${a}'s factors(${c.input.value})`, c.expected) },
  "triangle": { difficulty: 2, api: ["`equilateral(sides)`, `isosceles(sides)` and `scalene(sides)` each take a list of three side lengths and give yes or no. Sides that can't make a triangle (any 0 or less, or one longer than the other two together) give no for all three."],
    stub: `to equilateral with sides\n    fail with "Please write equilateral"\nend\n\nto isosceles with sides\n    fail with "Please write isosceles"\nend\n\nto scalene with sides\n    fail with "Please write scalene"\nend\n`,
    example: `# whether three sides make a triangle
to is_triangle with sides
    set a to item 1 of sides
    set b to item 2 of sides
    set c to item 3 of sides
    return a is greater than 0 and b is greater than 0 and c is greater than 0 and a + b is at least c and b + c is at least a and a + c is at least b
end

to equilateral with sides
    return is_triangle(sides) and item 1 of sides is item 2 of sides and item 2 of sides is item 3 of sides
end

to isosceles with sides
    return is_triangle(sides) and (item 1 of sides is item 2 of sides or item 2 of sides is item 3 of sides or item 1 of sides is item 3 of sides)
end

to scalene with sides
    return is_triangle(sides) and not isosceles(sides)
end
`,
    test: (c, a) => expects(`${a}'s ${c.property}(${moth(c.input.sides)})`, c.expected) },
};

const flat = (cases, path = []) => cases.flatMap((c) => (c.cases ? flat(c.cases, [...path, c.description]) : [{ ...c, path: [...path, c.description] }]));
const snake = (slug) => slug.replace(/-/g, "_");
const toml = (text) => Object.fromEntries([...text.matchAll(/^(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => [m[1], m[2].replace(/\\"/g, '"')]));
const quoted = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const practice = [];
for (const [slug, ex] of Object.entries(EXERCISES)) {
  const from = join(specs, "exercises", slug);
  const data = JSON.parse(readFileSync(join(from, "canonical-data.json"), "utf8"));
  const meta = toml(readFileSync(join(from, "metadata.toml"), "utf8"));
  const name = snake(slug);
  const dir = join(out, "practice", slug);
  for (const sub of [".docs", ".meta"]) mkdirSync(join(dir, sub), { recursive: true });
  const all = flat(data.cases);
  const replaced = new Set(all.map((c) => c.reimplements).filter(Boolean));
  // tests.toml, as configlet writes it
  const tomlLines = [
    "# This is an auto-generated file.", "#", "# Regenerating this file via `configlet sync` will:", "# - Recreate every `description` key/value pair",
    "# - Recreate every `reimplements` key/value pair, where they exist in problem-specifications",
    "# - Remove any `include = true` key/value pair (an omitted `include` key implies inclusion)", "# - Preserve any other key/value pair", "#",
    "# As user-added comments (using the # character) will be removed when this file", "# is regenerated, comments can be added via a `comment` key.", ""];
  const tests = [`# ${data.exercise}'s tests, from Exercism's problem-specifications (canonical-data.json, MIT): run them with`, `# \`moth test ${name}.test.moth\``, "", `use "${name}.moth" as ${name}`, ""];
  const names = new Set();
  for (const c of all) {
    tomlLines.push(`[${c.uuid}]`, `description = ${quoted(c.path.join(" -> "))}`);
    if (c.reimplements) tomlLines.push(`reimplements = "${c.reimplements}"`);
    const skipped = replaced.has(c.uuid) ? "replaced by a test of the same thing, below" : ex.skip?.(c);
    if (skipped) tomlLines.push("include = false", `comment = ${quoted(skipped)}`);
    tomlLines.push("");
    if (skipped) continue;
    let testName = `test_${c.path.join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    for (let k = 2; names.has(testName); k++) testName = testName.replace(/_\d+$/, "") + `_${k}`;
    names.add(testName);
    tests.push(`to ${testName}`, ...ex.test(c, name), "end", "");
  }
  writeFileSync(join(dir, ".meta", "tests.toml"), tomlLines.join("\n"));
  writeFileSync(join(dir, `${name}.test.moth`), tests.join("\n").replace(/\n+$/, "\n"));
  writeFileSync(join(dir, `${name}.moth`), ex.stub);
  writeFileSync(join(dir, ".meta", "example.moth"), ex.example);
  const instructions = existsSync(join(from, "instructions.md")) ? "instructions.md" : "description.md";
  writeFileSync(join(dir, ".docs", "instructions.md"), readFileSync(join(from, instructions), "utf8"));
  if (existsSync(join(from, "introduction.md"))) writeFileSync(join(dir, ".docs", "introduction.md"), readFileSync(join(from, "introduction.md"), "utf8"));
  writeFileSync(join(dir, ".docs", "instructions.append.md"), `# Instructions append\n\n## In Moth\n\n${ex.api.join("\n\n")}\n\nWrite it in \`${name}.moth\`, and run the tests with \`moth test ${name}.test.moth\`.\n`);
  const config = { authors: ["samyyy2423"], files: { solution: [`${name}.moth`], test: [`${name}.test.moth`], example: [".meta/example.moth"] }, blurb: meta.blurb };
  if (meta.source) config.source = meta.source;
  if (meta.source_url) config.source_url = meta.source_url;
  writeFileSync(join(dir, ".meta", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  uuids[slug] ??= randomUUID();
  practice.push({ slug, name: meta.title ?? slug, uuid: uuids[slug], practices: [], prerequisites: [], difficulty: ex.difficulty });
}
const track = {
  language: "Moth", slug: "moth", active: false,
  status: { concept_exercises: false, test_runner: false, representer: false, analyzer: false },
  blurb: "Moth is a programming language that reads like plain English: small enough to learn in an afternoon, with a compiler written in Moth that makes Windows and Linux programs as fast as C.",
  version: 3,
  online_editor: { indent_style: "space", indent_size: 4 }, // Highlight.js has no Moth yet
  test_runner: { average_run_time: 2 },
  files: { solution: ["%{snake_slug}.moth"], test: ["%{snake_slug}.test.moth"], example: [".meta/example.moth"], exemplar: [".meta/exemplar.moth"] },
  exercises: { concept: [], practice, foregone: [] },
  concepts: [],
  key_features: [
    { title: "Reads like English", content: "Programs say what they do: set, say, for each, repeat while, to ... with.", icon: "easy" },
    { title: "Fast", content: "moth build compiles to machine code for Windows and Linux, as fast as C.", icon: "fast" },
    { title: "No dependencies", content: "One program, with a standard library from JSON to web servers built in.", icon: "batteries-included" },
    { title: "Clear mistakes", content: "Every error says what went wrong, where, in plain words.", icon: "helpful" },
    { title: "Tested", content: "Tests are functions, expect says what should be so, and moth test runs them.", icon: "safe" },
    { title: "Everywhere", content: "The same program runs in the browser's playground and as a native program.", icon: "cross-platform" },
  ],
  tags: ["paradigm/imperative", "paradigm/procedural", "typing/dynamic", "execution_mode/compiled", "execution_mode/interpreted", "platform/windows", "platform/linux", "platform/web", "runtime/standalone_executable", "used_for/scripts", "used_for/web_development", "used_for/games"],
};
writeFileSync(join(out, "config.json"), `${JSON.stringify(track, null, 2)}\n`);
console.log(`wrote ${practice.length} exercises`);
