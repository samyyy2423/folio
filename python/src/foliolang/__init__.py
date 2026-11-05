"""Folio from Python: run Folio programs, and call a Folio file's functions straight through the C ABI.

    import foliolang as folio

    print(folio.run('say "Hello from Folio"').output)

    fast = folio.load("fast.folio")       # built once into a shared library, then cached
    fast.fib(30)                        # 832040, computed in machine code

Folio's functions take and give int, float, str, bool, None, bytes, lists (and tuples) and dicts; a Folio record
comes back as a Record, and anything else as a Value that can be given back. A mistake in Folio raises
FolioError, with its message and where it was.
"""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from ._binary import FolioNotFound, folio_binary
from ._library import Function, Library, FolioError, Record, Value

__all__ = ["BuildError", "Function", "Library", "FolioError", "FolioNotFound", "Record", "RunResult", "Value",
           "cache_folder", "compile", "load", "folio_binary", "run"]
__version__ = "1.11.0"

_LIBRARY = "{}.dll" if sys.platform == "win32" else "lib{}.so"
_loaded: dict[Path, Library] = {}
_lock = threading.Lock()


class BuildError(FolioError):
    """A Folio program that couldn't be built: folio's own message, and the line and column, when it says."""

    def __init__(self, message: str, report: str, line: int | None = None, column: int | None = None,
                 file: str | None = None) -> None:
        super().__init__(message, line, column, file)
        self.report = report

    def __str__(self) -> str:
        return self.report.rstrip("\n")


@dataclass(frozen=True)
class RunResult:
    """What a program run with folio.run did: what it said, what it said to the error output (a mistake's
    report among it), and the number it ended with (1 for a mistake)."""

    output: str
    errors: str
    status: int

    @property
    def ok(self) -> bool:
        return self.status == 0


def run(source: str, args: Iterable[str] = (), *, allow: Iterable[str] = (), input: str | None = None,
        timeout: float | None = None, cwd: str | os.PathLike[str] | None = None, name: str = "program.folio") -> RunResult:
    """Runs Folio code as `folio run` does, as a program of its own: what it said, its errors, and how it ended.

    `args` are the program's arguments; `allow` its --allow flags ("read", "write", "net", "run",
    "libraries", "all", or the whole flag); `input` what it reads as typed; `cwd` where it runs, and where
    the files it `use`s are found (else a folder of its own, made and removed)."""
    flags = _flags(allow)
    with tempfile.TemporaryDirectory(prefix="foliolang-") as folder:
        program = Path(folder) / name
        program.write_text(source, encoding="utf-8")
        ran = subprocess.run([str(folio_binary()), "run", *flags, str(program), *args], cwd=cwd or folder,
                             input=input if input is not None else "", capture_output=True, timeout=timeout,
                             encoding="utf-8", errors="replace")
    return RunResult(ran.stdout, ran.stderr, ran.returncode)


def load(path: str | os.PathLike[str], *, allow: Iterable[str] = ()) -> Library:
    """A Folio file's functions, as a Library: the file is built into a shared library the first time, and
    again only when it, or a file it uses, changes (the library is kept in cache_folder(), named by a hash of
    what it was built from)."""
    source_path = Path(path).resolve()
    source = source_path.read_text(encoding="utf-8")
    flags = _flags(allow)
    key = _key(source_path.name, source, flags, _used(source_path, source))
    return _built(key, source_path, flags)


def compile(source: str, *, name: str = "program.folio", allow: Iterable[str] = ()) -> Library:
    """Folio code's functions, as a Library, as load() gives a file's; `name` is the file it says mistakes
    are in. Built once for each different code, and cached."""
    if not name.endswith(".folio"):
        name += ".folio"
    flags = _flags(allow)
    key = _key(name, source, flags, [])
    folder = cache_folder() / key
    source_path = folder / name
    if not source_path.exists():
        folder.mkdir(parents=True, exist_ok=True)
        source_path.write_text(source, encoding="utf-8")
    return _built(key, source_path, flags)


def cache_folder() -> Path:
    """Where built libraries are kept: $FOLIOLANG_CACHE, or the system's own place for caches."""
    named = os.environ.get("FOLIOLANG_CACHE")
    if named:
        return Path(named)
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        return base / "foliolang" / "Cache"
    base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    return base / "foliolang"


def _flags(allow: Iterable[str]) -> list[str]:
    if isinstance(allow, str):
        allow = [allow]
    return [a if a.startswith("--") else f"--allow-{a}" for a in allow]


_USE = re.compile(r'^\s*use\s+(?:the\s+package\s+)?"([^"]+)"', re.MULTILINE)


def _used(source_path: Path, source: str) -> list[tuple[str, str]]:
    """The files a Folio file uses, and the ones they use, each with its text, for the cache's key: what
    `use "x.folio"` names beside it, and `use the package "x"` in packages/x/x.folio."""
    found: dict[str, str] = {}
    waiting = [(source_path, source)]
    while waiting:
        path, text = waiting.pop()
        for match in _USE.finditer(text):
            name = match.group(1)
            if match.group(0).split()[1] == "the":
                candidate = path.parent / "packages" / name / f"{name}.folio"
            else:
                candidate = path.parent / name
            try:
                key = str(candidate.resolve())
                if key in found:
                    continue
                found[key] = candidate.read_text(encoding="utf-8")
                waiting.append((candidate.resolve(), found[key]))
            except OSError:
                continue  # one of the standard library's, which folio has, or one that isn't there: folio says
    return sorted(found.items())


def _key(name: str, source: str, flags: list[str], used: list[tuple[str, str]]) -> str:
    binary = folio_binary()
    made = binary.stat()
    h = hashlib.sha256()
    for part in [__version__, sys.platform, str(binary), str(made.st_size), str(made.st_mtime_ns), name, source, *flags]:
        h.update(part.encode("utf-8") + b"\0")
    for path, text in used:
        h.update(path.encode("utf-8") + b"\0" + text.encode("utf-8") + b"\0")
    return h.hexdigest()[:32]


_REPORT = re.compile(r"^(?P<file>.*?):(?P<line>\d+):(?P<column>\d+): (?P<message>.*)$", re.MULTILINE)


def _built(key: str, source_path: Path, flags: list[str]) -> Library:
    folder = cache_folder() / key
    library_path = folder / _LIBRARY.format(source_path.stem)
    with _lock:
        if library_path in _loaded:
            return _loaded[library_path]
        if not library_path.exists():
            folder.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=folder, prefix="building-") as building:
                made = subprocess.run([str(folio_binary()), "build", source_path.name, "--library", "--into", building, *flags],
                                      cwd=source_path.parent, capture_output=True, encoding="utf-8", errors="replace")
                if made.returncode != 0:
                    report = made.stderr or made.stdout
                    said = _REPORT.search(report)
                    if said:
                        raise BuildError(said["message"], report, int(said["line"]), int(said["column"]), said["file"])
                    raise BuildError(report.strip(), report)
                for built in Path(building).iterdir():  # in place at once, so a library half written is never loaded
                    os.replace(built, folder / built.name)
        library = Library(library_path)
        _loaded[library_path] = library
        return library
