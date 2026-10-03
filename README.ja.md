<h4 align="right"><a href="README.md">中文</a> · <a href="README.en.md">English</a> · <b>日本語</b> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a></h4>

<p align="center">
  <a href="https://erict16.github.io/tuyi/en.html"><img src="landing/shots/og.png" width="900" alt="图译 Tuyi：DWG / DXF 図面の中国語を英語に翻訳"></a>
</p>

<h1 align="center">图译 Tuyi</h1>
<h3 align="center">DWG / DXF 図面の中国語を英語に翻訳します</h3>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
</p>

Tuyi は DWG / DXF 図面を開いて文字を翻訳し、図面に書き戻して新しいファイルとして保存します。元の図面はそのままで、AutoCAD もいりません。表題欄、注記、ブロック属性、寸法、表の文字も翻訳します。

## ダウンロード（v0.1.11、無料）

- **Windows 10 / 11（64 ビット）**：[Tuyi_v0.1.11_Setup.exe](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_Setup.exe)
- **Mac（Apple シリコン、M1〜M4）**：[Tuyi_v0.1.11_macOS_arm64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_arm64.dmg)
- **Mac（Intel）**：[Tuyi_v0.1.11_macOS_x86_64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_x86_64.dmg)

どちらの Mac か分からないときは、アップルメニューの「この Mac について」で確認できます。新しい版は [Releases](https://github.com/erict16/tuyi/releases/latest) にあります。

インストーラーはまだ署名していないので、最初はシステムに止められます。これは想定どおりです。Windows は「詳細情報」→「実行」。Mac は DMG を開いて Tuyi をアプリケーションにドラッグし、初回はアイコンを右クリックして「開く」を選びます。

DXF はインストールしてすぐ使えます。DWG には無料の [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) も必要です。

## AI アシスタントに任せる

WorkBuddy、ChatGPT、Claude を使っていますか？ Tuyi の操作を代わりにやってくれるので、クリックはいりません。次の一文を送るだけです。

> 私のパソコンに图译（Tuyi）が入っています。それを使って「図面」フォルダの DWG / DXF を英語に翻訳し、新しいファイルとして保存してください。元の図面は変えないでください。

アシスタントがパソコン上でプログラムを動かせる必要があります。たいていはデスクトップ版で、実行前に確認してきます。

## 画面

<p align="center">
  <img src="docs/screenshots/app-home.png" alt="図面 1 枚を翻訳：6 行が英語になり、新しいファイルに保存">
</p>

## 使い方

画面は今のところ中国語です。ボタン名をかっこ内に書いています。

1. 左の「図面を追加」（添加图纸）を押すか、`.dwg` / `.dxf` をドロップします。何枚でも追加できます。
2. 左下で翻訳の向きを選びます。初期設定は中国語 → 英語です。
3. 「クイック翻訳」（快速翻译）を押します。新しいファイルはダウンロードフォルダに入ります。
4. 自分の用語は「用語管理」（术语管理）、翻訳サービスの設定は「設定」（设置）にあります。

用語集に一致した語はそのまま使い、ネットにはつなぎません。それ以外は、設定で入れた DeepL、Azure、OpenAI 互換の API、または手元の Ollama で翻訳します。登録はいらず、データも集めません。

## 開発者向け

```bash
python -m tuyi translate drawing.dxf --output-dir out --mode zh_to_en
```

インストール版では Windows は `Tuyi.exe` の隣の `tuyi-cli.exe`、Mac は `Tuyi.app/Contents/MacOS/tuyi-cli` です。オプションの一覧は [README.en.md](README.en.md#command-line-let-your-ai-assistant-translate-the-drawings)、開発環境は [CONTRIBUTING.md](CONTRIBUTING.md) を見てください。

## ライセンス

[MIT](LICENSE)。もとは [etianwang/CAD_translator](https://github.com/etianwang/CAD_translator) のフォークです。
