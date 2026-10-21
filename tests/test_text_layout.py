"""Translated labels must fit their original annotation and title cells."""
import tempfile
import unittest
from pathlib import Path

import ezdxf

from backend.drawings import translate_drawing
from backend.text_layout import fit_translated_labels
from backend.styles import register_cjk_font


class TranslationLayoutTests(unittest.TestCase):
    def test_cli_path_translates_repeated_title_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = ezdxf.new()
            for index in range(2):
                block = doc.blocks.new(f"TITLE_{index}")
                block.add_text("平面布置图")
                doc.modelspace().add_blockref(block.name, (index * 30, 0))
            source = root / "source.dxf"
            doc.saveas(source)
            result = translate_drawing(str(source), output_dir=tmp, output_name="english")
            saved = ezdxf.readfile(result["path"])
            for index in range(2):
                text = list(saved.blocks.get(f"TITLE_{index}").query("TEXT"))[0]
                self.assertEqual(text.dxf.text, "floor plan")

    def test_expanded_mtext_stays_in_one_line_and_keeps_anchor(self):
        from ezdxf.fonts import fonts
        doc = ezdxf.new()
        target = "Driving shaft output direction (with gearbox)"
        note = doc.modelspace().add_mtext(target, dxfattribs={
            "insert": (10, 20), "char_height": 3, "width": 30,
        })
        insert = note.dxf.insert
        count = fit_translated_labels(doc, [{"handle": note.dxf.handle,
            "source": "为传动轴出轴方向（带齿轮盒）", "target": target}])
        self.assertEqual(count, 1)
        self.assertEqual(note.dxf.insert, insert)
        self.assertLess(note.dxf.char_height, 3)
        self.assertEqual(note.text, target)
        # The actual rendered width must fit, not merely a string marker.
        font = fonts.make_font(str(register_cjk_font()), cap_height=note.dxf.char_height)
        self.assertLessEqual(font.text_width(target), 30)

    def test_single_line_text_preserves_footprint_and_numeric_dimensions(self):
        from ezdxf.fonts import fonts
        doc = ezdxf.new()
        label = doc.modelspace().add_text("Contact Connection", dxfattribs={"height": 4})
        number = doc.modelspace().add_text("1071", dxfattribs={"height": 4})
        rows = [dict(handle=label.dxf.handle,source="触头连接",target="Contact Connection"),
                dict(handle=number.dxf.handle,source="1071",target="1071")]
        fit_translated_labels(doc,rows)
        font = fonts.make_font(str(register_cjk_font()),cap_height=1)
        self.assertLessEqual(font.text_width(label.dxf.text)*label.dxf.height*label.dxf.width,
                             font.text_width("触头连接")*4+1e-6)
        self.assertEqual(number.dxf.height,4)
        self.assertEqual(number.dxf.width,1)

    def test_rich_multiline_mtext_is_preserved(self):
        doc = ezdxf.new()
        raw = r"{\C1;First\PSecond}"
        note = doc.modelspace().add_mtext(raw,dxfattribs={"char_height":3,"width":10})
        fit_translated_labels(doc,[dict(handle=note.dxf.handle,source="第一行\n第二行",target="First\nSecond")])
        self.assertEqual(note.text,raw)
        self.assertEqual(note.dxf.char_height,3)
