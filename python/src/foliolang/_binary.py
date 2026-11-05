"""Finding the folio command: the one in the wheel, or one named by FOLIOLANG_FOLIO, or one on PATH."""

from __future__ import annotations

import os
import shutil
import sys
import sysconfig
from pathlib import Path

__all__ = ["folio_binary", "FolioNotFound"]

_EXE = "folio.exe" if sys.platform == "win32" else "folio"


class FolioNotFound(RuntimeError):
    """Raised when there is no folio command to run: a wheel for this system bundles one."""


def _is_native(path: Path) -> bool:
    """Whether a file is a program of folio's own (ELF or PE), not the `folio` script pip made for this package."""
    try:
        with open(path, "rb") as f:
            head = f.read(4)
    except OSError:
        return False
    if sys.platform == "win32":
        # pip's launcher is a PE too, but it lives in this Python's Scripts folder, which is skipped below
        return head[:2] == b"MZ"
    return head == b"\x7fELF"


def folio_binary() -> Path:
    """Where the folio command is: $FOLIOLANG_FOLIO, else the one bundled in this package, else `folio` on PATH."""
    named = os.environ.get("FOLIOLANG_FOLIO")
    if named:
        path = Path(named)
        if not path.is_file():
            raise FolioNotFound(f"FOLIOLANG_FOLIO names {named}, which isn't a file")
        return path
    bundled = Path(__file__).resolve().parent / "bin" / _EXE
    if bundled.is_file():
        if sys.platform != "win32" and not os.access(bundled, os.X_OK):
            try:  # a wheel unpacked by a tool that dropped its mode
                bundled.chmod(0o755)
            except OSError:
                pass
        return bundled
    scripts = Path(sysconfig.get_path("scripts")).resolve()
    found = shutil.which("folio")
    if found:
        path = Path(found).resolve()
        if path.parent != scripts and _is_native(path):
            return path
    raise FolioNotFound(
        "no folio command: install a wheel of foliolang built for this system (Windows or Linux, x86-64), "
        "or set FOLIOLANG_FOLIO to where folio is"
    )
