"""Launch FastAPI + pywebview desktop shell for the React UI."""

from __future__ import annotations

import os
import sys
import threading
import time
import traceback
from pathlib import Path

import uvicorn

from desktop.native_bridge import NativeBridge
from backend.api import API_PORT, FRONTEND_DIST, app, service
from backend.app_meta import APP_TITLE, APP_VERSION
from backend.cad import unmount_embedded_odafc

TITLE = f"{APP_TITLE} v{APP_VERSION}"
_INSTANCE_MUTEX = None
_CRASH_LOG = Path.home() / "Library" / "Logs" / "Tuyi.log"


def _log(message: str) -> None:
    line = message.rstrip() + "\n"
    try:
        _CRASH_LOG.parent.mkdir(parents=True, exist_ok=True)
        with _CRASH_LOG.open("a", encoding="utf-8") as fh:
            fh.write(line)
    except OSError:
        pass
    try:
        sys.stderr.write(line)
    except Exception:
        pass


def _prepare_macos_gui() -> None:
    """Become a real foreground app. Windowed PyInstaller sets LSBackgroundOnly."""
    if sys.platform != "darwin":
        return
    try:
        from AppKit import NSApp, NSApplication

        NSApplication.sharedApplication()
        # 0 = NSApplicationActivationPolicyRegular
        NSApp.setActivationPolicy_(0)
        NSApp.activateIgnoringOtherApps_(True)
        _log("macos gui: activation policy regular")
    except Exception:
        _log("macos gui prepare failed:\n" + traceback.format_exc())


def _webview_gui() -> str | None:
    """Use WebView2 on Windows and the native platform default elsewhere."""
    return "edgechromium" if sys.platform == "win32" else None


def _acquire_single_instance() -> bool:
    """Keep a second desktop window from attaching to an older local API."""
    if sys.platform != "win32":
        return True
    try:
        import ctypes

        global _INSTANCE_MUTEX
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        _INSTANCE_MUTEX = kernel32.CreateMutexW(None, False, "Local\\Tuyi")
        return ctypes.get_last_error() != 183  # ERROR_ALREADY_EXISTS
    except Exception:
        return True


def _wait_server(url: str, timeout: float = 15.0) -> bool:
    import urllib.request

    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if 200 <= getattr(response, "status", 200) < 500:
                    return True
        except Exception as exc:
            last = str(exc)
            time.sleep(0.15)
    if last:
        _log(f"wait_server last error: {last}")
    return False


def _enable_windows_acrylic():
    """Windows 10/11 整窗亚克力/透明效果（WebView2）"""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, TITLE)
        if not hwnd:
            return
        # DWM 窗口圆角 + 暗色边框
        DWMWA_WINDOW_CORNER_PREFERENCE = 33
        DWMWCP_ROUND = 2
        pref = wintypes.INT(DWMWCP_ROUND)
        ctypes.windll.dwmapi.DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            ctypes.byref(pref),
            ctypes.sizeof(pref),
        )
    except Exception:
        pass


def run_web_app():
    try:
        _run_web_app()
    except SystemExit:
        raise
    except Exception:
        _log("launch crashed:\n" + traceback.format_exc())
        raise


def _run_web_app():
    _prepare_macos_gui()
    if not _acquire_single_instance():
        _log("图译已在运行。")
        return
    if not FRONTEND_DIST.exists():
        _log("未找到 frontend/dist，请先构建 React 界面")
        sys.exit(1)

    _log(f"frontend dist: {FRONTEND_DIST}")
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=API_PORT, log_level="warning"))

    api_thread = threading.Thread(target=server.run, daemon=True)
    api_thread.start()

    url = f"http://127.0.0.1:{API_PORT}"
    health = f"{url}/api/health"
    if not _wait_server(health):
        _log("API 服务启动失败")
        server.should_exit = True
        sys.exit(1)
    _log(f"api up {url}")

    import webview

    mac = sys.platform == "darwin"
    webview.settings["OPEN_EXTERNAL_LINKS_IN_BROWSER"] = True
    if not mac:
        webview.settings["DRAG_REGION_DIRECT_TARGET_ONLY"] = True

    bridge = NativeBridge()
    # Borderless NSWindow on recent macOS can never become key, so Finder
    # "opens" the app and you get a Dock icon with zero windows. Use a
    # normal titled window on Mac. Windows keeps the frameless shell.
    window = webview.create_window(
        TITLE,
        url,
        js_api=bridge,
        width=1280,
        height=800,
        min_size=(1024, 680),
        resizable=True,
        transparent=False,
        background_color="#e8e8ed",
        frameless=not mac,
        easy_drag=False,
        shadow=True,
    )

    window.events.loaded += lambda: threading.Timer(0.6, _enable_windows_acrylic).start()
    window.events.closing += lambda *_: service.shutdown()
    _prepare_macos_gui()
    _log("starting webview")
    webview.start(gui="cocoa" if mac else _webview_gui())
    service.shutdown()
    unmount_embedded_odafc()
    os._exit(0)
