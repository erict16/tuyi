<h4 align="right"><b>English</b> · <a href="README.md">中文</a></h4>

<p align="center">
  <img src="docs/icons/app-rounded.png" width="128" alt="Tuyi">
</p>

<h1 align="center">图译 Tuyi</h1>

<p align="center">A powerful, open-source DWG translator</p>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

Open a DWG or DXF. Translate the text. Get a new file. The original stays put. No AutoCAD. Windows and Mac.

## Screenshots

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>Home</h3>
      <img src="docs/screenshots/home.png" alt="Add a drawing on the left, translate at the bottom">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>Glossary</h3>
      <img src="docs/screenshots/glossary.png" alt="Your terms hit first">
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>Settings</h3>
      <img src="docs/screenshots/settings.png" alt="Cloud translate or your own endpoint">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>On the drawing</h3>
      <img src="docs/screenshots/appearance.png" alt="Keep translation only, or keep both">
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <h3>Dark</h3>
      <img src="docs/screenshots/dark.png" width="860" alt="Dark mode, including the system titlebar">
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

## License

MIT.
