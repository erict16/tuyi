"""CLI named glossaries and PDF appearance."""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

import ezdxf

from backend.cli import main

REPO = Path(__file__).resolve().parents[1]


def _run(args: list[str]) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO) + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        [sys.executable, "-m", "tuyi", *args],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )


def _dxf(path: Path, *labels: str) -> None:
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    for index, label in enumerate(labels):
        msp.add_text(label, dxfattribs={"insert": (0, index * 8), "height": 2.5})
    msp.add_line((0, 0), (30, 0), dxfattribs={"color": 4})
    doc.saveas(path)


def _texts(path: Path) -> list[str]:
    doc = ezdxf.readfile(path)
    return [entity.dxf.text for entity in doc.modelspace() if entity.dxftype() == "TEXT"]


def _dark_fill(path: Path) -> bool:
    data = path.read_bytes()
    chunks = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        raw = match.group(1)
        try:
            chunks.append(zlib.decompress(raw))
        except zlib.error:
            chunks.append(raw)
    blob = b"\n".join(chunks)
    fills = re.findall(rb"([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+rg\b", blob)
    return any(abs(float(item[0]) - 33 / 255) < 0.05 for item in fills)


class CliGlossaryPdfTests(unittest.TestCase):
    def test_switch_glossary_skips_architectural_terms(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "mix.dxf"
            _dxf(source, "有载分接开关", "天花图")
            switched = root / "switch.dxf"
            result = _run(["translate", str(source), "--glossary", "switch", "-o", str(switched)])
            self.assertEqual(result.returncode, 0, result.stderr)
            texts = _texts(switched)
            self.assertIn("OLTC", texts)
            self.assertIn("天花图", texts)
            self.assertNotIn("reflected ceiling plan", texts)

    def test_all_glossary_still_translates_architectural_terms(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "mix.dxf"
            _dxf(source, "天花图")
            output = root / "all.dxf"
            result = _run(["translate", str(source), "--glossary", "all", "-o", str(output)])
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("reflected ceiling plan", _texts(output))

    def test_transformer_glossary_uses_nameplate_abbreviations(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "nameplate.dxf"
            _dxf(source, "高压", "油浸自冷", "有载分接开关", "天花图")
            output = root / "xfmr.dxf"
            result = _run(["translate", str(source), "--glossary", "变压器", "-o", str(output)])
            self.assertEqual(result.returncode, 0, result.stderr)
            texts = _texts(output)
            self.assertIn("HV", texts)
            self.assertIn("ONAN", texts)
            self.assertIn("OLTC", texts)
            self.assertIn("天花图", texts)

    def test_unknown_glossary_name_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "mix.dxf"
            _dxf(source, "有载分接开关")
            result = _run(["translate", str(source), "--glossary", "not-a-pack"])
            self.assertEqual(result.returncode, 1)
            self.assertIn("术语表", result.stderr)

    def test_pdf_defaults_to_chrome_and_color_is_white(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "mix.dxf"
            _dxf(source, "极性选择器")
            chrome = _run(["pdf", str(source), "--output-dir", str(root), "-o", "chrome.pdf"])
            color = _run(["pdf", str(source), "--output-dir", str(root), "-o", "color.pdf", "--appearance", "彩色"])
            self.assertEqual(chrome.returncode, 0, chrome.stderr)
            self.assertIn("appearance: Chrome", chrome.stdout)
            self.assertTrue(_dark_fill(root / "chrome.pdf"))
            self.assertEqual(color.returncode, 0, color.stderr)
            self.assertIn("appearance: 彩色", color.stdout)
            self.assertFalse(_dark_fill(root / "color.pdf"))

    def test_bad_appearance_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "mix.dxf"
            _dxf(source, "极性选择器")
            result = _run(["pdf", str(source), "--appearance", "gray"])
            self.assertEqual(result.returncode, 1)
            self.assertIn("打印色彩", result.stderr)

    def test_help_lists_glossary_and_pdf(self):
        result = _run(["--help"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("translate", result.stdout)
        self.assertIn("pdf", result.stdout)
        listed = _run(["translate", "--help"])
        self.assertIn("switch", listed.stdout)


class CliStressTests(unittest.TestCase):
    def test_repeat_translate_and_bad_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "mix.dxf"
            _dxf(source, "有载分接开关", "没有这个词xyz")
            for index in range(8):
                output = root / f"out-{index}.dxf"
                result = _run(["translate", str(source), "--glossary", "开关", "-o", str(output)])
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("OLTC", _texts(output))
            missing = _run(["translate", str(root / "missing.dxf")])
            self.assertEqual(missing.returncode, 1)
            self.assertNotIn("Traceback", missing.stderr)
            both = _run(["translate", str(source), str(source), "-o", "one.dxf"])
            self.assertEqual(both.returncode, 2)
            empty = main([])
            self.assertEqual(empty, 2)


if __name__ == "__main__":
    unittest.main()
