<h4 align="right"><a href="README.md">中文</a> · <a href="README.en.md">English</a> · <a href="README.ja.md">日本語</a> · <b>한국어</b> · <a href="README.es.md">Español</a></h4>

<p align="center">
  <a href="https://erict16.github.io/tuyi/en.html"><img src="landing/shots/og.png" width="900" alt="图译 Tuyi: DWG / DXF 도면의 중국어를 영어로 번역"></a>
</p>

<h1 align="center">图译 Tuyi</h1>
<h3 align="center">DWG / DXF 도면의 중국어를 영어로 번역합니다</h3>

<p align="center">
  <a href="https://github.com/erict16/tuyi/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/erict16/tuyi?style=flat-square"></a>
  <img alt="Windows 10/11 x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-blue?style=flat-square">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%2B%20Intel-orange?style=flat-square">
</p>

Tuyi는 DWG / DXF 도면을 열어 글자를 번역하고, 도면에 다시 써서 새 파일로 저장합니다. 원본 도면은 그대로이고 AutoCAD도 필요 없습니다. 표제란, 주석, 블록 속성, 치수, 표 안의 글자도 번역합니다.

## 다운로드 (v0.1.11, 무료)

- **Windows 10 / 11 (64비트)**: [Tuyi_v0.1.11_Setup.exe](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_Setup.exe)
- **Mac (Apple 실리콘, M1~M4)**: [Tuyi_v0.1.11_macOS_arm64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_arm64.dmg)
- **Mac (Intel)**: [Tuyi_v0.1.11_macOS_x86_64.dmg](https://github.com/erict16/tuyi/releases/download/v0.1.11/Tuyi_v0.1.11_macOS_x86_64.dmg)

어떤 Mac인지 모르겠다면 Apple 메뉴의 "이 Mac에 관하여"에서 확인하세요. 새 버전은 [Releases](https://github.com/erict16/tuyi/releases/latest)에 올라옵니다.

설치 파일은 아직 서명되지 않아서 처음에는 시스템이 막습니다. 정상입니다. Windows는 "추가 정보" → "실행"을 누르세요. Mac은 DMG를 열어 Tuyi를 응용 프로그램으로 끌어 놓고, 처음 열 때 아이콘을 오른쪽 클릭해 "열기"를 고르세요.

DXF는 설치하면 바로 됩니다. DWG는 무료 [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter)도 설치해야 합니다.

## AI 비서에게 맡기기

WorkBuddy, ChatGPT, Claude를 쓰고 있나요? Tuyi를 대신 실행해 주니 클릭할 필요가 없습니다. 이 한 문장을 보내면 됩니다.

> 내 컴퓨터에 图译(Tuyi)가 설치되어 있어요. 그걸로 "도면" 폴더의 DWG / DXF를 영어로 번역해서 새 파일로 저장해 주세요. 원본은 바꾸지 마세요.

비서가 내 컴퓨터에서 프로그램을 실행할 수 있어야 합니다. 보통 데스크톱 앱이고, 실행 전에 먼저 물어봅니다.

## 화면

<p align="center">
  <img src="docs/screenshots/app-home.png" alt="도면 한 장 번역 완료: 6줄이 영어로, 새 파일로 저장">
</p>

## 사용법

화면은 아직 중국어입니다. 버튼 이름은 괄호 안에 적었습니다.

1. 왼쪽 "도면 추가"(添加图纸)를 누르거나 `.dwg` / `.dxf`를 끌어 놓습니다. 여러 장을 넣을 수 있습니다.
2. 왼쪽 아래에서 번역 방향을 고릅니다. 기본은 중국어 → 영어입니다.
3. "빠른 번역"(快速翻译)을 누릅니다. 새 파일은 다운로드 폴더에 생깁니다.
4. 내 용어는 "용어 관리"(术语管理), 번역 서비스 설정은 "설정"(设置)에 있습니다.

용어집에 맞는 단어는 그대로 쓰고 인터넷에 연결하지 않습니다. 나머지는 설정에 넣은 DeepL, Azure, OpenAI 호환 API, 또는 내 컴퓨터의 Ollama로 번역합니다. 가입이 필요 없고 데이터를 모으지 않습니다.

## 개발자용

```bash
python -m tuyi translate drawing.dxf --output-dir out --mode zh_to_en
```

설치본에서는 Windows는 `Tuyi.exe` 옆의 `tuyi-cli.exe`, Mac은 `Tuyi.app/Contents/MacOS/tuyi-cli`입니다. 옵션 목록은 [README.en.md](README.en.md#command-line-let-your-ai-assistant-translate-the-drawings), 개발 환경은 [CONTRIBUTING.md](CONTRIBUTING.md)를 보세요.

## 라이선스

[MIT](LICENSE). 원래 [etianwang/CAD_translator](https://github.com/etianwang/CAD_translator)에서 포크했습니다.
