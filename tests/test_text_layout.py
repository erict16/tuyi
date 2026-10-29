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

    def test_company_name_wraps_to_two_lines_inside_its_band(self):
        from ezdxf.enums import TextEntityAlignment
        from ezdxf.fonts import fonts
        doc = ezdxf.new()
        block = doc.blocks.new("FRAME")
        source = "上海华明电力设备制造有限公司"
        target = "Shanghai Huaming Power Equipment Co., Ltd."
        # Real CV2 frame: FIT text from x -43.8 to -1.3, baseline 15.1, height 5.8,
        # in a cell from y 11.8 to 26.
        name = block.add_text(target, height=5.8)
        name.set_placement((-43.8, 15.1), (-1.3, 15.1), align=TextEntityAlignment.FIT)
        count = fit_translated_labels(doc, [dict(handle=name.dxf.handle, source=source, target=target)])
        self.assertEqual(count, 1)
        texts = sorted(block.query("TEXT"), key=lambda t: -t.dxf.insert.y)
        self.assertEqual([t.dxf.text for t in texts], ["Shanghai Huaming Power", "Equipment Co., Ltd."])
        font = fonts.make_font(str(register_cjk_font()), cap_height=1)
        for text in texts:
            self.assertEqual(text.dxf.halign, 0)
            self.assertAlmostEqual(text.dxf.insert.x, texts[0].dxf.insert.x)
            self.assertGreater(text.dxf.insert.x, -43.8)
            self.assertGreaterEqual(text.dxf.height, 3.5)
            self.assertLessEqual(text.dxf.insert.x + font.text_width(text.dxf.text) * text.dxf.height * text.dxf.width, -1.3 + 1e-6)
        top = texts[0].dxf.insert.y + texts[0].dxf.height
        bottom = texts[1].dxf.insert.y - 0.3 * texts[1].dxf.height  # descenders
        self.assertLess(top, 26)
        self.assertGreater(bottom, 11.8)
        self.assertGreater(texts[0].dxf.insert.y - texts[1].dxf.insert.y, texts[1].dxf.height)

    def test_short_fit_code_is_not_stretched(self):
        from ezdxf.enums import TextEntityAlignment
        doc = ezdxf.new()
        code = doc.modelspace().add_text("OLTC", height=5, dxfattribs={"width": 0.7})
        code.set_placement((10, 3), (60, 3), align=TextEntityAlignment.FIT)
        fit_translated_labels(doc, [dict(handle=code.dxf.handle, source="型有载分接开关", target="OLTC")])
        self.assertEqual(code.dxf.halign, 0)
        self.assertEqual(tuple(code.dxf.insert)[:2], (10, 3))
        self.assertEqual(code.dxf.height, 5)
        self.assertEqual(code.dxf.width, 0.7)

    def test_rich_multiline_mtext_is_preserved(self):
        doc = ezdxf.new()
        raw = r"{\C1;First\PSecond}"
        note = doc.modelspace().add_mtext(raw,dxfattribs={"char_height":3,"width":10})
        fit_translated_labels(doc,[dict(handle=note.dxf.handle,source="第一行\n第二行",target="First\nSecond")])
        self.assertEqual(note.text,raw)
        self.assertEqual(note.dxf.char_height,3)
