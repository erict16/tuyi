<p align="center">
  <img src="docs/icons/app-rounded.png" width="128" alt="图译">
</p>

<h1 align="center">图译 Tuyi</h1>

<p align="center">打开图纸，译上面的字，另存一份新文件。原图不动。</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>简体中文</b>
</p>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

<p align="center">
  <img src="docs/screenshots/home.png" width="920" alt="图译主界面：左边加图纸，底下点翻译">
</p>

图译是装在电脑上的软件，**Windows 10/11（64 位）** 和 **Mac**（Apple 芯片、Intel）都能用。把 DWG / DXF 丢进去，点 **翻译**，它写出一份新图。原来那张不动。

不用装 AutoCAD。

## 怎么装

去 [Releases](https://github.com/erict16/tuyi/releases) 下载。

- **Windows：** 跑 `Tuyi_*_Setup.exe`。文件夹可以自己选。32 位不行。
- **Mac：** Apple 芯片和 Intel **不是**同一个 DMG。打开后把「图译」拖进应用程序。

安装包还没买代码签名，第一次打开系统会拦，这是正常的。

- **Windows：** 更多信息 → 仍要运行。
- **Mac：** 右键 → 打开。或 系统设置 → 隐私与安全性 → 仍要打开。

## 怎么用

1. 点左边 **添加图纸**，或把 `.dwg` / `.dxf` 拖进去。一次可以多张。
2. 上面选中 → 英（或别的方向）。
3. 点 **翻译**。会写出新文件。某一行不对，可以先改再译。
4. 密钥、「图上只留译文还是都留」在 **设置**。自己的词在 **词汇库**。

<p align="center">
  <img src="docs/screenshots/settings.png" width="920" alt="设置：网上翻译或自己配接口">
</p>

## DWG

**DXF** 装上就能用。

**DWG** 要本机先装 [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter)。图译会在 PATH 里找，也可以设 `CAD_ODA_EXEC`。ODA 不能打进安装包，他们的许可不允许。

## 谁来译

图译自己没有网号。在 **设置** 里选：

- **网上翻译** — DeepL 或 Azure（用你的密钥）
- **自己配接口** — 兼容 OpenAI 的网址
- **不联网** — 本机 Ollama（在「少用的」里）

**词汇库** 对上的词不走接口。密钥只存在这台电脑。图译不回传。MIT 许可。

<p align="center">
  <img src="docs/screenshots/dark.png" width="920" alt="图译深色模式">
</p>
