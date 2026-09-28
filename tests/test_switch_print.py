"""Built-in switch glossary, Chrome vs 彩色 PDF, and Downloads as the default folder."""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

import ezdxf

from backend.app_meta import legacy_output_dir, resolve_output_dir
from backend.drawings import export_pdf, extract_preview, translate_drawing
from backend.translator import CADChineseTranslator

REPO = Path(__file__).resolve().parents[1]
TERMS = {
    "有载分接开关": "on-load tap-changer",
    "极性选择器": "change-over selector",
    "分接选择器": "tap selector",
    "气体继电器": "Buchholz relay",
    "均压罩": "terminal screen caps",
    "电位电阻": "tie-in resistor",
}
UNKNOWN = "这句不在术语表xyz"


def _switch_dxf(path: Path) -> Path:
    doc = ezdxf.new("R2010")
    doc.layers.add("INK", color=4)
    msp = doc.modelspace()
    y = 0
    for source in TERMS:
        msp.add_text(source, dxfattribs={"insert": (0, y), "height": 2.5})
        y += 10
    msp.add_text(UNKNOWN, dxfattribs={"insert": (0, y), "height": 2.5})
    msp.add_line((0, 0), (80, 0), dxfattribs={"layer": "INK", "color": 4})
    msp.add_circle((40, 40), 12, dxfattribs={"color": 1})
    doc.saveas(path)
    return path


def _texts(path: Path) -> set[str]:
    preview = extract_preview(str(path), mode="zh_to_en", include_model=True, include_paper=True)
    return {str(item.get("source") or "") for item in preview["items"]}


def _pdf_colors(path: Path) -> tuple[list[tuple[float, float, float]], list[tuple[float, float, float]]]:
    data = Path(path).read_bytes()
    chunks = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        raw = match.group(1)
        try:
            text = zlib.decompress(raw)
        except zlib.error:
            text = raw
        chunks.append(text)
    blob = b"\n".join(chunks)
    fills = [tuple(float(part) for part in item) for item in re.findall(rb"([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+rg\b", blob)]
    fills.extend((float(item),) * 3 for item in re.findall(rb"(?:^|\s)([0-9.]+)\s+g\b", blob))
    strokes = [tuple(float(part) for part in item) for item in re.findall(rb"([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+RG\b", blob)]
    return fills, strokes


def _near(color, target, tol=0.08) -> bool:
    return all(abs(channel - want) <= tol for channel, want in zip(color, target))


class SwitchGlossaryTests(unittest.TestCase):
    def test_translate_drawing_writes_switch_english_without_an_engine(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = _switch_dxf(root / "switch.dxf")
            result = translate_drawing(
                str(source),
                mode="zh_to_en",
                output_dir=str(root),
                output_name="switch-en",
                provider="deepl",
                engine={},
            )
            written = Path(result["path"])
            self.assertTrue(written.is_file())
            self.assertGreater(result["translated"], 0)
            texts = _texts(written)
            for chinese, english in TERMS.items():
                self.assertNotIn(chinese, texts)
                self.assertTrue(any(english.casefold() in line.casefold() for line in texts), texts)
            self.assertIn(UNKNOWN, texts)

    def test_corrected_sheet_english_and_spaced_title_block(self):
        translator = CADChineseTranslator(log_callback=lambda *args, **kwargs: None)
        expect = {
            "审核": "Reviewed",
            "校对": "Checked",
            "审 核": "Reviewed",
            "校 对": "Checked",
            "分接开关位置数": "Number of tap positions",
            "不同电压数": "Number of voltages",
            "弯油管": "bent oil pipe",
            "放气塞": "vent plug",
            "输出端子": "output terminal",
            "循环电流": "circulating current",
            "有载分接开关": "on-load tap-changer",
            "气体继电器": "Buchholz relay",
        }
        for source, english in expect.items():
            self.assertEqual(translator.glossary_hit(source, "zh_to_en"), english)

    def test_chrome_is_dark_and_color_keeps_a_non_gray_ink(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = _switch_dxf(root / "switch.dxf")
            chrome = export_pdf(str(source), str(root / "chrome.pdf"), appearance="Chrome")
            color = export_pdf(str(source), str(root / "color.pdf"), appearance="彩色")
            self.assertEqual(chrome["appearance"], "Chrome")
            self.assertEqual(color["appearance"], "彩色")
            chrome_fills, _chrome_strokes = _pdf_colors(Path(chrome["path"]))
            color_fills, color_strokes = _pdf_colors(Path(color["path"]))
            dark = (33 / 255, 40 / 255, 48 / 255)
            self.assertTrue(any(_near(item, dark) for item in chrome_fills), chrome_fills[:6])
            self.assertTrue(any(_near(item, (1, 1, 1)) for item in color_fills), color_fills[:6])
            self.assertFalse(any(_near(item, dark) for item in color_fills), color_fills[:6])
            colorful = [item for item in color_strokes if max(item) - min(item) > 0.4]
            self.assertTrue(colorful, color_strokes[:8])

    def test_unset_and_legacy_output_dirs_resolve_to_downloads(self):
        with tempfile.TemporaryDirectory() as home:
            home_path = Path(home)
            with patch("backend.app_meta.Path.home", return_value=home_path):
                downloads = str(home_path / "Downloads")
                self.assertEqual(resolve_output_dir(""), downloads)
                self.assertEqual(resolve_output_dir(str(legacy_output_dir())), downloads)
                chosen = home_path / "jobs"
                self.assertEqual(resolve_output_dir(str(chosen)), str(chosen))
                self.assertFalse((home_path / "Documents" / "Tuyi output").exists())


class SwitchCliTests(unittest.TestCase):
    def test_cli_translate_twice_agrees_on_switch_english(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = _switch_dxf(root / "switch.dxf")
            outputs = []
            for name in ("one.dxf", "two.dxf"):
                completed = subprocess.run(
                    [sys.executable, "-m", "tuyi", "translate", str(source), "--output-dir", str(root), "-o", name],
                    cwd=str(REPO),
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    check=False,
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertIn(name, completed.stdout)
                outputs.append(root / name)
            first, second = (_texts(path) for path in outputs)
            self.assertEqual(first, second)
            for chinese, english in TERMS.items():
                self.assertNotIn(chinese, first)
                self.assertTrue(any(english.casefold() in line.casefold() for line in first), first)
            self.assertIn(UNKNOWN, first)


if __name__ == "__main__":
    unittest.main()
