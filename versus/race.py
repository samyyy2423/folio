# The race on the site's benchmarks page: the four programs in this folder (fib(32), adding 1 to 100,000,000,
# the primes up to 300,000, and 30,000,000 steps of decimal maths) in Folio, C, Rust, JavaScript (Node.js) and
# Python, each run as a whole program from start to finish, start-up included. Each time is the least wall time
# of five runs (two for Python's four slow ones), the languages taking turns. The first row is each language's
# start-up alone: a program that says hello.
#
#     python versus/race.py
#
# Folio is the folio program built from this repository (or the one FOLIO names), and builds each .folio here to
# machine code. C needs cl (in a Visual Studio developer prompt), cc, gcc or clang; Rust needs rustc; JavaScript
# needs node. A language that isn't there is left out. The programs go in .bench-race, at the repository's top.
import os, shutil, subprocess, sys, time

here = os.path.dirname(os.path.abspath(__file__))
top = os.path.dirname(here)
out = os.path.join(top, ".bench-race")
os.makedirs(out, exist_ok=True)
windows = os.name == "nt"
exe = ".exe" if windows else ""
PROGRAMS = {
    "hello": "start, say hello, end",
    "fib": "fib(32): 7 million calls",
    "loop": "adding 1 to 100,000,000",
    "primes": "primes up to 300,000",
    "float": "30,000,000 steps of decimal maths",
}


def works(cmd):
    try:
        return subprocess.run(cmd, cwd=out, capture_output=True).returncode == 0
    except OSError:
        return False


ways = {}

folio = os.environ.get("FOLIO") or os.path.join(top, "folio" + exe)
if os.path.exists(folio) and all(works([folio, "build", os.path.join(here, p + ".folio")]) for p in PROGRAMS):
    # folio build writes each program beside its source's name, in the folder it runs in
    ways["Folio"] = lambda p: [os.path.join(out, p + exe)]

c = os.path.join(out, "versus-c" + exe)
for cmd in (["cl", "/O2", "/nologo", os.path.join(here, "versus.c"), "/Fe:" + c],
            ["cc", "-O2", "-o", c, os.path.join(here, "versus.c")],
            ["gcc", "-O2", "-o", c, os.path.join(here, "versus.c")],
            ["clang", "-O2", "-o", c, os.path.join(here, "versus.c")]):
    if works(cmd):
        ways["C"] = lambda p: [c, p]
        break

rs = os.path.join(out, "versus-rs" + exe)
if works(["rustc", "-O", "-o", rs, os.path.join(here, "versus.rs")]):
    ways["Rust"] = lambda p: [rs, p]

if shutil.which("node"):
    ways["JavaScript"] = lambda p: ["node", os.path.join(here, p + ".js")]

ways["Python"] = lambda p: [sys.executable, os.path.join(here, p + ".py")]


def best(cmd, n):
    least, said = float("inf"), ""
    for _ in range(n):
        start = time.perf_counter()
        ran = subprocess.run(cmd, capture_output=True, text=True)
        least = min(least, time.perf_counter() - start)
        said = ran.stdout.strip()
    return least * 1000, said


names = list(ways)
print("".ljust(36) + "".join(n.rjust(14) for n in names))
for p, title in PROGRAMS.items():
    row = []
    for name in names:
        # (versus.c and versus.rs have no hello: given it, they start and end, which is the start-up there is)
        ms, said = best(ways[name](p), 2 if name == "Python" and p != "hello" else 5)
        row.append(f"{ms:,.0f} ms".rjust(14))
    print(title.ljust(36) + "".join(row), flush=True)
missing = [n for n in ("Folio", "C", "Rust", "JavaScript") if n not in ways]
if missing:
    print("(left out, not found: " + ", ".join(missing) + ")")
