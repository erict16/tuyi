<h4 align="right"><a href="README.md">中文</a> · <b>English</b> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a></h4>

<p align="center">
  <a href="https://erict16.github.io/tuyi/en.html"><img src="landing/shots/og.png" width="900" alt="图译 Tuyi: translate the Chinese on DWG / DXF drawings into English"></a>
</p>

<h1 align="center">图译 Tuyi</h1>
<h3 align="center">Translate the Chinese on your DWG / DXF drawings into English</h3>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
</p>

<p align="center"><img src="docs/icons/app-rounded.png" width="20" alt=""> <a href="https://erict16.github.io/tuyi/en.html">Website</a></p>

Tuyi opens a DWG or DXF drawing, translates the text on it, writes the translation back and saves a new file. The original stays as it is, and you don't need AutoCAD. Title blocks, notes, block attributes, dimensions and tables all get translated.

## Download (v0.1.11, free)

- **Windows 10 / 11 (64-bit):** [Tuyi_v0.1.11_Setup.exe](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_Setup.exe)
- **Mac with Apple silicon (M1 to M4):** [Tuyi_v0.1.11_macOS_arm64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_arm64.dmg)
- **Mac with Intel:** [Tuyi_v0.1.11_macOS_x86_64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_x86_64.dmg)

Not sure which Mac you have? Check About This Mac in the Apple menu. Newer versions show up on [Releases](https://github.com/erict16/tuyi/releases/latest).

The installers aren't signed yet, so the system will stop them the first time. That's expected. On Windows, click More info, then Run anyway. On Mac, open the DMG, drag Tuyi into Applications, and the first time right-click the icon and choose Open.

DXF works right after install. For DWG, also install the free [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter).

## Let your AI assistant run Tuyi for you

Using WorkBuddy, ChatGPT or Claude? They can run Tuyi for you, no clicking needed. Send it this:

> Tuyi is installed on my computer. Please use it to translate the DWG / DXF drawings in my Drawings folder into English, save them as new files, and leave the originals alone.

The assistant has to be allowed to run programs on your computer. That usually means the desktop app, and it will ask you first.

## Screenshots

<p align="center">
  <img src="docs/screenshots/app-home.png" alt="One drawing done: 6 lines in English, saved as a new file">
</p>

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>Glossary</h3>
      <img src="docs/screenshots/app-glossary.png" alt="Built-in terms such as transformer, HV, LV winding">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>Settings</h3>
      <img src="docs/screenshots/app-settings.png" alt="Online translation or your own endpoint">
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>On the drawing</h3>
      <img src="docs/screenshots/app-write.png" alt="Keep only the translation, or keep both">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>Dark</h3>
      <img src="docs/screenshots/app-dark.png" alt="Dark mode">
    </td>
  </tr>
</table>

## How to use it

The app is in Chinese for now. The button names are in brackets.

1. Click Add drawings (添加图纸) on the left, or drop `.dwg` / `.dxf` files there. You can add several.
2. Pick the direction at the bottom left. The default is Chinese → English.
3. Click Quick translate (快速翻译). The new file goes to your Downloads folder. If a line is wrong, fix it and write again.
4. Your own terms go in Glossary (术语管理). Translation keys and what stays on the drawing are in Settings (设置).

## Who translates

Terms that match the glossary are used as is, offline. Common building, switchgear and transformer terms are built in, and you can add your own.

Everything else goes to the service you set up in Settings: DeepL, Azure, an OpenAI-compatible endpoint, or Ollama on your own machine (offline). Tuyi has no sign-up and collects no data.

## For developers

### Command line: let your AI assistant translate the drawings

The command line has no dialogs and no prompts, and it exits when done, so AI assistants and scripts can use it. This is what an assistant runs after you send it the sentence above.

```bash
python -m tuyi translate drawings/floor_plan.dxf drawings/dims_tables.dxf --output-dir out --mode zh_to_en
python -m tuyi pdf out/*.dxf --output-dir out --appearance 黑白
```

Use `python -m tuyi` from the source folder. In an installed copy, `tuyi-cli.exe` sits next to `Tuyi.exe` on Windows, and on Mac it is `Tuyi.app/Contents/MacOS/tuyi-cli`.

Each drawing prints three lines: the new file path, the `extracted` count and the `translated` count. Errors go to stderr with exit code 1; bad arguments exit 2. The original is never overwritten.

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

DWG needs ODA File Converter on the machine, on `PATH` or set via `CAD_ODA_EXEC`. See `python -m tuyi --help` for everything.

For your project's `AGENTS.md` / `CLAUDE.md` / Cursor rules:

```text
To translate CAD drawings, use the Tuyi command line (python -m tuyi in the source folder; tuyi-cli in an installed copy):
python -m tuyi translate <drawing.dwg or .dxf, several allowed> --output-dir <output folder> --mode zh_to_en
On success it prints the new file path, extracted and translated for each drawing. On failure read stderr; the exit code is not 0.
For PDF: python -m tuyi pdf <translated drawings> --output-dir <output folder>
It never overwrites the original. If unsure about options, run python -m tuyi translate --help first.
```

### Run from source

Dev setup and tests are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Originally forked from [etianwang/CAD_translator](https://github.com/etianwang/CAD_translator).
