# BUILD: scheme A into the app

2026-09-06. Live UI follows `A.html` / `PICK.md`. React stack unchanged. `APP_VERSION` still 0.1.5. Backend APIs unchanged (写回 still posts `纯译文` / `原译对照` / `译原对照`).

## What landed

- **Mac chrome:** `hasNativeTitlebar()` (uses `isMacChrome`) never renders HTML traffic lights; CSS also hides `.lights` when `data-native-titlebar="true"`. Windows frameless window still draws one row in the toolbar. No second fake titlebar.
- **设置:** 参数 side sheet is gone. Toolbar 参数 → 设置. Full page with 完成, nav 翻译 / 打开范围 / 写回 / 术语 / 这台电脑. Engine keys, ODA, glossary, 检查更新 live there. Closing 完成 still re-extracts if 打开范围/过滤 changed, and saves `/api/config`.
- **Labels:** 数字、尺寸 / 重复的句子 / 不是原文那种语言 / 图纸上只留译文 / 原文和译文都留 / 网上翻译 / 这台电脑 / 自己的接口 / 全部文字 / 去掉重复. `title` keeps a one-line gloss. 批量导入 (导出表格 / 导入表格 / 全部写回) sits in the batch inspector, not a third tab.
- **检查更新:** footer spinner, 180ms `cubic-bezier(0.23, 1, 0.32, 1)`, `@starting-style` + opacity. `prefers-reduced-motion` drops spin/transform, opacity only. No `window.open`.
- **Empty copy:** 还没打开图纸，点左上角打开. Sidebar: 打开 DWG 或 DXF。字会进右边这张表。

Files: `frontend/src/App.jsx`, `frontend/src/App.css`, frontend-label asserts in `tests/test_drawings.py` / `test_translation_modes.py` / `test_platform_compatibility.py`.
