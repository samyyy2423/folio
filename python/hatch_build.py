"""Wheels with folio in them: FOLIOLANG_BINARY names a folio built for FOLIOLANG_PLATFORM (win_amd64, or
manylinux_2_17_x86_64.manylinux2014_x86_64), which goes into the wheel as foliolang/bin/folio (folio.exe), and
the wheel is tagged for that system alone. With neither, the wheel has no folio, finds one through
FOLIOLANG_FOLIO or PATH, and is for any system (as the sdist is)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

PLATFORMS = {"win_amd64": "folio.exe", "manylinux_2_17_x86_64.manylinux2014_x86_64": "folio"}


class FolioBinaryHook(BuildHookInterface):
    PLUGIN_NAME = "custom"

    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        if self.target_name != "wheel":
            return
        binary = os.environ.get("FOLIOLANG_BINARY")
        platform = os.environ.get("FOLIOLANG_PLATFORM")
        if not binary and not platform:
            return
        if not binary or not platform:
            raise RuntimeError("FOLIOLANG_BINARY and FOLIOLANG_PLATFORM go together")
        if platform not in PLATFORMS:
            raise RuntimeError(f"FOLIOLANG_PLATFORM is one of {', '.join(PLATFORMS)}, not {platform}")
        path = Path(binary)
        head = path.read_bytes()[:4]
        if head[:2] != (b"MZ" if platform == "win_amd64" else b"\x7fE"):
            raise RuntimeError(f"{binary} isn't a folio built for {platform}")
        build_data["pure_python"] = False
        build_data["tag"] = f"py3-none-{platform}"
        build_data["force_include"][str(path)] = f"foliolang/bin/{PLATFORMS[platform]}"
