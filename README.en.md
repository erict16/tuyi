<h4 align="right"><b>English</b> · <a href="README.md">中文</a></h4>

<p align="center">
  <img src="docs/icons/app-rounded.png" width="128" alt="Tuyi">
</p>

<h1 align="center">图译 Tuyi</h1>
<h3 align="center">A powerful, open-source DWG/DXF translator</h3>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

<p align="center">
  <a href="https://erict16.github.io/tuyi/en.html">Website</a>
  ·
  <a href="https://github.com/erict16/tuyi/releases/latest">Download</a>
</p>

Open a DWG or DXF. Translate the text. Get a new file. The original stays put. No AutoCAD. Windows and Mac.

The CLI runs hands-free, so an AI assistant (Claude Code, Cursor, Codex, Grok) or a script can translate drawings for you. See [Command line](#command-line-let-your-ai-assistant-translate-the-drawings).

## Screenshots

<p align="center">
  <img src="docs/screenshots/app-home.png" alt="Home: add a drawing on the left, translate at the bottom">
</p>

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>Glossary</h3>
      <img src="docs/screenshots/app-glossary.png" alt="Your terms hit first">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>Settings</h3>
      <img src="docs/screenshots/app-settings.png" alt="Cloud translate or your own endpoint">
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>On the drawing</h3>
      <img src="docs/screenshots/app-write.png" alt="Keep translation only, or keep both">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>Dark</h3>
      <img src="docs/screenshots/app-dark.png" alt="Dark mode">
    </td>
  </tr>
</table>

## Features

- **Strong:** titles, notes, attributes, dimensions, table text. Translate writes a new drawing
- **Open:** MIT. Your keys stay yours. Tuyi has no accounts
- **Simple:** drop files on the left, translate at the bottom. Engines live in 设置
- **Steady:** glossary hits skip the API. Light / dark. Original files stay read-only

## Install

Get the latest build from [GitHub Releases](https://github.com/erict16/tuyi/releases/latest).

- **Windows 10 / 11 (64-bit):** run `Tuyi_*_Setup.exe`. You can pick the folder. 32-bit is not supported.
- **Mac:** Apple silicon and Intel are **different** DMGs. Drag 图译 into Applications.

The build is not code-signed. First launch will warn you.

- Windows: More info → Run anyway
- Mac: right-click → Open. Or System Settings → Privacy & Security → Open Anyway

DXF works out of the box. DWG needs [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) on the same computer. Tuyi cannot ship ODA.

## How to use it

1. Click **添加图纸** or drop a `.dwg` / `.dxf` on the left.
2. Pick Chinese → English (or another pair).
3. Click **翻译**. Tuyi writes a new file.
4. Keys and layout live in **设置**. Your word list is **词汇库**.

## Command line: let your AI assistant translate the drawings

The CLI runs hands-free: no dialogs, no prompts, it exits when done. So an AI assistant that can run terminal commands (Claude Code, Cursor, Codex, Grok) or your own script can translate drawings end to end.

```bash
python -m tuyi translate drawing.dxf
```

Ask your assistant "translate every drawing in drawings/ to English and export a PDF of each", and it runs:

```console
$ python -m tuyi translate drawings/floor_plan.dxf drawings/dims_tables.dxf --output-dir out --mode zh_to_en
/home/tuyi/project/out/en_floor_plan_11h37_03-10-26.dxf
extracted: 6
translated: 6
/home/tuyi/project/out/en_dims_tables_11h37_03-10-26.dxf
extracted: 4
translated: 4

$ python -m tuyi pdf out/*.dxf --output-dir out --appearance 黑白
out/en_dims_tables_11h37_03-10-26.pdf
appearance: 黑白
paper: a4
pages: 1
out/en_floor_plan_11h37_03-10-26.pdf
appearance: 黑白
paper: a4
pages: 2
```

(Real output, using the two drawings in `tests/fixtures`.)

- Three lines per drawing: new file path, `extracted` count, `translated` count. Errors go to stderr with exit code 1; bad arguments exit 2.
- The original is never overwritten. Tuyi always writes a new file.
- Built-in glossaries (zh ⇄ en, zh ⇄ fr) hit offline; the rest uses the DeepL / Azure / Ollama / custom endpoint saved in Settings.
- Common options: `-o`, `--output-dir`, `--mode zh_to_en`, `--provider`, `--glossary`, `--style`; PDF adds `--paper` and `--appearance`.

Paste this into the chat, or into your project's `AGENTS.md` / `CLAUDE.md` / Cursor rules:

```text
To translate CAD drawings, use the Tuyi CLI (run it from the Tuyi source folder; the Windows install has tuyi-cli.exe):
python -m tuyi translate <drawing.dwg or .dxf, several allowed> --output-dir <output folder> --mode zh_to_en
On success it prints the new file path, extracted and translated for each drawing. On failure read stderr; the exit code is not 0.
For PDF: python -m tuyi pdf <translated drawings> --output-dir <output folder>
It never overwrites the original. If unsure about options, run python -m tuyi translate --help first.
```

Run `python -m tuyi` from the source folder. On Windows, `tuyi-cli.exe` sits next to `Tuyi.exe`; on Mac it is `Tuyi.app/Contents/MacOS/tuyi-cli`. DWG still needs ODA on the machine. See `python -m tuyi --help`.

| Option | Meaning |
| --- | --- |
| `translate --mode` | `zh_to_en` (default), `en_to_zh`, `zh_to_fr`, or `source_to_target` such as `zh-Hans_to_ja` |
| `-o` / `--output` | Single drawing only: write to this file |
| `--output-dir` | Write into this folder; works for several drawings |
| `translate --glossary` | `all` (default), `switch`, `transformer`, `off`, or your own term JSON |
| `translate --provider` | `deepl` / `azure` / `ollama` / `openai`; keys come from the desktop settings |
| `translate --style` | `纯译文` / `原译对照` / `译原对照` |
| `translate --translate-filename` | Also translate Chinese in the file name |
| `pdf --appearance` | `Chrome` (default, dark), `彩色` (white paper), `黑白` |
| `pdf --paper` | `a4` (default, portrait), `a4l`, `a3`, `a3l` |

ODA File Converter must be on `PATH`, or set `CAD_ODA_EXEC`.

## License

MIT. If it helps, star the repo.
