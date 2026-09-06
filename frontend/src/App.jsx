import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const LANGS = [
  ["zh-Hans", "中"],
  ["en", "英"],
  ["ja", "日"],
  ["ko", "韩"],
  ["de", "德"],
  ["fr", "法"],
];

const LAYOUTS = [
  ["纯译文", "图纸上只留译文", "写回后图纸上只看到译文"],
  ["原译对照", "原文和译文都留", "原文和译文都写在图上"],
  ["译原对照", "译文在上、原文在下", "先写译文，原文叠在下面"],
];

const ENGINES = [
  ["cloud", "网上翻译"],
  ["local", "不联网"],
  ["custom", "自己配接口"],
];

const THEME_KEY = "tuyi-theme";

function py() {
  return window.pywebview?.api || null;
}

function isMacChrome() {
  return /Mac/i.test(navigator.userAgent || "");
}

function hasNativeTitlebar() {
  if (isMacChrome()) return true;
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`;
  return Boolean(window.pywebview) && /Mac/i.test(platform);
}

function layoutLabel(value) {
  return LAYOUTS.find(([api]) => api === value)?.[1] || value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!response.ok) {
    const detail = data.detail || data.message || `HTTP ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

function asText(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function termKey(term) {
  return `${asText(term?.scope) || "global"}-${term?.id}-${asText(term?.source)}`;
}

function Choice({ on, onClick, children, title }) {
  return (
    <button type="button" className={`choice${on ? " on" : ""}`} aria-pressed={on} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function asCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function modeKey(source, target) {
  source = asText(source);
  target = asText(target);
  if (source === "zh-Hans" && target === "en") return "zh_to_en";
  if (source === "en" && target === "zh-Hans") return "en_to_zh";
  if (source === "zh-Hans" && target === "fr") return "zh_to_fr";
  if (source === "fr" && target === "zh-Hans") return "fr_to_zh";
  return `${source}_to_${target}`;
}

function engineProvider(engine, config) {
  if (engine === "local") return "ollama";
  if (engine === "custom") return "openai";
  return asText(config?.provider) === "azure" ? "azure" : "deepl";
}

function enginePayload(engine, config) {
  config = config && typeof config === "object" ? config : {};
  return {
    provider: engineProvider(engine, config),
    deepl_key: asText(config.deepl_key),
    azure_key: asText(config.azure_key),
    azure_region: asText(config.azure_region),
    openai_key: asText(config.openai_key),
    openai_base: asText(config.openai_base),
    openai_model: asText(config.openai_model),
    ollama_host: asText(config.ollama_host),
    ollama_model: asText(config.ollama_model),
    project_package_path: asText(config.project_package_path),
  };
}

function asFiles(paths) {
  return (paths || []).map((path) => ({
    path,
    name: String(path).split(/[/\\]/).pop(),
    ext: String(path).toLowerCase().endsWith(".dxf") ? "DXF" : "DWG",
  }));
}

export default function App() {
  const nativeTitlebar = hasNativeTitlebar();
  const [view, setView] = useState("work");
  const [theme, setTheme] = useState(readTheme);

  const [files, setFiles] = useState([]);
  const [current, setCurrent] = useState("");
  const [rows, setRows] = useState([]);
  const [engine, setEngine] = useState("cloud");
  const [sourceLang, setSourceLang] = useState("zh-Hans");
  const [targetLang, setTargetLang] = useState("en");
  const [layout, setLayout] = useState("纯译文");
  const [filters, setFilters] = useState({ numbers: true, dupes: true, nonsource: true });
  const [params, setParams] = useState({
    attribs: true,
    dims: true,
    model: true,
    paper: true,
    frozen: false,
    locked: false,
    off: false,
    filename: false,
    glossary: true,
    blocks: false,
    tree: true,
    odaDxf: true,
  });
  const [oda, setOda] = useState({ installed: false, path: "" });
  const [glossary, setGlossary] = useState(0);
  const [status, setStatus] = useState("还没打开图纸，点左上角打开");
  const [appVersion, setAppVersion] = useState("");
  const [config, setConfig] = useState({
    provider: "deepl",
    deepl_key: "",
    azure_key: "",
    azure_region: "",
    output_dir: "",
    openai_key: "",
    openai_base: "",
    openai_model: "",
    ollama_host: "",
    ollama_model: "",
    project_package_path: "",
  });
  const [batch, setBatch] = useState({ tasks: [], running: false });
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updatePercent, setUpdatePercent] = useState(0);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [pickedTerms, setPickedTerms] = useState(() => new Set());
  const [termQuery, setTermQuery] = useState("");
  const [lastOutput, setLastOutput] = useState("");
  const [writtenPath, setWrittenPath] = useState("");
  const [terms, setTerms] = useState([]);
  const [builtinTerms, setBuiltinTerms] = useState([]);
  const [termDraft, setTermDraft] = useState({ source: "", target: "" });
  const [tableCsv, setTableCsv] = useState("");
  const cadInput = useRef(null);
  const glossaryInput = useRef(null);
  const tableInput = useRef(null);
  const extractSnap = useRef("");
  const pageReturn = useRef("work");

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const shot = new URLSearchParams(window.location.search).get("shot");
    if (!shot) return;
    setFiles([
      { path: "/demo/电气原理图.dwg", name: "电气原理图.dwg", ext: "DWG" },
      { path: "/demo/配电箱.dxf", name: "配电箱.dxf", ext: "DXF" },
      { path: "/demo/总图-A1.dwg", name: "总图-A1.dwg", ext: "DWG" },
    ]);
    setCurrent("/demo/电气原理图.dwg");
    setRows([
      { id: 0, source: "电气原理图", target: "Electrical Schematic", layer: "0", type: "MTEXT", duplicate: false },
      { id: 1, source: "平面布置图", target: "Floor Plan", layer: "0", type: "TEXT", duplicate: false },
      { id: 2, source: "隔墙定位图", target: "Partition Location Plan", layer: "A-WALL", type: "TEXT", duplicate: false },
      { id: 3, source: "进线柜", target: "Incoming Cabinet", layer: "E-POWR", type: "ATTRIB", duplicate: false },
      { id: 4, source: "接地", target: "Earthing", layer: "E-POWR", type: "MTEXT", duplicate: false },
      { id: 5, source: "总图", target: "General Layout", layer: "TITLE", type: "TEXT", duplicate: false },
      { id: 6, source: "材料表", target: "Bill of Materials", layer: "0", type: "TABLE", duplicate: false },
      { id: 7, source: "电缆桥架", target: "Cable Tray", layer: "E-TRAY", type: "MTEXT", duplicate: false },
    ]);
    if (shot === "export") setView("batch");
    if (shot === "params") setView("settings");
  }, []);

  const visibleRows = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    const source = asText(sourceLang);
    const sourceIsZh = source.startsWith("zh");
    const sourceIsAscii = source === "en" || source === "de" || source === "fr";
    return list.filter((row) => {
      const source = asText(row?.source);
      if (filters.dupes && row?.duplicate) return false;
      if (filters.numbers && source && /^[\d.\-\s]+$/.test(source)) return false;
      if (filters.nonsource) {
        const hasCjk = /[\u4e00-\u9fff]/.test(source);
        if (sourceIsZh && !hasCjk) return false;
        if (sourceIsAscii && hasCjk) return false;
      }
      return true;
    });
  }, [rows, filters, sourceLang]);

  const selected = files.find((item) => item.path === current);

  const refreshMeta = useCallback(async () => {
    try {
      const [odaStatus, assets, cfg, health] = await Promise.all([
        api("/api/odafc-status"),
        api("/api/language-assets"),
        api("/api/config"),
        api("/api/health").catch(() => ({})),
      ]);
      setOda(odaStatus);
      setTerms(Array.isArray(assets.terms) ? assets.terms : []);
      setBuiltinTerms(Array.isArray(assets.builtin_terms) ? assets.builtin_terms : []);
      setGlossary(asCount(assets.builtin_terms?.length) + asCount(assets.terms?.length));
      setConfig(cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg : {});
      if (health?.version) setAppVersion(asText(health.version));
    } catch (error) {
      setStatus(error.message);
    }
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shot")) return undefined;
    checkUpdates({ silent: true });
    return undefined;
  }, []);

  useEffect(() => {
    if (view !== "batch") return undefined;
    const timer = setInterval(() => {
      api("/api/batch").then(setBatch).catch(() => {});
    }, 1200);
    api("/api/batch").then(setBatch).catch(() => {});
    return () => clearInterval(timer);
  }, [view]);

  async function loadOpened(next) {
    if (!next.length) {
      setStatus("没有选择文件。");
      return;
    }
    setFiles(next);
    setWrittenPath("");
    setCurrent(next[0].path);
    await extractFile(next[0].path);
  }

  async function openDrawings() {
    const native = py();
    if (native?.pick_cad_files) {
      const picked = await native.pick_cad_files();
      const paths = picked?.paths || [];
      if (!paths.length) {
        setStatus("没有选择文件。");
        return;
      }
      await loadOpened(asFiles(paths));
      return;
    }
    cadInput.current?.click();
  }

  async function onCadPicked(event) {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    if (!picked.length) return;
    const form = new FormData();
    picked.forEach((file) => form.append("files", file));
    setBusy(true);
    setStatus("正在打开图纸…");
    try {
      const response = await fetch("/api/drawings/open", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "打开失败");
      await loadOpened(data.files || []);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function extractFile(path) {
    setBusy(true);
    setStatus("正在提取文字…");
    try {
      const data = await api("/api/drawings/extract", {
        method: "POST",
        body: JSON.stringify({
          path,
          include_blocks: params.blocks,
          include_attribs: params.attribs,
          include_model: params.model,
          include_paper: params.paper,
          include_frozen: params.frozen,
          include_locked: params.locked,
          include_off: params.off,
          enable_v02: params.dims,
          skip_numbers: filters.numbers,
          skip_dupes: filters.dupes,
          skip_nonsource: filters.nonsource,
          translation_mode: modeKey(sourceLang, targetLang),
        }),
      });
      const items = Array.isArray(data.items) ? data.items : [];
      setRows(items);
      setStatus(`提取 ${asCount(data.count)} 条，去掉重复后 ${asCount(data.unique)}。可以改译文再写回。`);
      return items;
    } catch (error) {
      setRows([]);
      setStatus(error.message);
      return [];
    } finally {
      setBusy(false);
    }
  }

  function extractKey() {
    return JSON.stringify({
      attribs: params.attribs,
      blocks: params.blocks,
      dims: params.dims,
      model: params.model,
      paper: params.paper,
      frozen: params.frozen,
      locked: params.locked,
      off: params.off,
      numbers: filters.numbers,
      dupes: filters.dupes,
      nonsource: filters.nonsource,
    });
  }

  function rememberReturn() {
    if (view !== "update") pageReturn.current = view;
  }

  function openSettings() {
    extractSnap.current = extractKey();
    rememberReturn();
    setView("settings");
  }

  function openGlossary() {
    rememberReturn();
    setView("glossary");
  }

  async function closePage() {
    const changed = view === "settings" && extractSnap.current !== extractKey();
    setView(pageReturn.current || "work");
    if (view === "settings") {
      try {
        await api("/api/config", { method: "POST", body: JSON.stringify({ ...config, provider: engineProvider(engine, config) }) });
      } catch (error) {
        setStatus(error.message);
      }
      if (current && changed) extractFile(current);
    }
  }

  async function runTranslate() {
    if (!current) {
      setStatus("先打开图纸。");
      return;
    }
    if (!visibleRows.length) {
      setStatus("这张图没有可译文字。");
      return;
    }
    setBusy(true);
    setTranslating(true);
    setStatus("正在翻译…");
    try {
      const data = await api("/api/drawings/translate", {
        method: "POST",
        body: JSON.stringify({
          items: visibleRows,
          translation_mode: modeKey(sourceLang, targetLang),
          skip_numbers: filters.numbers,
          skip_dupes: filters.dupes,
          skip_nonsource: filters.nonsource,
          use_glossary: params.glossary,
          ...enginePayload(engine, config),
        }),
      });
      const translated = Array.isArray(data.items) ? data.items : [];
      const byKey = new Map();
      translated.forEach((item) => {
        const handle = asText(item?.handle);
        const field = asText(item?.field) || "text";
        if (handle) byKey.set(`${handle}\t${field}`, item);
        if (item?.id != null) byKey.set(`id:${item.id}`, item);
      });
      setRows((prev) => (Array.isArray(prev) ? prev : []).map((row) => {
        const handle = asText(row?.handle);
        const field = asText(row?.field) || "text";
        return (handle && byKey.get(`${handle}\t${field}`)) || (row?.id != null && byKey.get(`id:${row.id}`)) || row;
      }));
      const bits = [`术语对上 ${asCount(data.glossary)}`, `网上译了 ${asCount(data.mt)}`];
      if (asCount(data.skipped)) bits.push(`未译 ${asCount(data.skipped)}`);
      if (data.skipped && !data.has_engine) {
        const hint = engine === "local"
          ? "请先启动 Ollama。"
          : engine === "custom"
            ? "无法连接自定义接口。"
            : "剩下的要填网上翻译的密钥，或手填译文。";
        setStatus(`${bits.join("，")}。${hint}`);
        if (engine !== "local") openSettings();
      } else {
        setStatus(`译完。${bits.join("，")}。可以改译文再写回。`);
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
      setTranslating(false);
    }
  }

  async function writeBack() {
    if (!current) {
      setStatus("先打开图纸。");
      return;
    }
    const ready = visibleRows.filter((row) => row.selected !== false && asText(row.target).trim());
    if (!ready.length) {
      setStatus("没有可写回的译文。先点翻译，或手填译文。");
      return;
    }
    setBusy(true);
    setStatus("正在写回图纸…");
    try {
      const named = await api(
        `/api/default-output-name?mode=${encodeURIComponent(modeKey(sourceLang, targetLang))}&base=${encodeURIComponent(selected?.name?.replace(/\.[^.]+$/, "") || "drawing")}&translate_filename=${params.filename ? "true" : "false"}`
      );
      const data = await api("/api/drawings/writeback", {
        method: "POST",
        body: JSON.stringify({
          input_file: current,
          items: visibleRows,
          output_dir: config.output_dir,
          output_name: named.name,
          translation_mode: modeKey(sourceLang, targetLang),
          style: layout,
          translate_filename: params.filename,
        }),
      });
      setWrittenPath(data.path || "");
      setLastOutput(data.path || "");
      setStatus(`已写回 ${data.written} 条（${layoutLabel(layout)}）→ ${data.path}`);
      const native = py();
      if (native?.reveal_file && data.path) native.reveal_file(data.path);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function cadPathForPdf() {
    const written = asText(writtenPath);
    if (written && /\.(dxf|dwg)$/i.test(written)) return written;
    return current;
  }

  async function exportPdf(andPrint = false) {
    if (!current) {
      setStatus("先打开图纸。");
      return;
    }
    const sourcePath = cadPathForPdf();
    const fromWriteback = Boolean(writtenPath) && sourcePath === writtenPath;
    const stem = (fromWriteback ? sourcePath : selected?.name || "drawing")
      .replace(/^.*[/\\]/, "")
      .replace(/\.[^.]+$/, "") || "drawing";
    setBusy(true);
    setStatus(andPrint ? "正在导出并打印…" : "正在导出 PDF…");
    try {
      const data = await api(andPrint ? "/api/drawings/print" : "/api/drawings/export-pdf", {
        method: "POST",
        body: JSON.stringify({
          path: sourcePath,
          output_dir: config.output_dir,
          output_name: `${stem}.pdf`,
          style: fromWriteback ? "纯译文" : layout,
          items: fromWriteback ? [] : visibleRows,
        }),
      });
      setLastOutput(data.path || "");
      if (andPrint) {
        const printed = data.print || {};
        const where = fromWriteback ? "写回图纸" : "原图，还未写回译文";
        setStatus(printed.ok ? `已送到系统打印（${where}）：${data.path}` : `${printed.message || data.message || "打印没发出去"}。PDF：${data.path}`);
        const native = py();
        if (native?.print_pdf && data.path && !printed.ok) native.print_pdf(data.path);
      } else if (fromWriteback) {
        setStatus(`PDF 已导出（写回图纸）→ ${data.path}`);
        const native = py();
        if (native?.reveal_file && data.path) native.reveal_file(data.path);
      } else {
        setStatus(`PDF 已导出（原图，还未写回译文。ezdxf drawing，不是 AutoCAD 出图）→ ${data.path}`);
        const native = py();
        if (native?.reveal_file && data.path) native.reveal_file(data.path);
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startExport() {
    const paths = files.map((item) => item.path);
    if (!paths.length) {
      setStatus("先打开图纸。");
      return;
    }
    try {
      await api("/api/batch/add", { method: "POST", body: JSON.stringify({ files: paths }) });
      const started = await api("/api/batch/start", {
        method: "POST",
        body: JSON.stringify({
          output_dir: config.output_dir,
          translation_mode: modeKey(sourceLang, targetLang),
          translate_blocks: params.blocks,
          include_attribs: params.attribs,
          enable_v02: params.dims,
          include_model: params.model,
          include_paper: params.paper,
          include_frozen: params.frozen,
          include_locked: params.locked,
          include_off: params.off,
          skip_numbers: filters.numbers,
          skip_dupes: filters.dupes,
          skip_nonsource: filters.nonsource,
          translate_filename: params.filename,
          use_glossary: params.glossary,
          preserve_tree: params.tree,
          oda_fallback_dxf: params.odaDxf,
          output_format: "source",
          style: layout,
          ...enginePayload(engine, config),
        }),
      });
      setView("batch");
      setStatus(started.message || "批量导出已开始。");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function pauseExport(paused) {
    try {
      const data = await api("/api/batch/pause", { method: "POST", body: JSON.stringify({ paused }) });
      setBatch(data);
      setStatus(paused ? "已暂停。" : "继续导出。");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function stopExport() {
    try {
      const data = await api("/api/batch/stop", { method: "POST" });
      setBatch(data);
      setStatus("已停止。");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function retryTask(id) {
    try {
      const data = await api(`/api/batch/${id}/retry`, { method: "POST" });
      setBatch(data);
      setStatus("已重新排队。");
    } catch (error) {
      setStatus(error.message);
    }
  }

  function bytesToB64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    return btoa(binary);
  }

  async function exportTable(fmt = "csv") {
    if (!current && !visibleRows.length) {
      setStatus("先打开图纸。");
      return;
    }
    try {
      const data = await api("/api/drawings/export-table", {
        method: "POST",
        body: JSON.stringify({
          path: current,
          items: rows,
          translation_mode: modeKey(sourceLang, targetLang),
          format: fmt,
        }),
      });
      const native = py();
      if (native?.save_table_file) {
        const saved = await native.save_table_file(data.filename, data.csv || "", data.xlsx_b64 || "");
        if (saved?.path) setStatus(`表格已导出 → ${saved.path}`);
        return;
      }
      let blob;
      if (fmt === "xlsx" && data.xlsx_b64) {
        const binary = atob(data.xlsx_b64);
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      } else {
        blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename || (fmt === "xlsx" ? "图译表格.xlsx" : "图译表格.csv");
      link.click();
      URL.revokeObjectURL(url);
      setStatus(`表格已导出 ${asCount(data.count)} 条。`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function applyTableCsv(text, xlsxB64 = "") {
    const csv = String(text || "");
    if (!csv.trim() && !xlsxB64) {
      setStatus("表格是空的");
      return;
    }
    setTableCsv(csv);
    let items = rows;
    if (!items.length && current) {
      items = await extractFile(current);
    }
    if (!items.length) {
      setStatus("先打开图纸。");
      return;
    }
    const data = await api("/api/drawings/import-table", {
      method: "POST",
      body: JSON.stringify({
        csv,
        xlsx_b64: xlsxB64,
        items,
        file: selected?.name || "",
      }),
    });
    setRows(Array.isArray(data.items) ? data.items : []);
    setStatus(`表格填入 ${asCount(data.applied)} 条。可以改译文再写回。`);
  }

  async function importTable() {
    const native = py();
    if (native?.pick_table_file) {
      const picked = await native.pick_table_file();
      if (!picked?.path) return;
      if (picked.error) {
        setStatus(picked.error);
        return;
      }
      try {
        await applyTableCsv(picked.text, picked.xlsx_b64 || "");
      } catch (error) {
        setStatus(error.message);
      }
      return;
    }
    tableInput.current?.click();
  }

  async function onTablePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        await applyTableCsv("", bytesToB64(await file.arrayBuffer()));
      } else {
        await applyTableCsv(await file.text());
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function writeBackAll() {
    if (!files.length) {
      setStatus("先打开图纸。");
      return;
    }
    let csv = tableCsv;
    if (!csv.trim()) {
      const native = py();
      if (native?.pick_table_file) {
        const picked = await native.pick_table_file();
        if (!picked?.path) return;
        csv = picked.text || "";
      } else {
        tableInput.current?.click();
        return;
      }
    }
    setBusy(true);
    try {
      const data = await api("/api/batch/import", {
        method: "POST",
        body: JSON.stringify({
          csv,
          files: files.map((item) => item.path),
          output_dir: config.output_dir,
          translation_mode: modeKey(sourceLang, targetLang),
          style: layout,
          translate_filename: params.filename,
        }),
      });
      setStatus(`已写回 ${asCount(data.written)} 条，共 ${asCount(data.files)} 张图。`);
      const last = [...(data.results || [])].reverse().find((item) => item.written && item.path);
      if (last?.path) {
        setWrittenPath(last.path);
        setLastOutput(last.path);
        py()?.reveal_file?.(last.path);
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTerm(term) {
    try {
      await api("/api/language-assets/terms", {
        method: "POST",
        body: JSON.stringify({
          scope: term.scope || "global",
          mode: term.mode || modeKey(sourceLang, targetLang),
          source: term.source,
          target: term.target,
          layer_contains: term.layer_contains || "",
          project_package_path: config.project_package_path || "",
          id: term.id,
        }),
      });
      await refreshMeta();
      setStatus("这条译法记下了。");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deleteTerm(term) {
    try {
      await api("/api/language-assets/terms/delete", {
        method: "POST",
        body: JSON.stringify({
          scope: term.scope || "global",
          id: term.id,
          project_package_path: config.project_package_path || "",
        }),
      });
      await refreshMeta();
      setStatus("删掉了。");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function deletePickedTerms() {
    const keys = pickedTerms;
    const doomed = terms.filter((term) => keys.has(termKey(term)));
    if (!doomed.length) {
      setStatus("先勾要删的。");
      return;
    }
    for (const term of doomed) {
      await deleteTerm(term);
    }
    setPickedTerms(new Set());
    setStatus(`删掉了 ${doomed.length} 条。`);
  }

  function exportTerms() {
    const lines = ["source,target,mode"];
    terms.forEach((term) => {
      lines.push(`${asText(term.source)},${asText(term.target)},${asText(term.mode)}`);
    });
    const csv = `${lines.join("\n")}\n`;
    const native = py();
    if (native?.save_table_file) {
      native.save_table_file("术语表.csv", csv).then((saved) => {
        if (saved?.path) setStatus(`术语表已导出 → ${saved.path}`);
      });
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "术语表.csv";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("术语表已导出。");
  }

  async function checkUpdates(options = {}) {
    const silent = Boolean(options.silent);
    if (!silent) {
      setChecking(true);
      setUpdateMsg("正在检查…");
      setStatus("正在检查…");
    }
    try {
      const data = await api("/api/updates/check");
      setUpdateInfo(data);
      if (data.current) setAppVersion(asText(data.current));
      if (data.available) {
        const line = `有新版本 ${data.latest}（当前 ${data.current}）`;
        setUpdateMsg(line);
        if (!silent) {
          rememberReturn();
          setView("update");
        }
      } else if (!silent) {
        setUpdateMsg(data.message || `已是 ${data.current}`);
      }
    } catch {
      if (!silent) {
        setUpdateMsg("GitHub 暂时连不上。过一会再试。");
      }
    } finally {
      if (!silent) setChecking(false);
    }
  }

  function openUpdatePage() {
    if (updateInfo?.available) {
      rememberReturn();
      setView("update");
      return;
    }
    checkUpdates();
  }

  async function cancelUpdate() {
    try {
      const data = await api("/api/updates/cancel", { method: "POST" });
      setUpdating(false);
      setChecking(false);
      setUpdateMsg(data.message || "已取消");
      setStatus(data.message || "已取消");
      if (data.cancelled !== false) setView(pageReturn.current || "work");
    } catch (error) {
      setStatus(error.message || "取消不了");
    }
  }

  function openReleasePage() {
    const url = asText(updateInfo?.html_url) || "https://github.com/erict16/tuyi/releases";
    py()?.open_url?.(url);
  }

  async function applyUpdate() {
    if (updating) return;
    setUpdating(true);
    setChecking(true);
    setUpdatePercent(0);
    setView("update");
    setUpdateMsg("正在下载更新…");
    setStatus("正在下载更新…");
    try {
      await api("/api/updates/apply", { method: "POST" });
      for (let i = 0; i < 900; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const status = await api("/api/updates/status");
        const percent = Math.round(Number(status.percent || 0) * 100);
        if (status.phase === "downloading") {
          setUpdatePercent(percent);
          setUpdateMsg(`正在下载更新… ${percent}%`);
          setStatus(`正在下载更新… ${percent}%`);
        } else if (status.phase === "verifying") {
          setUpdateMsg("正在校验…");
          setStatus("正在校验…");
        } else if (status.phase === "applying") {
          setUpdateMsg("准备重启…");
          setStatus("准备重启…");
        } else if (status.phase === "restarting") {
          setUpdateMsg("正在重启…");
          setStatus("正在重启…");
          py()?.close_window?.();
          return;
        } else if (status.phase === "cancelling" || status.phase === "idle") {
          setUpdateMsg(status.message || "已取消");
          setStatus(status.message || "已取消");
          setUpdating(false);
          setChecking(false);
          return;
        } else if (status.phase === "error") {
          throw new Error(status.message || "更新失败");
        }
      }
      throw new Error("更新超时");
    } catch (error) {
      setUpdateMsg(error.message || "更新失败");
      setStatus(error.message || "更新失败");
      setUpdating(false);
      setChecking(false);
    }
  }

  async function loadGlossary() {
    const native = py();
    if (native?.pick_term_package) {
      const picked = await native.pick_term_package();
      if (picked?.path) {
        try {
          await api("/api/language-assets/project", {
            method: "POST",
            body: JSON.stringify({ path: picked.path, create: false }),
          });
          await refreshMeta();
          setStatus("已加载术语表。");
        } catch (error) {
          setStatus(error.message);
        }
        return;
      }
    }
    glossaryInput.current?.click();
  }

  async function onGlossaryPicked(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) {
        setStatus("术语表是空的");
        return;
      }
      const mode = modeKey(sourceLang, targetLang);
      let payload = { mode, csv: "", terms: [] };
      if (/\.json$/i.test(file.name)) {
        const data = JSON.parse(text);
        payload.terms = data.terms || [];
      } else {
        payload.csv = text;
      }
      const result = await api("/api/language-assets/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refreshMeta();
      setStatus(`术语表写入 ${result.count} 条。`);
    } catch (error) {
      const message = String(error.message || "");
      setStatus(/json|unexpected/i.test(message) ? "术语表读不出来。" : message || "术语表读不出来。");
    }
  }

  function onLights(kind) {
    const native = py();
    if (kind === "close") native?.close_window?.();
    if (kind === "min") native?.minimize_window?.();
    if (kind === "max") native?.toggle_maximize?.();
  }

  const emptyHint = files.length
    ? (view === "batch" ? "一批一起译、一起写回。目录按原来的放。" : "点一张图看它的字。译完再写回。")
    : (view === "batch" ? "打开后再点批量。" : "打开 DWG 或 DXF。字会进右边这张表。");
  const footBusy = checking || updating;
  const termFilter = termQuery.trim();
  const mineShown = terms.filter((term) => !termFilter || asText(term.source).includes(termFilter) || asText(term.target).includes(termFilter));
  const builtinShown = builtinTerms.filter((term) => !termFilter || asText(term.source).includes(termFilter) || asText(term.target).includes(termFilter));
  const allMineKeys = mineShown.map(termKey);
  const pickedCount = allMineKeys.filter((key) => pickedTerms.has(key)).length;

  async function onRailDrop(event) {
    event.preventDefault();
    setDropOver(false);
    const dropped = [...event.dataTransfer.files].filter((file) => /\.(dxf|dwg)$/i.test(file.name));
    if (!dropped.length) return;
    const form = new FormData();
    dropped.forEach((file) => form.append("files", file));
    try {
      const response = await fetch("/api/drawings/open", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "打开失败");
      await loadOpened(data.files || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <div
      className="win"
      data-theme={theme}
      data-view={view}
      data-files={files.length ? "1" : "0"}
      data-native-titlebar={nativeTitlebar ? "true" : "false"}
      data-engine={engine}
      role="application"
      aria-label="图译"
    >
      <a className="skip" href="#main">跳到图纸文字</a>
      <header className={nativeTitlebar ? "tb tb-mac" : "tb pywebview-drag-region"}>
        {nativeTitlebar ? null : (
          <div className="lights" aria-hidden="true">
            <i className="r" onClick={() => onLights("close")} />
            <i className="y" onClick={() => onLights("min")} />
            <i className="g" onClick={() => onLights("max")} />
          </div>
        )}
        {view === "settings" || view === "glossary" || view === "update" ? (
          <>
            {view === "update" && updating ? (
              <button type="button" className="tbtn" onClick={cancelUpdate}>取消这次</button>
            ) : (
              <button type="button" className="tbtn" onClick={closePage}>{view === "update" ? "以后再说" : "返回"}</button>
            )}
            <span className="grow" />
            {view === "glossary" && (
              <>
                <button type="button" className="tbtn ghost" onClick={loadGlossary} aria-label="加载术语表">从表格导入</button>
                <button type="button" className="tbtn ghost" onClick={exportTerms} aria-label="导出术语">导出成表格</button>
              </>
            )}
          </>
        ) : (
          <>
            <button type="button" className="tbtn" onClick={openDrawings}>打开图纸</button>
            <button type="button" className="tbtn" disabled={busy || !current} onClick={writeBack}>写回</button>
            <button
              type="button"
              className={`tbtn${view === "batch" ? " on" : ""}`}
              onClick={() => setView(view === "batch" ? "work" : "batch")}
            >批量</button>
            <span className="grow" />
            <button type="button" className={`tbtn${view === "glossary" ? " on" : ""}`} onClick={openGlossary}>我定的译法</button>
            <button type="button" className="tbtn" onClick={openSettings}>设置</button>
          </>
        )}
      </header>

      <input ref={cadInput} type="file" accept=".dwg,.dxf" multiple hidden onChange={onCadPicked} />
      <input ref={glossaryInput} type="file" accept=".json,.csv,.txt,.hcterms.json" hidden onChange={onGlossaryPicked} />
      <input ref={tableInput} type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onTablePicked} />

      {(view === "work" || view === "batch") && (
        <div className="body page-enter">
          <aside
            className="rail"
            aria-label="图纸队列"
            onDragEnter={(event) => { event.preventDefault(); setDropOver(true); }}
            onDragOver={(event) => { event.preventDefault(); setDropOver(true); }}
            onDragLeave={() => setDropOver(false)}
            onDrop={onRailDrop}
          >
            <button
              type="button"
              className={`drop${dropOver ? " over" : ""}`}
              onClick={openDrawings}
            >
              <div>
                <h2>把图纸拖进来，或点这里选</h2>
                <p className="long">只认 DWG、DXF，一次可以多张</p>
                <p>{oda.installed ? "DWG 和 DXF 都行" : "没装 ODA，先用 DXF"}</p>
              </div>
            </button>
            {files.length > 0 && (
              <div className="queue">
                {files.map((file) => (
                  <div
                    key={file.path}
                    className={`file${file.path === current ? " on" : ""}`}
                    onClick={() => {
                      if (file.path !== current) setWrittenPath("");
                      setCurrent(file.path);
                      if (view === "work") extractFile(file.path);
                    }}
                  >
                    <span className="name" title={file.name}>{file.name}</span>
                    <span className="meta">{file.ext}</span>
                    <span className={`st ${file.path === current ? "st-ok" : "st-idle"}`}>{file.path === current ? "当前" : "排队"}</span>
                  </div>
                ))}
              </div>
            )}
            {!files.length && <p className="hint" style={{ padding: "0 12px 12px" }}>{emptyHint}</p>}
          </aside>

          {view === "work" && (
            <section className="stage" id="main">
              <div className="act">
                <div className="pair">
                  <select aria-label="原文" value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
                    {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                  →
                  <select aria-label="译文" value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
                    {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </div>
                <span className="grow" />
                <button type="button" className="tbtn ghost" disabled={busy || !current} onClick={writeBack}>写回</button>
                <button type="button" className={`go${translating ? " busy" : ""}`} disabled={busy || !current} onClick={runTranslate}>
                  <i className="spin" aria-hidden="true" />
                  <span className="go-label">{translating ? "正在译…" : "翻译"}</span>
                </button>
              </div>
              <div className="status" aria-live="polite">{status}</div>
              <div className="chips" role="radiogroup" aria-label="用哪个翻译">
                {ENGINES.map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={`chip${engine === value ? " on" : ""}`}
                    onClick={() => setEngine(value)}
                  >{label}</button>
                ))}
              </div>
              {current ? (
                <>
                  <div className="filters">
                    <label title="尺寸数字、纯符号，一般不用译">
                      <input type="checkbox" checked={filters.numbers} onChange={(event) => setFilters((prev) => ({ ...prev, numbers: event.target.checked }))} /> 数字、尺寸
                    </label>
                    <label title="同一句在图上出现多次，只译一次">
                      <input type="checkbox" checked={filters.dupes} onChange={(event) => setFilters((prev) => ({ ...prev, dupes: event.target.checked }))} /> 重复的句子
                    </label>
                    <label title="已经是目标语言或夹杂别的文字，先跳过">
                      <input type="checkbox" checked={filters.nonsource} onChange={(event) => setFilters((prev) => ({ ...prev, nonsource: event.target.checked }))} /> 不是原文那种语言
                    </label>
                    <span className="grow">
                      写回
                      <select className="mini" value={layout} onChange={(event) => setLayout(event.target.value)} aria-label="图纸上怎么写">
                        {LAYOUTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </span>
                  </div>
                  <div className="table">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>
                            <input
                              type="checkbox"
                              checked={visibleRows.length > 0 && visibleRows.every((row) => row.selected !== false)}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                const visible = new Set(visibleRows.map((row) => row.id));
                                setRows((prev) => prev.map((item) => (visible.has(item.id) ? { ...item, selected: checked } : item)));
                              }}
                              aria-label="全选"
                            />
                          </th>
                          <th>原文</th>
                          <th>译文</th>
                          <th>图层</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="kind">{rows.length ? "过滤后没有可显示的文字。" : "这张图没有可译文字。"}</td>
                          </tr>
                        ) : visibleRows.map((row, index) => (
                          <tr key={row.id} className={index === 0 ? "on" : row.duplicate ? "skip" : ""}>
                            <td>
                              <input
                                type="checkbox"
                                checked={row.selected !== false}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, selected: checked } : item)));
                                }}
                              />
                            </td>
                            <td className="src">{asText(row.source)}</td>
                            <td>
                              <input
                                type="text"
                                value={asText(row.target)}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, target: value, via: "edit" } : item)));
                                }}
                                aria-label="译文"
                              />
                            </td>
                            <td className="kind">{asText(row.layer) || "0"} · {asText(row.type)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <p>还没打开图纸，点「打开图纸」<span>DWG、DXF 都可以</span></p>
                </div>
              )}
            </section>
          )}

          {view === "batch" && (
            <section className="stage">
              <div className="act">
                <span className="grow" />
                <button type="button" className="tbtn ghost" onClick={stopExport}>停止</button>
                {batch.started && !batch.paused ? (
                  <button type="button" className="tbtn" onClick={() => pauseExport(true)}>暂停</button>
                ) : (
                  <button type="button" className="go" disabled={!files.length} onClick={() => (batch.started ? pauseExport(false) : startExport())}>
                    <span className="go-label">{batch.started ? "继续" : "翻译这几张"}</span>
                  </button>
                )}
              </div>
              <div className="status" aria-live="polite">{status}</div>
              <div className="jobs">
                {!files.length ? (
                  <div className="empty">
                    <p>还没打开图纸，点「打开图纸」<span>打开后再点批量</span></p>
                  </div>
                ) : (
                  <>
                    {(batch.tasks || []).length === 0 && files.map((file) => (
                      <div className="job" key={file.path}>
                        <span>{file.name}</span>
                        <span>{layoutLabel(layout)}</span>
                        <span className="bar"><i style={{ width: 0 }} /></span>
                        <span>排队</span>
                      </div>
                    ))}
                    {(batch.tasks || []).map((task) => (
                      <div className="job" key={task.id}>
                        <span>{(task.input_file || "").split(/[/\\]/).pop()}</span>
                        <span>{layoutLabel(layout)}</span>
                        <span className="bar"><i style={{ width: `${task.progress || 0}%` }} /></span>
                        <span>{task.status}</span>
                        {(task.status === "failed" || task.status === "cancelled") && (
                          <button type="button" className="tbtn" onClick={() => retryTask(task.id)}>重试</button>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
              <aside className="insp">
                <h3>图纸上怎么写</h3>
                <div className="choices">
                  {LAYOUTS.map(([value, label, title]) => (
                    <Choice key={value} on={layout === value} title={title} onClick={() => setLayout(value)}>{label}</Choice>
                  ))}
                </div>
                <h3>放到哪里</h3>
                <div className="path">
                  <input value={config.output_dir || ""} readOnly aria-label="输出文件夹" />
                  <button type="button" onClick={async () => {
                    const picked = await py()?.pick_output_dir?.();
                    if (picked?.path) {
                      await api("/api/config", { method: "POST", body: JSON.stringify({ ...config, output_dir: picked.path }) });
                      setConfig((prev) => ({ ...prev, output_dir: picked.path }));
                    }
                  }}>选取</button>
                </div>
                <div className="choices">
                  <Choice on={params.tree} title="输出目录按原来的文件夹一层层放" onClick={() => setParams((prev) => ({ ...prev, tree: !prev.tree }))}>按原来的文件夹放</Choice>
                  <Choice on={params.odaDxf} title="没有 ODA 时，写不出 DWG 就改成 DXF" onClick={() => setParams((prev) => ({ ...prev, odaDxf: !prev.odaDxf }))}>打不开 DWG 时改存成 DXF</Choice>
                </div>
                <h3>先别译</h3>
                <div className="choices">
                  <Choice on={filters.numbers} title="尺寸数字、纯符号，一般不用译" onClick={() => setFilters((prev) => ({ ...prev, numbers: !prev.numbers }))}>数字、尺寸</Choice>
                  <Choice on={filters.dupes} title="同一句在图上出现多次，只译一次" onClick={() => setFilters((prev) => ({ ...prev, dupes: !prev.dupes }))}>重复的句子</Choice>
                  <Choice on={filters.nonsource} title="已经是目标语言或夹杂别的文字，先跳过" onClick={() => setFilters((prev) => ({ ...prev, nonsource: !prev.nonsource }))}>不是原文那种语言</Choice>
                </div>
                <h3>表格</h3>
                <p className="note" style={{ paddingLeft: 0 }}>有填好的表格也可以导进来写回。</p>
                <button type="button" className="tbtn" disabled={busy || !current} onClick={() => exportTable("csv")}>导出表格</button>
                <button type="button" className="tbtn" disabled={busy || !current} onClick={() => exportTable("xlsx")}>导出 Excel</button>
                <button type="button" className="tbtn" disabled={busy} onClick={importTable}>导入表格</button>
                <button type="button" className="tbtn" disabled={busy} onClick={writeBackAll}>全部写回</button>
                <h3>PDF</h3>
                <button type="button" className="tbtn" disabled={busy || !current} onClick={() => exportPdf(false)}>导出 PDF</button>
                <button type="button" className="tbtn" disabled={busy || !current} onClick={() => exportPdf(true)}>打印</button>
                {lastOutput && <p className="note" style={{ paddingLeft: 0 }}>{lastOutput}</p>}
              </aside>
            </section>
          )}
        </div>
      )}

      {view === "settings" && (
        <div className="body page-enter">
          <section className="set-page" aria-label="设置">
            <div className="set-h">
              <h1>设置</h1>
              <p>改完点「返回」。这里不是弹窗。</p>
            </div>
            <div className="set-grid">
              <div className="card">
                <h2>用哪里翻译</h2>
                <p className="help">网上翻译用 DeepL 或 Azure，要密钥。自己配接口就填网址。不联网要用本机 Ollama。</p>
                {ENGINES.map(([value, label]) => (
                  <label className="row" key={value}>
                    <input type="radio" name="set-eng" checked={engine === value} onChange={() => setEngine(value)} /> {label}
                  </label>
                ))}
                {engine === "cloud" && (
                  <>
                    <div className="field">网上用哪家
                      <select className="mini" aria-label="网上翻译服务" value={config.provider === "azure" ? "azure" : "deepl"} onChange={(event) => setConfig((prev) => ({ ...prev, provider: event.target.value }))}>
                        <option value="deepl">DeepL</option>
                        <option value="azure">Azure</option>
                      </select>
                    </div>
                    <div className="field">DeepL 密钥 <input type="password" name="deepl" autoComplete="off" spellCheck={false} placeholder="没有就空着…" aria-label="DeepL 密钥" value={config.deepl_key || ""} onChange={(event) => setConfig((prev) => ({ ...prev, deepl_key: event.target.value }))} /></div>
                    <div className="field">Azure 密钥 <input type="password" name="azure" autoComplete="off" spellCheck={false} placeholder="没有就空着…" aria-label="Azure 密钥" value={config.azure_key || ""} onChange={(event) => setConfig((prev) => ({ ...prev, azure_key: event.target.value }))} /></div>
                    <div className="field">Azure 区域 <input type="text" name="azure-region" autoComplete="off" spellCheck={false} placeholder="eastasia" aria-label="Azure 区域" value={config.azure_region || ""} onChange={(event) => setConfig((prev) => ({ ...prev, azure_region: event.target.value }))} /></div>
                  </>
                )}
                {engine === "local" && (
                  <>
                    <div className="field">Ollama 地址 <input type="url" name="ollama" autoComplete="off" spellCheck={false} placeholder="http://127.0.0.1:11434" aria-label="Ollama 地址" value={config.ollama_host || ""} onChange={(event) => setConfig((prev) => ({ ...prev, ollama_host: event.target.value }))} /></div>
                    <div className="field">模型 <input type="text" name="ollama-model" autoComplete="off" spellCheck={false} placeholder="llama3.1" aria-label="Ollama 模型" value={config.ollama_model || ""} onChange={(event) => setConfig((prev) => ({ ...prev, ollama_model: event.target.value }))} /></div>
                  </>
                )}
                {engine === "custom" && (
                  <>
                    <div className="field">网址 <input type="url" name="openai-base" autoComplete="off" spellCheck={false} placeholder="https://api.deepseek.com/v1" aria-label="接口网址" value={config.openai_base || ""} onChange={(event) => setConfig((prev) => ({ ...prev, openai_base: event.target.value }))} /></div>
                    <div className="field">密钥 <input type="password" name="openai-key" autoComplete="off" spellCheck={false} placeholder="填密钥…" aria-label="接口密钥" value={config.openai_key || ""} onChange={(event) => setConfig((prev) => ({ ...prev, openai_key: event.target.value }))} /></div>
                    <div className="field">模型 <input type="text" name="openai-model" autoComplete="off" spellCheck={false} placeholder="deepseek-chat" aria-label="模型名" value={config.openai_model || ""} onChange={(event) => setConfig((prev) => ({ ...prev, openai_model: event.target.value }))} /></div>
                  </>
                )}
              </div>
              <div className="card">
                <h2>图纸上怎么写</h2>
                <p className="help">写回 CAD 时，图面上留什么字。</p>
                {LAYOUTS.map(([value, label, title]) => (
                  <label className="row" key={value} title={title}>
                    <input type="radio" name="set-lay" checked={layout === value} onChange={() => setLayout(value)} /> {label}
                  </label>
                ))}
              </div>
              <div className="card">
                <h2>不译这些</h2>
                <p className="help">勾上的不送去翻译，表里也不列。</p>
                <label className="row" title="尺寸数字、纯符号，一般不用译"><input type="checkbox" checked={filters.numbers} onChange={(event) => setFilters((prev) => ({ ...prev, numbers: event.target.checked }))} /> 数字、尺寸</label>
                <label className="row" title="同一句在图上出现多次，只译一次"><input type="checkbox" checked={filters.dupes} onChange={(event) => setFilters((prev) => ({ ...prev, dupes: event.target.checked }))} /> 重复的句子</label>
                <label className="row" title="已经是目标语言或夹杂别的文字，先跳过"><input type="checkbox" checked={filters.nonsource} onChange={(event) => setFilters((prev) => ({ ...prev, nonsource: event.target.checked }))} /> 不是原文那种语言</label>
                <label className="row" title="勾上后，这张图会先查我定的译法"><input type="checkbox" checked={params.glossary} onChange={(event) => setParams((prev) => ({ ...prev, glossary: event.target.checked }))} /> 这张图用术语表</label>
              </div>
              <div className="card">
                <h2>从哪里取字</h2>
                <label className="row"><input type="checkbox" checked={params.attribs} onChange={(event) => setParams((prev) => ({ ...prev, attribs: event.target.checked }))} /> 块属性</label>
                <label className="row"><input type="checkbox" checked={params.blocks} onChange={(event) => setParams((prev) => ({ ...prev, blocks: event.target.checked }))} /> 块里的字</label>
                <label className="row"><input type="checkbox" checked={params.dims} onChange={(event) => setParams((prev) => ({ ...prev, dims: event.target.checked }))} /> 标注、表格</label>
                <label className="row"><input type="checkbox" checked={params.model} onChange={(event) => setParams((prev) => ({ ...prev, model: event.target.checked }))} /> 模型空间</label>
                <label className="row"><input type="checkbox" checked={params.paper} onChange={(event) => setParams((prev) => ({ ...prev, paper: event.target.checked }))} /> 图纸空间</label>
                <label className="row" title="输出文件名里的中文也一起译"><input type="checkbox" checked={params.filename} onChange={(event) => setParams((prev) => ({ ...prev, filename: event.target.checked }))} /> 文件名也一起译</label>
              </div>
              <div className="card">
                <h2>图层</h2>
                <p className="help">图层关掉或冻住以后，图上看不见。默认不译那些字。要译就勾上。</p>
                <label className="row" title="冻住的图层在图上看不见"><input type="checkbox" checked={params.frozen} onChange={(event) => setParams((prev) => ({ ...prev, frozen: event.target.checked }))} /> 冻住看不见的图层</label>
                <label className="row" title="锁住的图层改不了"><input type="checkbox" checked={params.locked} onChange={(event) => setParams((prev) => ({ ...prev, locked: event.target.checked }))} /> 锁住改不了的图层</label>
                <label className="row" title="关掉的图层藏起来了"><input type="checkbox" checked={params.off} onChange={(event) => setParams((prev) => ({ ...prev, off: event.target.checked }))} /> 关掉藏起来的图层</label>
              </div>
              <div className="card">
                <h2>批量怎么放</h2>
                <label className="row" title="输出目录按原来的文件夹一层层放"><input type="checkbox" checked={params.tree} onChange={(event) => setParams((prev) => ({ ...prev, tree: event.target.checked }))} /> 按原来的文件夹放</label>
                <label className="row" title="没有 ODA 时，写不出 DWG 就改成 DXF"><input type="checkbox" checked={params.odaDxf} onChange={(event) => setParams((prev) => ({ ...prev, odaDxf: event.target.checked }))} /> 打不开 DWG 时改存成 DXF</label>
                <p className="help">{oda.installed ? "已装 ODA，DWG 能直接开。" : "没装 ODA，DWG 请先另存成 DXF。"}</p>
              </div>
              <div className="card">
                <h2>界面</h2>
                <p className="help">只改这个窗口的颜色。</p>
                <label className="row"><input type="radio" name="set-theme" checked={theme === "light"} onChange={() => setTheme("light")} /> 浅色</label>
                <label className="row"><input type="radio" name="set-theme" checked={theme === "dark"} onChange={() => setTheme("dark")} /> 深色</label>
              </div>
              <div className="card">
                <h2>版本和更新</h2>
                <p className="help">图译 {appVersion || updateInfo?.current || "—"}。我定的译法在单独一页改。</p>
                <div className="field">ODA <span>{oda.installed ? "已装" : "未装"}</span></div>
                <div className="field">
                  <button type="button" className="tbtn" onClick={openUpdatePage} disabled={updating || checking}>检查更新</button>
                  <button type="button" className="tbtn ghost" onClick={openGlossary}>我定的译法</button>
                </div>
                {updateMsg && <p className="help">{updateMsg}</p>}
                {updateInfo?.available && (
                  <p className="help">有新版本 {updateInfo.latest}。点检查更新会开那一页。</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {view === "glossary" && (
        <div className="body page-enter">
          <section className="gloss" aria-label="我定的译法">
            <div className="head">
              <h1>我定的译法</h1>
              <p>图上碰到左边这句，就写成右边。软件自带的改不了。碰上两边都有，用我定的。</p>
            </div>
            <div className="tools">
              <input type="search" value={termQuery} onChange={(event) => setTermQuery(event.target.value)} placeholder="搜一下…" aria-label="搜译法" />
              <button
                type="button"
                className="tbtn danger"
                disabled={!pickedCount}
                onClick={deletePickedTerms}
              >删掉选中的{pickedCount ? ` ${pickedCount}` : ""}</button>
              <div className="add">
                <input
                  value={termDraft.source}
                  placeholder="图上的中文"
                  aria-label="新术语原文"
                  onChange={(event) => setTermDraft((prev) => ({ ...prev, source: event.target.value }))}
                />
                <input
                  value={termDraft.target}
                  placeholder="要写成"
                  aria-label="新术语译文"
                  onChange={(event) => setTermDraft((prev) => ({ ...prev, target: event.target.value }))}
                />
                <button
                  type="button"
                  className="tbtn pri"
                  onClick={async () => {
                    if (!termDraft.source.trim() || !termDraft.target.trim()) {
                      setStatus("中文、译文不能为空");
                      return;
                    }
                    await saveTerm({ ...termDraft, scope: "global" });
                    setTermDraft({ source: "", target: "" });
                  }}
                >加上</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={mineShown.length > 0 && pickedCount === mineShown.length}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setPickedTerms(() => (checked ? new Set(allMineKeys) : new Set()));
                        }}
                        aria-label="全选我定的"
                      />
                    </th>
                    <th>图上的中文</th>
                    <th>要写成</th>
                    <th style={{ width: 90 }}>谁定的</th>
                    <th style={{ width: 52 }} />
                  </tr>
                </thead>
                <tbody>
                  {mineShown.length === 0 && !termFilter && (
                    <tr><td colSpan={5} className="kind">还没有自己定的译法。上面填一行再点加上。</td></tr>
                  )}
                  {mineShown.map((term) => {
                    const key = termKey(term);
                    return (
                      <tr key={key} className="row-enter">
                        <td>
                          <input
                            type="checkbox"
                            checked={pickedTerms.has(key)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setPickedTerms((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }}
                            aria-label={`选中 ${asText(term.source)}`}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={asText(term.source)}
                            aria-label="术语原文"
                            onChange={(event) => {
                              const value = event.target.value;
                              setTerms((prev) => prev.map((item) => (item === term ? { ...item, source: value } : item)));
                            }}
                            onBlur={() => saveTerm(term)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={asText(term.target)}
                            aria-label="术语译文"
                            onChange={(event) => {
                              const value = event.target.value;
                              setTerms((prev) => prev.map((item) => (item === term ? { ...item, target: value } : item)));
                            }}
                            onBlur={() => saveTerm(term)}
                          />
                        </td>
                        <td>我定的</td>
                        <td><button type="button" className="tbtn" onClick={() => deleteTerm(term)}>删掉</button></td>
                      </tr>
                    );
                  })}
                  {builtinShown.map((term) => (
                    <tr key={termKey(term)} className="locked">
                      <td />
                      <td><input type="text" value={asText(term.source)} readOnly aria-label="软件自带原文" /></td>
                      <td><input type="text" value={asText(term.target)} readOnly aria-label="软件自带译文" /></td>
                      <td><span className="tag">软件自带</span></td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {view === "update" && (
        <div className="body page-enter">
          <section className="upd" aria-label="检查更新">
            <div className="head">
              <h1>{updating ? "正在更新" : (updateInfo?.available ? "有新版本" : "检查更新")}</h1>
              <p>
                {updating
                  ? (updateMsg || "正在下载更新…")
                  : (updateInfo?.available
                    ? `现在是 ${updateInfo.current || appVersion}，可以换成 ${updateInfo.latest}。`
                    : (updateMsg || "点下面检查。"))}
              </p>
            </div>
            {updating && (
              <div className="upd-bar" aria-label="下载进度">
                <span className="bar"><i style={{ width: `${updatePercent}%` }} /></span>
                <span>{updatePercent}%</span>
              </div>
            )}
            {updateInfo?.available && !updating && (
              <div className="upd-actions">
                {updateInfo.can_apply ? (
                  <button type="button" className="go" onClick={applyUpdate}>
                    <span className="go-label">现在更新并重启</span>
                  </button>
                ) : (
                  <p className="note">这个版本得下安装包。点下面会用系统浏览器打开 GitHub，不会新开图译窗口。</p>
                )}
                <button type="button" className="tbtn ghost" onClick={openReleasePage}>打开 GitHub 发布页</button>
                <button type="button" className="tbtn" onClick={closePage}>以后再说</button>
              </div>
            )}
            {!updateInfo?.available && !updating && (
              <div className="upd-actions">
                <button type="button" className="go" onClick={() => checkUpdates()} disabled={checking}>
                  <i className="spin" aria-hidden="true" />
                  <span className="go-label">{checking ? "正在查…" : "再检查一次"}</span>
                </button>
                <button type="button" className="tbtn" onClick={closePage}>返回</button>
              </div>
            )}
            {updating && (
              <div className="upd-actions">
                <button type="button" className="tbtn danger" onClick={cancelUpdate}>取消这次</button>
              </div>
            )}
          </section>
        </div>
      )}

      <footer className={footBusy ? "foot checking" : "foot"}>
        <span className="live">{oda.installed ? "ODA 已装" : "没装 ODA · 先用 DXF"}</span>
        <span className="msg" aria-live="polite">{status}</span>
        <span className="end">
          <span className="spin" aria-hidden="true" />
          {updateInfo?.available && view !== "update" && (
            <button type="button" className="tbtn" onClick={openUpdatePage} disabled={updating}>有新版本</button>
          )}
        </span>
      </footer>
    </div>
  );
}
