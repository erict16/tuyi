"""CAXA labels: one character per MTEXT, and titles that must stay in the frame."""
import json
import tempfile
import unittest
from pathlib import Path

import ezdxf
from ezdxf.tools.text_size import mtext_size

from backend.drawings import _drop_lone_font_code, extract_preview, translate_drawing
from backend.styles import rewrite_shx_styles
from backend.text_layout import fit_translated_labels


def _caxa_label(doc, name, text, origin=(0, 0), height=43.3, pitch=39.6):
    """A detail label the way CAXA writes it: one MTEXT per character."""
    block = doc.blocks.new(name)
    for index, char in enumerate(text):
        block.add_mtext(char, dxfattribs={
            "insert": (index * pitch, 0), "char_height": height, "attachment_point": 1,
        })
    doc.modelspace().add_blockref(name, origin)
    return block


class SplitCjkLabelTests(unittest.TestCase):
    def test_one_char_per_mtext_label_is_translated_as_one_phrase(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = ezdxf.new()
            _caxa_label(doc, "LABEL_I", "输出端子尺寸")
            _caxa_label(doc, "LABEL_II", "选择开关端子", origin=(0, -200))
            source = root / "caxa.dxf"
            doc.saveas(source)

            rows = extract_preview(str(source), include_blocks=True)["items"]
            sources = {row["source"] for row in rows}
            self.assertIn("输出端子尺寸", sources)
            self.assertIn("选择开关端子", sources)
            self.assertFalse(any(len(text) == 1 for text in sources))

            glossary = root / "terms.json"
            glossary.write_text(json.dumps({"format": "honsen-cad-terms/v1", "name": "t", "terms": [
                {"mode": "zh_to_en", "source": "输出端子尺寸", "target": "Output terminal size", "layer_contains": ""},
                {"mode": "zh_to_en", "source": "选择开关端子", "target": "Selector switch terminal", "layer_contains": ""},
            ]}, ensure_ascii=False), encoding="utf-8")
            result = translate_drawing(str(source), output_dir=tmp, output_name="english",
                                       project_package_path=str(glossary))
            self.assertEqual(result["untranslated"], [])
            saved = ezdxf.readfile(result["path"])
            for name, english in (("LABEL_I", "Output terminal size"), ("LABEL_II", "Selector switch terminal")):
                texts = [entity.plain_text() for entity in saved.blocks.get(name).query("MTEXT")]
                self.assertEqual(texts[0], english)
                self.assertEqual([text for text in texts[1:] if text], [])

    def test_scattered_single_characters_stay_apart(self):
        with tempfile.TemporaryDirectory() as tmp:
            doc = ezdxf.new()
            msp = doc.modelspace()
            msp.add_mtext("页", dxfattribs={"insert": (0, 0), "char_height": 10})
            msp.add_mtext("共", dxfattribs={"insert": (200, 0), "char_height": 10})
            msp.add_mtext("张", dxfattribs={"insert": (210, 50), "char_height": 10})
            source = Path(tmp) / "apart.dxf"
            doc.saveas(source)
            sources = sorted(row["source"] for row in extract_preview(str(source))["items"])
            self.assertEqual(sources, ["共", "张", "页"])


class TitleFitTests(unittest.TestCase):
    def _sheet(self, frame_x):
        doc = ezdxf.new()
        # Write-back maps SHX styles to the bundled CJK font before fitting.
        rewrite_shx_styles(doc)
        msp = doc.modelspace()
        msp.add_lwpolyline([(-10, -10), (frame_x, -10), (frame_x, 200), (-10, 200)], close=True)
        return doc, msp

    def test_font_coded_title_shrinks_to_stay_inside_the_frame(self):
        doc, msp = self._sheet(600)
        target = "CV2III-350/600-10193(1)W/12233(1)W Bell-Type, Tie-in Resistor on Oil Compartment Side, Outline Drawing"
        title = msp.add_mtext(r"\fArial|b0|i0|c134|p0;" + target, dxfattribs={
            "insert": (0, 150), "char_height": 10, "attachment_point": 1,
        })
        fit_translated_labels(doc, [{"handle": title.dxf.handle,
            "source": "CV2III-350/600-10193(1)W/12233(1)W钟-电位电阻油室侧面-外形尺寸图", "target": target}])
        self.assertLess(title.dxf.char_height, 10)
        self.assertLessEqual(title.dxf.insert.x + mtext_size(title).total_width, 600)
        self.assertTrue(title.text.startswith(r"\fArial"))

    def test_title_uses_free_space_before_shrinking(self):
        doc, msp = self._sheet(3000)
        target = "Outline Drawing"
        title = msp.add_mtext(target, dxfattribs={"insert": (0, 150), "char_height": 10})
        fit_translated_labels(doc, [{"handle": title.dxf.handle, "source": "外形图", "target": target}])
        self.assertEqual(title.dxf.char_height, 10)

    def test_shrunk_free_label_keeps_its_baseline(self):
        doc, msp = self._sheet(120)
        label = msp.add_mtext("Output terminal size", dxfattribs={
            "insert": (0, 100), "char_height": 10, "attachment_point": 1,
        })
        fit_translated_labels(doc, [{"handle": label.dxf.handle, "source": "输出端子", "target": "Output terminal size"}])
        height = label.dxf.char_height
        self.assertLess(height, 10)
        self.assertAlmostEqual(label.dxf.insert.y - height, 100 - 10)

    def test_twin_labels_share_the_smaller_size(self):
        doc, msp = self._sheet(3000)
        msp.add_line((180, 120), (180, 200))  # a dimension close after the left label
        left = msp.add_mtext("Mounting dimensions, 10 contacts", dxfattribs={"insert": (0, 160), "char_height": 10})
        right = msp.add_mtext("Mounting dimensions, 12 contacts", dxfattribs={"insert": (1200, 160), "char_height": 10})
        fit_translated_labels(doc, [
            {"handle": left.dxf.handle, "source": "10个触头安装尺寸图", "target": "Mounting dimensions, 10 contacts"},
            {"handle": right.dxf.handle, "source": "12个触头安装尺寸图", "target": "Mounting dimensions, 12 contacts"},
        ])
        self.assertLess(left.dxf.char_height, 10)
        self.assertAlmostEqual(left.dxf.char_height, right.dxf.char_height)
        self.assertAlmostEqual(right.dxf.insert.y - right.dxf.char_height, 160 - 10)


class PlotFontCodeTests(unittest.TestCase):
    def test_lone_plain_font_code_is_dropped_for_plotting(self):
        self.assertEqual(_drop_lone_font_code(r"\fPingFang SC Light|b0|i0|c134|p0;CV2 W Bell"), "CV2 W Bell")
        self.assertEqual(_drop_lone_font_code(r"{\fArial|b0|i0|c0|p0;A B}"), "A B")

    def test_styled_or_mixed_font_codes_are_kept(self):
        for text in (r"\fArial|b1|i0|c0|p0;Bold", r"\fArial|b0|i1|c0|p0;Italic",
                     r"\fArial|b0|i0|c0|p0;A\PB", r"\fArial|b0|i0|c0|p0;A{\C1;B}"):
            self.assertEqual(_drop_lone_font_code(text), text)


if __name__ == "__main__":
    unittest.main()
