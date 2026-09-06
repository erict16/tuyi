<p align="center">
  <img src="docs/icons/app-rounded.png" width="128" alt="Tuyi">
</p>

<h1 align="center">图译 Tuyi</h1>

<p align="center">Open a DWG or DXF. Translate the text. Get a new file. Original stays put.</p>

<p align="center">
  <b>English</b> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

<p align="center">
  <img src="docs/screenshots/home.png" width="920" alt="Tuyi home: add a drawing on the left, translate at the bottom">
</p>

Tuyi is a desktop app for **Windows 10/11 (64-bit)** and **macOS** (Apple silicon and Intel). You drop in a CAD drawing, it lists the text, you hit **翻译**, and it writes a **new** drawing. The original file is not changed.

You do not need AutoCAD.

## Install

Download from [Releases](https://github.com/erict16/tuyi/releases). Site: the landing page on this repo.

- **Windows:** run `Tuyi_*_Setup.exe`. You can pick the folder. 32-bit is not supported.
- **Mac:** Apple silicon and Intel are **different** DMGs. Open the DMG and drag 图译 into Applications.

The build is not code-signed. First launch will warn you. That is expected.

- **Windows:** More info → Run anyway.
- **Mac:** right-click → Open. Or System Settings → Privacy & Security → Open Anyway.

## How to use it

1. Click **添加图纸** or drop a `.dwg` / `.dxf` on the left. Several files at once is fine.
2. Pick Chinese → English (or another pair) at the top.
3. Click **翻译**. Tuyi writes a new file. You can edit a row first if you want.
4. Keys and “only translation vs both” live in **设置**. Your word list is **词汇库**.

<p align="center">
  <img src="docs/screenshots/settings.png" width="920" alt="Settings: online translate or your own API">
</p>

## DWG

**DXF** works out of the box.

**DWG** needs [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) on the same computer. Tuyi looks on PATH, or you set `CAD_ODA_EXEC`. We cannot ship ODA. Their licence does not allow it.

## Who translates

Tuyi has no cloud account of its own. In **设置** you pick:

- **网上翻译** — DeepL or Azure (your key)
- **自己配接口** — an OpenAI-compatible URL
- **不联网** — Ollama on this machine (under 少用的)

Exact hits in **词汇库** skip the API. The key stays on disk. Tuyi does not phone home. MIT licence.

<p align="center">
  <img src="docs/screenshots/dark.png" width="920" alt="Tuyi in dark mode">
</p>

## Command line

```bash
python -m tuyi translate drawing.dxf
python -m tuyi translate drawing.dwg -o out.dwg --mode zh_to_en
```

A Windows install also has `tuyi-cli.exe` next to `Tuyi.exe`. `python -m dwglot` still works.
