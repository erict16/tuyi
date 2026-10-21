"""Built-in zh→en terms must match Huaming's locked English, and title blocks must hit."""

import unittest

from backend.translator import CADChineseTranslator, apply_builtin_glossary, collapse_cjk_gaps, merged_zh_to_en_context

# Huaming locked English (huaming-oltc-translate locks.md). Short drawing forms
# that Tuyi deliberately prints (OLTC, OCTC, MDU, VI) are listed as accepted.
LOCKS = {
    "上海华明电力设备制造有限公司": {"Shanghai Huaming Power Equipment Co., Ltd."},
    "均压罩": {"terminal screen caps"},
    "均压环": {"grading ring"},
    "保护继电器": {"protective relay"},
    "气体继电器": {"Buchholz relay"},
    "布赫霍尔茨继电器": {"Buchholz relay"},
    "有载分接开关保护继电器": {"OLTC protective relay"},
    "切换开关": {"diverter switch"},
    "切换开关芯子": {"diverter switch insert"},
    "分接选择器": {"tap selector"},
    "转换选择器": {"change-over selector"},
    "选择开关": {"selector switch"},
    "组合式": {"combined"},
    "复合式": {"compound"},
    "笼式": {"cage type"},
    "鼓式": {"drum type"},
    "有载分接开关": {"OLTC", "on-load tap-changer (OLTC)"},
    "无载分接开关": {"OCTC", "off-circuit tap-changer (OCTC)"},
    "无励磁分接开关": {"DETC", "de-energized tap-changer (DETC)"},
    "过渡电阻": {"transition resistor"},
    "软连接": {"flexible lead"},
    "电动机构": {"MDU", "motor drive unit (MDU)"},
    "垂直传动轴": {"vertical driving shaft"},
    "水平传动轴": {"horizontal driving shaft"},
    "传动轴": {"driving shaft"},
    "油室": {"oil compartment"},
    "变压器油箱": {"transformer tank"},
    "压力释放阀": {"pressure relief valve"},
    "真空灭弧室": {"VI", "vacuum interrupter (VI)"},
    "剪切销": {"shear pin"},
    "冷压管": {"crimp sleeve"},
    "正反调": {"reversing (W)"},
    "粗细调": {"coarse-fine (G)"},
    "星点": {"star-point"},
    "线端": {"line-end"},
}


class GlossaryAccuracyTests(unittest.TestCase):
    def setUp(self):
        self.translator = CADChineseTranslator()
        apply_builtin_glossary(self.translator, "all")

    def hit(self, text):
        return self.translator.glossary_hit(text, "zh_to_en")

    def test_locked_terms_use_huaming_english(self):
        context = merged_zh_to_en_context()
        for source, allowed in LOCKS.items():
            with self.subTest(source=source):
                self.assertIn(source, context, "locked term missing")
                self.assertIn(context[source].casefold(), {a.casefold() for a in allowed})

    def test_detc_is_not_octc(self):
        self.assertEqual(self.hit("无励磁分接开关"), "DETC")
        self.assertEqual(self.hit("无载分接开关"), "OCTC")

    def test_company_name_on_every_frame(self):
        self.assertEqual(self.hit("上海华明电力设备制造有限公司"), "Shanghai Huaming Power Equipment Co., Ltd.")

    def test_spaced_title_block_cells_hit(self):
        cases = {"设     计": "Design", "日   期": "Date", "名       称": "Name", "校  对": "Checked", "重  量(kg)": "Weight (kg)"}
        for source, target in cases.items():
            with self.subTest(source=source):
                self.assertEqual(self.hit(source), target)

    def test_gap_collapse_only_between_cjk(self):
        self.assertEqual(collapse_cjk_gaps("设     计"), "设计")
        self.assertEqual(collapse_cjk_gaps("CM2 III 型"), "CM2 III 型")
        self.assertEqual(collapse_cjk_gaps("A 相 6 号"), "A 相 6 号")

    def test_whole_cell_match_only(self):
        # A term inside a longer note is not swapped piecemeal.
        self.assertIsNone(self.hit("数量表"))
        self.assertIsNone(self.hit("型号规格说明"))

    def test_no_term_translates_to_chinese_or_blank(self):
        for source, target in merged_zh_to_en_context().items():
            with self.subTest(source=source):
                self.assertTrue(target.strip())
                self.assertNotRegex(target, r"[一-鿿]")


if __name__ == "__main__":
    unittest.main()
