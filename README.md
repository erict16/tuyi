<h4 align="right"><b>中文</b> · <a href="README.en.md">English</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a></h4>

<p align="center">
  <a href="https://erict16.github.io/tuyi/"><img src="landing/shots/og.png" width="900" alt="图译 Tuyi：把 DWG / DXF 图纸上的中文译成英文"></a>
</p>

<h1 align="center">图译 Tuyi</h1>
<h3 align="center">把 DWG / DXF 图纸上的中文译成英文</h3>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
</p>

<p align="center"><img src="docs/icons/app-rounded.png" width="20" alt=""> <a href="https://erict16.github.io/tuyi/">官网</a></p>

图译打开 DWG / DXF 图纸，把上面的字译好，写回图纸，另存一份新文件。原图不动，也不用装 AutoCAD。标题栏、注释、块属性、标注、表格里的字都会译。

## 下载（v0.1.11，免费）

- **Windows 10 / 11（64 位）**：[Tuyi_v0.1.11_Setup.exe](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_Setup.exe)
- **Mac，Apple 芯片（M1 到 M4）**：[Tuyi_v0.1.11_macOS_arm64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_arm64.dmg)
- **Mac，Intel**：[Tuyi_v0.1.11_macOS_x86_64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_x86_64.dmg)

不确定 Mac 是哪种芯片，看苹果菜单里的「关于本机」。以后的版本都在 [Releases](https://github.com/erict16/tuyi/releases/latest)。

安装包还没签名，第一次打开系统会拦，这是正常的。Windows 点「更多信息」，再点「仍要运行」。Mac 打开 DMG，把图译拖进应用程序，第一次打开时右键图标，选「打开」。

DXF 装上就能译。译 DWG 还要装免费的 [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter)。

## 让 AI 助手替你运行图译

在用 WorkBuddy、ChatGPT 或 Claude？它们可以替你运行图译，不用你点。把这句话发给它：

> 我电脑上装了图译（Tuyi）。请用它把「图纸」文件夹里的 DWG / DXF 译成英文，另存新文件，原图不要改。

助手要能在你的电脑上运行程序，一般是桌面版，而且会先问你同不同意。

## 界面

<p align="center">
  <img src="docs/screenshots/app-home.png" alt="译完一张图：6 句写成英文，另存成新文件">
</p>

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>术语管理</h3>
      <img src="docs/screenshots/app-glossary.png" alt="内置的变压器、高压、低压绕组等译法">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>设置</h3>
      <img src="docs/screenshots/app-settings.png" alt="网上翻译或自己配接口">
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <h3>图上怎么写</h3>
      <img src="docs/screenshots/app-write.png" alt="图纸上只留译文，或原文译文都留">
    </td>
    <td align="center" valign="top" width="50%">
      <h3>深色</h3>
      <img src="docs/screenshots/app-dark.png" alt="深色模式">
    </td>
  </tr>
</table>

## 怎么用

1. 点左边「添加图纸」，或把 `.dwg` / `.dxf` 拖进来。一次可以加好几张。
2. 左下角选翻译方向，默认中 → 英。
3. 点「快速翻译」。译好的新文件放在下载文件夹。哪一行不对，改了再写一次就行。
4. 自己的专业词放在「术语管理」。翻译接口、图上留什么字在「设置」。

## 谁来译

术语库对上的词直接用，不联网。内置建筑、开关、变压器常用词，也能加你自己的。

没对上的句子，用你自己在「设置」里填的接口：DeepL、Azure，兼容 OpenAI 的接口，或者本机的 Ollama（不联网）。图译不用注册，不收集数据。

## 给开发者

### 命令行：让 AI 助手替你翻译图纸

命令行不弹窗、不提问，跑完自己退出，所以 AI 助手和脚本都能用。上面那句话发给助手后，它跑的就是这个。

```bash
python -m tuyi translate drawings/floor_plan.dxf drawings/dims_tables.dxf --output-dir out --mode zh_to_en
python -m tuyi pdf out/*.dxf --output-dir out --appearance 黑白
```

在源码目录里用 `python -m tuyi`。装好的版本里，Windows 的 `tuyi-cli.exe` 在 `Tuyi.exe` 旁边，Mac 的在 `Tuyi.app/Contents/MacOS/tuyi-cli`。

每张图打印三行：新文件路径、`extracted` 句数、`translated` 句数。出错写到 stderr，退出码 1；参数不对退出码 2。原图不会被覆盖。

| 参数 | 说明 |
| --- | --- |
| `translate --mode` | `zh_to_en`（默认）、`en_to_zh`、`zh_to_fr`，或 `源_to_目标` 如 `zh-Hans_to_ja` |
| `-o` / `--output` | 只译一张时，写到这个文件 |
| `--output-dir` | 写到这个文件夹，多张也行 |
| `translate --glossary` | `all`（默认）、`switch` 开关、`transformer` 变压器、`off`，或你自己的术语 JSON |
| `translate --provider` | `deepl` / `azure` / `ollama` / `openai`，密钥用桌面版设置里存的 |
| `translate --style` | `纯译文` / `原译对照` / `译原对照` |
| `translate --translate-filename` | 文件名里的中文也译 |
| `pdf --appearance` | `Chrome`（默认，深色）、`彩色`（白纸）、`黑白` |
| `pdf --paper` | `a4`（默认竖向）、`a4l`、`a3`、`a3l` |

DWG 要本机装 ODA File Converter，放在 `PATH` 里，或设 `CAD_ODA_EXEC`。全部参数看 `python -m tuyi --help`。

想写进项目的 `AGENTS.md` / `CLAUDE.md` / Cursor 规则，可以贴这段：

```text
翻译 CAD 图纸用图译命令行（源码目录里用 python -m tuyi；安装版用 tuyi-cli）：
python -m tuyi translate <图纸.dwg 或 .dxf，可以多张> --output-dir <输出文件夹> --mode zh_to_en
成功时每张图打印新文件路径、extracted、translated。失败看 stderr，退出码不是 0。
要 PDF：python -m tuyi pdf <译好的图纸> --output-dir <输出文件夹>
不会覆盖原图。不确定参数先跑 python -m tuyi translate --help。
```

### 从源码运行

开发环境和测试见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 协议

[MIT](LICENSE)。最早从 [etianwang/CAD_translator](https://github.com/etianwang/CAD_translator) 分出来。
