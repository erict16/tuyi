"""重复的句子只译一次，但图上每一处都写回 (desktop grid + batch queue)."""

from __future__ import annotations

import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import ezdxf
from fastapi.testclient import TestClient

from backend.api import app, service
from backend.drawings import extract_preview, fill_duplicate_targets, translate_rows, writeback_rows

FIXTURES = Path(__file__).resolve().parent / "fixtures"
CJK = re.compile(r"[一-鿿]")


def _all_texts(path: Path) -> list[str]:
    doc = ezdxf.readfile(path)
    texts: list[str] = []

    def walk(entities):
        for entity in entities:
            kind = entity.dxftype()
            if kind == "TEXT":
                texts.append(entity.dxf.text)
            elif kind == "MTEXT":
                texts.append(entity.plain_text(fast=False))
            elif kind == "INSERT":
                texts.extend(attrib.dxf.text for attrib in entity.attribs)

    for layout in doc.layouts:
        walk(layout)
    for block in doc.blocks:
        if not block.name.startswith("*"):
            walk(block)
    return texts


class FillDuplicateTargetsTests(unittest.TestCase):
    def test_empty_duplicates_inherit_the_first_copy(self):
        rows = [
            {"source": "配电箱", "target": "distribution board", "target_raw": "distribution board", "via": "glossary", "duplicate": False},
            {"source": "配电箱", "target": "", "duplicate": True, "selected": False},
            {"source": "接地", "target": "", "duplicate": False},
            {"source": "接地", "target": "", "duplicate": True},
        ]
        out = fill_duplicate_targets(rows)
        self.assertEqual(out[1]["target"], "distribution board")
        self.assertEqual(out[1]["via"], "glossary")
        self.assertEqual(out[3]["target"], "")
        self.assertEqual(rows[1]["target"], "", "input rows must not be mutated")

    def test_unticked_lead_or_excluded_copy_is_not_filled(self):
        rows = [
            {"source": "配电箱", "target": "distribution board", "duplicate": False, "selected": False},
            {"source": "配电箱", "target": "", "duplicate": True},
            {"source": "接地", "target": "grounding", "duplicate": False},
            {"source": "接地", "target": "", "duplicate": True, "excluded": True},
        ]
        out = fill_duplicate_targets(rows)
        self.assertEqual(out[1]["target"], "")
        self.assertEqual(out[3]["target"], "")

    def test_a_hand_edited_duplicate_keeps_its_own_text(self):
        rows = [
            {"source": "配电箱", "target": "distribution board", "duplicate": False},
            {"source": "配电箱", "target": "DB-2", "via": "edit", "duplicate": True},
        ]
        self.assertEqual(fill_duplicate_targets(rows)[1]["target"], "DB-2")


class DuplicateWritebackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.dxf = self.root / "floor_plan.dxf"
        shutil.copy(FIXTURES / "floor_plan.dxf", self.dxf)

    def tearDown(self):
        self.tmp.cleanup()

    def test_grid_translates_one_copy_and_writes_every_copy(self):
        preview = extract_preview(str(self.dxf), include_blocks=True, enable_v02=True)
        rows = preview["items"]
        self.assertTrue(any(row["duplicate"] for row in rows), "fixture must repeat a label")
        unique = [row for row in rows if not row["duplicate"]]
        translated = translate_rows(unique, mode="zh_to_en", provider="deepl", engine={})
        by_id = {item["id"]: item for item in translated["items"]}
        merged = [by_id.get(row["id"], row) for row in rows]

        output = writeback_rows(str(self.dxf), merged, output_dir=str(self.root), output_name="en_floor", mode="zh_to_en")
        self.assertEqual(output["written"], len(rows))
        texts = _all_texts(Path(output["path"]))
        self.assertEqual([text for text in texts if CJK.search(text)], [])
        self.assertGreaterEqual(texts.count("floor plan"), 2)

    def test_an_excluded_copy_stays_as_it_was(self):
        preview = extract_preview(str(self.dxf), include_blocks=True, enable_v02=True)
        rows = translate_rows(preview["items"], mode="zh_to_en", provider="deepl", engine={})["items"]
        repeat = next(row for row in rows if row["duplicate"])
        rows = [dict(row, excluded=True) if row is repeat else row for row in rows]
        output = writeback_rows(str(self.dxf), rows, output_dir=str(self.root), output_name="en_skip", mode="zh_to_en")
        self.assertEqual(output["written"], len(rows) - 1)
        self.assertIn(repeat["source"], _all_texts(Path(output["path"])))


class BatchDuplicateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._tasks = list(service.batch.tasks)
        self._started = service.batch.started
        service.batch.tasks = []
        service.batch.started = False
        self.client = TestClient(app)

    def tearDown(self):
        service.batch.stop()
        service.batch.tasks = self._tasks
        service.batch.started = self._started
        self.tmp.cleanup()

    def test_batch_start_never_drops_repeated_labels(self):
        src = Path(self.tmp.name) / "floor_plan.dxf"
        shutil.copy(FIXTURES / "floor_plan.dxf", src)
        self.assertEqual(self.client.post("/api/batch/add", json={"files": [str(src)]}).status_code, 200)
        seen = {}

        def fake_start(settings, include_succeeded=False):
            seen.update(settings)
            return service.batch.snapshot()

        config = {"deepl_key": "", "provider": "deepl", "output_dir": self.tmp.name, "project_package_path": ""}
        with patch.object(service, "load_config", return_value=config), patch.object(service, "save_config"), patch.object(service.batch, "start", side_effect=fake_start):
            response = self.client.post(
                "/api/batch/start",
                json={"provider": "deepl", "output_dir": self.tmp.name, "translation_mode": "zh_to_en", "skip_dupes": True},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIs(seen.get("skip_dupes"), False)


if __name__ == "__main__":
    unittest.main()
