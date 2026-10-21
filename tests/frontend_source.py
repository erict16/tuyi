"""Read the desktop UI source as one text, so copy checks survive file splits."""

from __future__ import annotations

from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "frontend" / "src"


def _read(suffixes: tuple[str, ...]) -> str:
    files = sorted(path for path in SRC.rglob("*") if path.suffix in suffixes and ".test." not in path.name)
    return "\n".join(path.read_text(encoding="utf-8") for path in files)


def ui_source() -> str:
    return _read((".js", ".jsx"))


def ui_css() -> str:
    return _read((".css",))
