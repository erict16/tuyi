"""Stacked model-space sheets must plot one page each, not one shrunk page."""

from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

import ezdxf

from backend.drawings import export_pdf
from backend.sheet_pdf import sheet_frames


def _pdf_page_count(path: Path) -> int:
    data = path.read_bytes()
    return len(re.findall(rb"/Type\s*/Page(?!s)", data))


def _stacked(path: Path, *, paper_line: bool = False) -> None:
    doc = ezdxf.new("R2010")
    frame = doc.blocks.new("FRAME")
    frame.add_lwpolyline([(0, 0), (1800, 0), (1800, 1300), (0, 1300)], close=True)
    model = doc.modelspace()
    model.add_blockref("FRAME", (0, 2000))
    model.add_text("TOP-SHEET", dxfattribs={"insert": (100, 2600), "height": 40})
    model.add_blockref("FRAME", (0, 600))
    model.add_text("LOW-SHEET", dxfattribs={"insert": (100, 1200), "height": 40})
    if paper_line:
        doc.layouts.get("Layout1").add_line((0, 0), (10, 0))
    doc.saveas(path)


def _single(path: Path) -> None:
    doc = ezdxf.new("R2010")
    frame = doc.blocks.new("FRAME")
    frame.add_lwpolyline([(0, 0), (1800, 0), (1800, 1300), (0, 1300)], close=True)
    model = doc.modelspace()
    model.add_blockref("FRAME", (0, 0))
    model.add_line((10, 10), (100, 10))
    doc.saveas(path)


class SheetFrameTests(unittest.TestCase):
    def test_frames_are_top_then_bottom(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "two.dxf"
            _stacked(path)
            frames = sheet_frames(ezdxf.readfile(path))
            self.assertEqual(len(frames), 2)
            self.assertGreater(frames[0][1], frames[1][3])

    def test_export_splits_stacked_frames_onto_landscape_a4(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "two.dxf"
            _stacked(source)
            result = export_pdf(str(source), str(root / "two.pdf"), appearance="黑白")
            self.assertEqual(result["pages"], 2)
            self.assertEqual(result["paper"], "a4l")
            self.assertEqual(_pdf_page_count(Path(result["path"])), 2)

    def test_single_frame_stays_one_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "one.dxf"
            _single(source)
            result = export_pdf(str(source), str(root / "one.pdf"), appearance="黑白")
            self.assertEqual(result["pages"], 1)
            self.assertEqual(result["paper"], "a4")
            self.assertEqual(_pdf_page_count(Path(result["path"])), 1)

    def test_paperspace_is_not_split_into_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "paper.dxf"
            _stacked(source, paper_line=True)
            result = export_pdf(str(source), str(root / "paper.pdf"), appearance="黑白")
            self.assertEqual(result["pages"], 2)
            self.assertEqual(result["paper"], "a4")
            self.assertEqual(_pdf_page_count(Path(result["path"])), 2)


if __name__ == "__main__":
    unittest.main()
