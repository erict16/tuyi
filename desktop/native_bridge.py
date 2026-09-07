"""Native file dialogs exposed to the React UI via pywebview."""

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import webview

THEME_FILE = Path.home() / ".tuyi_theme"


def _as_dark(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "dark", "yes"}
    return bool(value)


def read_saved_dark() -> bool:
    try:
        return THEME_FILE.read_text(encoding="utf-8").strip() == "dark"
    except OSError:
        return False


def _paint_macos(dark: bool) -> None:
    from AppKit import NSAppearance, NSApp, NSColor

    name = "NSAppearanceNameDarkAqua" if dark else "NSAppearanceNameAqua"
    appearance = NSAppearance.appearanceNamed_(name)
    if dark:
        bg = NSColor.colorWithCalibratedRed_green_blue_alpha_(0.055, 0.078, 0.110, 1.0)
    else:
        bg = NSColor.colorWithCalibratedRed_green_blue_alpha_(1.0, 1.0, 1.0, 1.0)
    NSApp.setAppearance_(appearance)
    windows = list(NSApp.windows() or [])
    try:
        import webview

        for item in webview.windows:
            native = getattr(item, "native", None)
            if native is not None and native not in windows:
                windows.append(native)
    except Exception:
        pass

    def walk(view) -> None:
        if view is None:
            return
        try:
            view.setAppearance_(appearance)
        except Exception:
            pass
        try:
            subs = view.subviews()
        except Exception:
            return
        for sub in list(subs or []):
            walk(sub)

    for window in windows:
        try:
            window.setAppearance_(appearance)
        except Exception:
            pass
        try:
            window.setBackgroundColor_(bg)
        except Exception:
            pass
        try:
            window.setTitlebarAppearsTransparent_(True)
        except Exception:
            pass
        try:
            walk(window.contentView())
        except Exception:
            pass
        try:
            window.displayIfNeeded()
        except Exception:
            pass


def apply_chrome_theme(dark: bool = False) -> dict:
    """Paint the OS titlebar. AppKit / DWM must run on the GUI thread."""
    dark = _as_dark(dark)
    try:
        THEME_FILE.write_text("dark" if dark else "light", encoding="utf-8")
    except OSError:
        pass
    if sys.platform == "darwin":
        try:
            from Foundation import NSOperationQueue, NSThread

            if NSThread.isMainThread():
                _paint_macos(dark)
            else:
                NSOperationQueue.mainQueue().addOperationWithBlock_(lambda: _paint_macos(dark))
                try:
                    _paint_macos(dark)
                except Exception:
                    pass
        except Exception:
            try:
                _paint_macos(dark)
            except Exception:
                return {"ok": False}
        return {"ok": True}
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            from backend.app_meta import APP_TITLE, APP_VERSION

            user32 = ctypes.windll.user32
            hwnd = user32.FindWindowW(None, f"{APP_TITLE} v{APP_VERSION}")
            if not hwnd:
                return {"ok": False}
            value = wintypes.BOOL(1 if dark else 0)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(value), ctypes.sizeof(value))
        except Exception:
            return {"ok": False}
        return {"ok": True}
    return {"ok": True}


class NativeBridge:
    @staticmethod
    def _window():
        if not webview.windows:
            raise RuntimeError("桌面窗口尚未就绪")
        return webview.windows[0]

    def _open_dialog(self, *, multiple: bool = False, file_types=()) -> list[str]:
        paths = self._window().create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=multiple,
            file_types=file_types,
        )
        return list(paths or ())

    def _save_dialog(self, filename: str, file_types=()) -> str:
        paths = self._window().create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=filename,
            file_types=file_types,
        )
        return str(paths[0]) if paths else ""

    def pick_dxf_file(self) -> dict:
        return self.pick_cad_file()

    def pick_cad_file(self) -> dict:
        paths = self._open_dialog(file_types=("图纸 (*.dwg;*.dxf)",))
        path = paths[0] if paths else ""
        if not path:
            return {"path": "", "dir": "", "base": "", "ext": ""}
        base, ext = os.path.splitext(os.path.basename(path))
        return {
            "path": path,
            "dir": os.path.dirname(path),
            "base": base,
            "ext": ext.lower(),
        }

    def pick_cad_files(self) -> dict:
        return {"paths": self._open_dialog(multiple=True, file_types=("图纸 (*.dwg;*.dxf)",))}

    def pick_output_dir(self) -> dict:
        paths = self._window().create_file_dialog(webview.FOLDER_DIALOG)
        path = str(paths[0]) if paths else ""
        return {"path": path or ""}

    def set_chrome_theme(self, dark: bool = False) -> dict:
        return apply_chrome_theme(dark)

    def open_url(self, url: str) -> dict:
        if not url or not url.startswith(("https://", "http://")):
            return {"error": "无效链接"}
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception:
            return {"error": "打不开链接"}
        return {"ok": True}

    def toggle_maximize(self) -> None:
        if webview.windows:
            webview.windows[0].toggle_fullscreen()

    def pick_term_package(self) -> dict:
        paths = self._open_dialog(file_types=("图译术语包 (*.hcterms.json)", "JSON files (*.json)"))
        path = paths[0] if paths else ""
        return {"path": path or ""}

    def save_term_package(self) -> dict:
        path = self._save_dialog("项目术语.hcterms.json", ("图译术语包 (*.hcterms.json)",))
        return {"path": path or ""}

    def pick_table_file(self) -> dict:
        paths = self._open_dialog(file_types=("表格 (*.csv;*.xlsx)", "CSV (*.csv)", "Excel (*.xlsx)", "Text files (*.txt)"))
        path = paths[0] if paths else ""
        if not path:
            return {"path": "", "text": "", "xlsx_b64": ""}
        try:
            raw = Path(path).read_bytes()
        except OSError:
            return {"path": path, "text": "", "xlsx_b64": "", "error": "表格读不出来"}
        import base64

        if path.lower().endswith(".xlsx"):
            return {"path": path, "text": "", "xlsx_b64": base64.b64encode(raw).decode("ascii")}
        text = ""
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if not text.strip() and raw.strip():
            return {"path": path, "text": "", "xlsx_b64": "", "error": "表格读不出来"}
        return {"path": path, "text": text, "xlsx_b64": ""}

    def save_table_file(self, filename: str = "图译表格.csv", content: str = "", xlsx_b64: str = "") -> dict:
        suffix = ".xlsx" if (filename or "").lower().endswith(".xlsx") or xlsx_b64 else ".csv"
        types = ("Excel (*.xlsx)",) if suffix == ".xlsx" else ("CSV (*.csv)",)
        path = self._save_dialog(filename or f"图译表格{suffix}", types)
        if not path:
            return {"path": ""}
        if xlsx_b64:
            import base64

            Path(path).write_bytes(base64.b64decode(xlsx_b64))
        elif content:
            Path(path).write_text(content, encoding="utf-8-sig")
        return {"path": path}

    def export_logs(self) -> dict:
        path = self._save_dialog(
            f"Tuyi_log_{datetime.now():%Y%m%d_%H%M%S}.txt",
            ("Text files (*.txt)",),
        )
        if not path:
            return {"path": ""}
        from backend.api import service
        service.export_logs(path)
        return {"path": path}

    def print_pdf(self, path: str) -> dict:
        from backend.drawings import print_pdf as do_print

        try:
            return do_print(path)
        except FileNotFoundError:
            return {"ok": False, "message": "PDF 不存在"}
        except Exception:
            return {"ok": False, "message": "打印失败"}

    def reveal_file(self, path: str) -> dict:
        if not path or not os.path.isfile(path):
            return {"error": "输出文件不存在，可能已被移动或删除"}
        normalized = os.path.normpath(path)
        if sys.platform == "win32":
            command = ["explorer.exe", "/select,", normalized]
        elif sys.platform == "darwin":
            command = ["open", "-R", normalized]
        else:
            command = ["xdg-open", os.path.dirname(normalized)]
        try:
            subprocess.Popen(command)
        except OSError as exc:
            return {"error": f"无法在文件管理器中定位输出文件: {exc}"}
        return {"ok": True}

    def minimize_window(self) -> None:
        if webview.windows:
            webview.windows[0].minimize()

    def close_window(self) -> None:
        from backend.api import service
        from backend.cad import unmount_embedded_odafc
        service.shutdown()
        unmount_embedded_odafc()
        if webview.windows:
            webview.windows[0].destroy()
