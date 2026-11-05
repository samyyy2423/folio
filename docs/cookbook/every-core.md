# Work on every core

You have work that takes a while and splits into parts that don't need each other: here, counting the primes
up to four million, in eight ranges. One core does one part after another; every core can do a part each at
the same moment. Moth has two ways:

- **Workers**, `start work(x) on another core`, built into the language: each a thread of its own, sharing
  nothing. A worker gets copies of what it's given and of the program's variables, and `wait for` gives a
  copy of what it gave back.
- **[`cores.moth`](https://samyyy2423.github.io/moth/docs/cores.html)**, `each_at_once(work, items)`, as Python's multiprocessing does it: copies
  of the whole program, each a process, which share the items out among as many as there are cores.

## The program

```moth file=primes.moth
use "cores.moth" as cores

# how many primes there are from `first` to `last`, the slow way
to primes_between with first, last
    set found to 0
    for each n from first to last
        if n is at least 2
            set prime to yes
            set d to 2
            repeat while prime and d * d is at most n
                if n is divisible by d
                    set prime to no
                end
                set d to d + 1
            end
            if prime
                add 1 to found
            end
        end
    end
    return found
end

# a part of the work: half a million numbers, by where they start
to primes_in_part with start
    return primes_between(start, start + 499999)
end
cores's work_here(primes_in_part)

set parts to list of 1, 500001, 1000001, 1500001, 2000001, 2500001, 3000001, 3500001

set began to the clock
set one_by_one to empty list
for each part in parts
    add primes_in_part(part) to one_by_one
end
say "one after another: " total of one_by_one " primes, in " ((the clock - began) * 10 rounded) / 10 " s"

set began to the clock
set counted to cores's each_at_once(primes_in_part, parts)
say "on " cores's count_of_cores() " cores: " total of counted " primes, in " ((the clock - began) * 10 rounded) / 10 " s"

set began to the clock
set workers to empty list
for each part in parts
    add (start primes_in_part(part) on another core) to workers
end
set by_workers to empty list
for each worker in workers
    add (wait for worker) to by_workers
end
say "on " length of workers " workers: " total of by_workers " primes, in " ((the clock - began) * 10 rounded) / 10 " s"
say by_workers
```

`cores's work_here(primes_in_part)`, after the functions, is where a copy of the program that `each_at_once`
starts does its part and stops, so it does nothing else first. Everything before it runs in each copy too.

```console
$ moth run --allow-libraries --allow-read --allow-write primes.moth
one after another: 283146 primes, in ... s
on ... cores: 283146 primes, in ... s
on 8 workers: 283146 primes, in ... s
[41538, 36960, 35657, 34778, 34139, 33744, 33334, 32996]
```

On four cores, both take about a third of the time one after another does: the parts aren't the same size
(there are fewer primes higher up, but each takes longer to check), and starting copies or threads costs a
little. `cores.moth` needs `--allow-libraries` to start its copies and `--allow-read` and `--allow-write` for
the files they pass their parts through; workers need nothing.

## Which to use

- **Workers** start in well under a millisecond, and what they're given and give back is copied directly, so
  they suit many small parts, and a server's requests (`server.moth`'s `serve_on_workers`). A function
  made inside another can't go to a worker, as it would share that function's variables.
- **`each_at_once`** starts the program again for each copy, so it suits a few big parts. What a part is given
  and gives back goes through a file, so it's numbers, text, lists, records and dictionaries.
- Neither shares anything while it works, so there's nothing to lock. For tasks that take turns on one core,
  waiting on the network say, use `start` without `on another core`, and [`sync.moth`](https://samyyy2423.github.io/moth/docs/sync.html)'s
  locks and queues.

In the playground, and on the JavaScript engines, workers and `each_at_once` do their parts one after
another, and give the same.

## See also

- [cores.moth](https://samyyy2423.github.io/moth/docs/cores.html): `each_at_once_on(n, work, items)` for n copies, and `count_of_cores()`.
- [sync.moth](https://samyyy2423.github.io/moth/docs/sync.html): `wait_for_all` and `wait_for_any` take workers as they take tasks.
