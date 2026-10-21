export const LANGS = [
  ["zh-Hans", "中文", "中"],
  ["en", "英语", "英"],
  ["vi", "越南语", "越"],
  ["id", "印尼语", "印"],
  ["th", "泰语", "泰"],
  ["ms", "马来语", "马"],
  ["ko", "韩语", "韩"],
  ["ru", "俄语", "俄"],
  ["ja", "日语", "日"],
  ["de", "德语", "德"],
];

export const LATIN_LANGS = new Set(["en", "de", "id", "ms", "vi"]);

// [api value, label, hint]. API style values stay 纯译文/原译对照/译原对照.
export const LAYOUTS = [
  ["纯译文", "图纸上只留译文", "写回后图纸上只看到译文"],
  ["原译对照", "原文和译文都留", "原文和译文都写在图上"],
  ["译原对照", "译文在上、原文在下", "先写译文，原文叠在下面"],
];

export const APPEARANCES = [
  ["黑白", "白纸黑线", "打印用。线都是黑的"],
  ["彩色", "白纸，颜色还在", "白底。青、红、绿、黄保持原色"],
  ["Chrome", "深色屏幕", "深灰底，像在模型空间里看"],
];

export const PDF_PAPERS = [
  ["a4", "A4 竖向"],
  ["a4l", "A4 横向"],
  ["a3", "A3 竖向"],
  ["a3l", "A3 横向"],
];

export const THEMES = [
  ["light", "浅色"],
  ["dark", "深色"],
  ["system", "跟随系统"],
];

export const THEME_KEY = "tuyi-theme";
export const PREFS_KEY = "tuyi-prefs";
export const RAIL_KEY = "tuyi-rail";

export const DEFAULT_FILTERS = { numbers: true, dupes: true, nonsource: true };

export const DEFAULT_PARAMS = {
  attribs: true,
  dims: true,
  model: true,
  paper: true,
  frozen: true,
  locked: true,
  off: true,
  filename: true,
  glossary: true,
  blocks: true,
  tree: true,
  odaDxf: true,
};

export const DEFAULT_PREFS = {
  sourceLang: "zh-Hans",
  targetLang: "en",
  layout: "纯译文",
  appearance: "黑白",
  pdfPaper: "a4",
  filters: DEFAULT_FILTERS,
  params: DEFAULT_PARAMS,
};

// Queue status → what the user reads.
export const TASK_STATUS = {
  queued: ["排队", "idle"],
  running: ["正在译", "run"],
  succeeded: ["已写出", "ok"],
  failed: ["没译成", "bad"],
  cancelled: ["已停止", "idle"],
  paused: ["已暂停", "idle"],
};

// Where a row's 译文 came from.
export const VIA_LABELS = {
  glossary: "术语",
  edit: "手改",
  needs_engine: "待译",
  table: "表格",
};
