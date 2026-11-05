# A command-line tool with options

You want a program people run from a terminal, with options in the usual form (`--top 3`, `-t 3`,
`--top=3`, a flag like `-k`), names after them, and a `--help` that says how to use it.
[`options.moth`](https://samyyy2423.github.io/moth/docs/options.html) reads a command line as Python's argparse does.

Here, a tool that counts the words in text files and says which come most:

```moth file=words.moth
use "options.moth" as options
use "collections.moth" as collections
use "text.moth" as text

set p to options's parser("words", "Counts the words in text files, and says which come most.")
options's option(p, "top", "t", "how many of the most common to show", 5)
options's option(p, "shortest", "s", "leave out words shorter than this", 1)
options's flag(p, "keep-case", "k", "count \"The\" and \"the\" apart")
options's positional(p, "file", "a text file to count")
options's rest(p, "more", "more files to count with it")
set given to options's parse(p, arguments)

set words to empty list
set files to list of item "file" of given
for each file in item "more" of given
    add file to files
end
for each file in files
    set words_in_file to text's find_all("[A-Za-z']+", read file)
    for each found in words_in_file
        set word to text of found
        if not item "keep-case" of given
            set word to lowercase of word
        end
        if length of word is at least item "shortest" of given
            add word to words
        end
    end
end

set counts to collections's counted(words)
say length of words " words, " length of keys of counts " different, in " length of files " files"
for each pair in collections's most_common(counts, item "top" of given)
    say text's padded_right(value of pair, 8) count of pair
end
```

`parser` names the tool and says what it does; `option` adds an option with a value, its short name, what
it's for and its value when it isn't given (a number there makes the value given a number); `flag` adds one
that's yes when it's there; `positional` a name that must be given; and `rest` the names after it, as a list.
`parse` gives a dictionary of them all, by name.

## Run it

Two files to try it on:

```text file=moth.txt
The moth flew to the lamp. The lamp was warm, and the moth was happy.
```

```text file=story.txt
A moth is not a butterfly. It flies at night, and it loves the light.
```

Everything after the program's file is its own:

```console
$ moth run --allow-read words.moth moth.txt
15 words, 9 different, in 1 files
the     4
moth    2
lamp    2
was     2
flew    1
$ moth run --allow-read words.moth --top 3 -s 4 moth.txt story.txt
13 words, 10 different, in 2 files
moth    3
lamp    2
flew    1
$ moth run --allow-read words.moth -k --top=2 moth.txt
15 words, 10 different, in 1 files
The     2
moth    2
```

`--help` is made from what each option said it's for, and stops the program:

```console
$ moth run --allow-read words.moth --help
usage: words [-h] [-t TOP] [-s SHORTEST] [-k] file [more ...]

Counts the words in text files, and says which come most.

names:
  file                  a text file to count
  more                  more files to count with it

options:
  -h, --help            say this, and stop
  -t, --top TOP         how many of the most common to show (5 if it isn't given)
  -s, --shortest SHORTEST  leave out words shorter than this (1 if it isn't given)
  -k, --keep-case       count "The" and "the" apart
```

A command line it can't read says how to use it and what's wrong, on the error output, and stops the
program with 2, as command-line tools do:

```console
$ moth run --allow-read words.moth --top
usage: words [-h] [-t TOP] [-s SHORTEST] [-k] file [more ...]
words: --top needs a value after it
```

## Make it a program of its own

`moth build` makes `words` (`words.exe` on Windows), which runs anywhere with nothing installed. What it's
allowed to do is decided when it's built:

```console
$ moth build words.moth --allow-read
compiled words.moth to machine code for Linux -> words (... bytes)
$ ./words --top 1 story.txt
15 words, 13 different, in 1 files
a       2
```

Put it in a folder on your `PATH` and it's a command like any other.

## See also

- [options.moth](https://samyyy2423.github.io/moth/docs/options.html): `parse_or_fail`, which gives a mistake to catch instead of stopping, and
  `help_text`.
- [system.moth](https://samyyy2423.github.io/moth/docs/system.html) for files, folders and environment variables, and [log.moth](https://samyyy2423.github.io/moth/docs/log.html)
  to say what happened.
