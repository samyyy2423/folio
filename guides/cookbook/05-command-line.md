# A command-line tool

`options.folio` reads a program's command line as Python's argparse does: options with values, flags, names in
order, and a `--help` made from what each is for. In a real program, `parse` is given `arguments`, what the
program was run with; here it's given a list, so the recipe can show what it does.

```folio
use "options.folio" as options

set p to options's parser("greet", "Says hello to someone.")
options's option(p, "name", "n", "who to greet", "World")
options's option(p, "times", "t", "how many times", 1)
options's flag(p, "loud", "l", "shout it")

set given to options's parse(p, list of "--name", "Sam", "-t", "2", "--loud")
for each k from 1 to item "times" of given
    set greeting to "Hello, " + item "name" of given + "!"
    if item "loud" of given
        set greeting to uppercase of greeting
    end
    say greeting
end
```

```output
HELLO, SAM!
HELLO, SAM!
```

What `--help` says comes from the same lines:

```folio
use "options.folio" as options

set p to options's parser("greet", "Says hello to someone.")
options's option(p, "name", "n", "who to greet", "World")
options's flag(p, "loud", "l", "shout it")
say options's help_text(p)
```

```output
usage: greet [-h] [-n NAME] [-l]

Says hello to someone.

options:
  -h, --help            say this, and stop
  -n, --name NAME       who to greet (World if it isn't given)
  -l, --loud            shout it
```

`folio build greet.folio` makes it a program of its own: `greet --name Sam --loud`.
