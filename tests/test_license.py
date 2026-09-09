"""Licensing is gone: not on the default 图译 product path."""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class LicensePathTests(unittest.TestCase):
    def test_runtime_has_no_licensing_module(self):
        self.assertFalse((ROOT / "backend" / "licensing.py").exists())
        self.assertFalse((ROOT / "license_public_key.txt").exists())
        self.assertFalse((ROOT / "tools" / "license_issuer.py").exists())

    def test_quarantine_folder_is_gone(self):
        self.assertFalse((ROOT / "quarantine").exists())
        self.assertFalse((ROOT / "sketches").exists())
        self.assertFalse((ROOT / "docs" / "sketches").exists())

    def test_api_has_no_license_routes(self):
        from backend import api as web_api

        paths = {getattr(route, "path", "") for route in web_api.app.routes}
        self.assertNotIn("/api/license/status", paths)
        self.assertNotIn("/api/license/activate", paths)
        self.assertNotIn("/api/support/qrcode/{kind}", paths)
        self.assertIn("/api/updates/check", paths)
        self.assertIn("/api/updates/status", paths)
        self.assertIn("/api/updates/apply", paths)
        self.assertIn("/api/updates/cancel", paths)
        self.assertIn("/api/meta", paths)

    def test_meta_disables_licensing(self):
        from backend.api import app_meta

        meta = app_meta()
        self.assertFalse(meta["licensing_enabled"])
        self.assertTrue(meta["version"])
        self.assertIn("erict16/tuyi", meta["github"])


if __name__ == "__main__":
    unittest.main()
