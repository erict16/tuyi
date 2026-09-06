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
  ["local", "这台电脑"],
  ["custom", "自己的接口"],
];

const SET_NAV = [
  ["trans", "翻译"],
  ["open", "打开范围"],
  ["write", "写回"],
  ["terms", "术语"],
  ["about", "这台电脑"],
];

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
  const [settingsPane, setSettingsPane] = useState("trans");
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
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastOutput, setLastOutput] = useState("");
  const [writtenPath, setWrittenPath] = useState("");
  const [terms, setTerms] = useState([]);
  const [termDraft, setTermDraft] = useState({ source: "", target: "" });
  const [tableCsv, setTableCsv] = useState("");
  const cadInput = useRef(null);
  const glossaryInput = useRef(null);
  const tableInput = useRef(null);
  const extractSnap = useRef("");
  const settingsReturn = useRef("work");

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

  function openSettings() {
    extractSnap.current = extractKey();
    settingsReturn.current = view === "settings" ? "work" : view;
    setSettingsPane("trans");
    setView("settings");
  }

  async function closeSettings() {
    const changed = extractSnap.current !== extractKey();
    setView(settingsReturn.current || "work");
    try {
      await api("/api/config", { method: "POST", body: JSON.stringify({ ...config, provider: engineProvider(engine, config) }) });
    } catch (error) {
      setStatus(error.message);
    }
    if (current && changed) extractFile(current);
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
      setStatus("术语已保存。");
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
      setStatus("术语已删除。");
    } catch (error) {
      setStatus(error.message);
    }
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
        if (!silent) setStatus(line);
      } else if (!silent) {
        const line = data.message || `已是 ${data.current}`;
        setUpdateMsg(line);
        setStatus(line);
      }
    } catch {
      if (!silent) {
        const line = "GitHub API 暂不可用，打开 Releases 页查看";
        setUpdateMsg(line);
        setStatus(line);
      }
    } finally {
      if (!silent) setChecking(false);
    }
  }

  async function applyUpdate() {
    if (updating) return;
    setUpdating(true);
    setChecking(true);
    setUpdateMsg("正在下载更新…");
    setStatus("正在下载更新…");
    try {
      await api("/api/updates/apply", { method: "POST" });
      for (let i = 0; i < 900; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const status = await api("/api/updates/status");
        const percent = Math.round(Number(status.percent || 0) * 100);
        if (status.phase === "downloading") {
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

  return (
    <div
      className="win"
      data-theme="light"
      data-view={view}
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
        {view === "settings" ? (
          <>
            <button type="button" className="tbtn" onClick={closeSettings}>完成</button>
            <span className="grow" />
            <div className="brand">设置</div>
          </>
        ) : (
          <>
            <button type="button" className="tbtn" onClick={openDrawings}>打开图纸</button>
            <button type="button" className="tbtn pri" disabled={busy || !current} onClick={runTranslate}>翻译</button>
            <button type="button" className="tbtn" disabled={busy || !current} onClick={writeBack}>写回</button>
            <span className="rule" aria-hidden="true" />
            <button
              type="button"
              className={`tbtn${view === "batch" ? " on" : ""}`}
              onClick={() => setView(view === "batch" ? "work" : "batch")}
            >批量</button>
            <button type="button" className="tbtn" disabled={busy || !current} onClick={() => exportPdf(false)}>导出 PDF</button>
            <button type="button" className="tbtn" disabled={busy || !current} onClick={() => exportPdf(true)}>打印</button>
            <span className="grow" />
            <div className="pair">
              <select aria-label="原文" value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
                {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              →
              <select aria-label="译文" value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
                {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            <select
              className="mini"
              aria-label="用哪个翻译"
              value={engine}
              onChange={(event) => setEngine(event.target.value)}
            >
              {ENGINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="tbtn" onClick={openSettings}>设置</button>
          </>
        )}
      </header>

      <input ref={cadInput} type="file" accept=".dxf,.dwg,application/dxf" multiple hidden onChange={onCadPicked} />
      <input ref={glossaryInput} type="file" accept=".json,.csv,.txt,.hcterms.json" hidden onChange={onGlossaryPicked} />
      <input ref={tableInput} type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onTablePicked} />

      {view !== "settings" && (
        <div className="body">
          <aside
            className="side"
            onDragOver={(event) => event.preventDefault()}
            onDrop={async (event) => {
              event.preventDefault();
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
            }}
          >
            <h2>{view === "batch" ? `待导出 · ${files.length}` : "已打开"}</h2>
            {files.map((file) => (
              <div
                key={file.path}
                className={`item${file.path === current ? " on" : ""}`}
                onClick={() => {
                  if (file.path !== current) setWrittenPath("");
                  setCurrent(file.path);
                  if (view === "work") extractFile(file.path);
                }}
              >
                <span className={`dot${file.ext === "DXF" ? " dxf" : ""}`} />
                <span className="name">{file.name}</span>
                <span className="meta">{file.path === current ? "当前" : file.ext}</span>
              </div>
            ))}
            <p className="hint">{emptyHint}</p>
          </aside>

          {view === "work" && (
            <section className="main" id="main">
              {current ? (
                <>
                  <div className="filters">
                    先别译
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
                      写回时
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
                  <p>还没打开图纸，点左上角打开<span>DWG、DXF 都可以</span></p>
                </div>
              )}
            </section>
          )}

          {view === "batch" && (
            <>
              <div className="jobs">
                {!files.length ? (
                  <div className="empty">
                    <p>还没打开图纸，点左上角打开<span>打开后再点批量</span></p>
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
                {LAYOUTS.map(([value, label, title]) => (
                  <label className="row" key={value} title={title}>
                    <input type="radio" name="lay" checked={layout === value} onChange={() => setLayout(value)} /> {label}
                  </label>
                ))}
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
                <label className="row" title="输出目录按原来的文件夹一层层放">
                  <input type="checkbox" checked={params.tree} onChange={(event) => setParams((prev) => ({ ...prev, tree: event.target.checked }))} /> 按原来的文件夹放
                </label>
                <label className="row" title="没有 ODA 时，写不出 DWG 就改成 DXF">
                  <input type="checkbox" checked={params.odaDxf} onChange={(event) => setParams((prev) => ({ ...prev, odaDxf: event.target.checked }))} /> 打不开 DWG 时改写成 DXF
                </label>
                <h3>先别译</h3>
                <label className="row" title="尺寸数字、纯符号，一般不用译">
                  <input type="checkbox" checked={filters.numbers} onChange={(event) => setFilters((prev) => ({ ...prev, numbers: event.target.checked }))} /> 数字、尺寸
                </label>
                <label className="row" title="同一句在图上出现多次，只译一次">
                  <input type="checkbox" checked={filters.dupes} onChange={(event) => setFilters((prev) => ({ ...prev, dupes: event.target.checked }))} /> 重复的句子
                </label>
                <label className="row" title="已经是目标语言或夹杂别的文字，先跳过">
                  <input type="checkbox" checked={filters.nonsource} onChange={(event) => setFilters((prev) => ({ ...prev, nonsource: event.target.checked }))} /> 不是原文那种语言
                </label>
                <h3>队列</h3>
                {batch.started && !batch.paused ? (
                  <button type="button" className="tbtn" onClick={() => pauseExport(true)}>暂停</button>
                ) : (
                  <button type="button" className="tbtn pri" disabled={!files.length} onClick={() => (batch.started ? pauseExport(false) : startExport())}>
                    {batch.started ? "继续" : "开始导出"}
                  </button>
                )}
                <button type="button" className="tbtn" onClick={stopExport}>停止</button>
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
            </>
          )}
        </div>
      )}

      {view === "settings" && (
        <div className="body">
          <div className="set">
            <nav className="set-nav" aria-label="设置分组">
              {SET_NAV.map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={settingsPane === id ? "on" : ""}
                  onClick={() => setSettingsPane(id)}
                >{label}</button>
              ))}
            </nav>
            <div className="set-pane">
              {settingsPane === "trans" && (
                <>
                  <h3>翻译</h3>
                  <p className="lead">选一个干活的地方。网上要密钥，这台电脑要先开 Ollama。</p>
                  <div className="group">
                    <div className="grow-row">
                      <span>用哪个</span>
                      <select className="mini ctl" aria-label="用哪个翻译" value={engine} onChange={(event) => setEngine(event.target.value)}>
                        {ENGINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="grow-row">
                      <span>原文</span>
                      <select className="mini ctl" aria-label="原文" value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
                        {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </div>
                    <div className="grow-row">
                      <span>译文</span>
                      <select className="mini ctl" aria-label="译文" value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
                        {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  {engine === "cloud" && (
                    <div className="group">
                      <h4>网上翻译</h4>
                      <div className="grow-row">
                        <span>服务</span>
                        <select
                          className="mini ctl"
                          aria-label="网上翻译服务"
                          value={config.provider === "azure" ? "azure" : "deepl"}
                          onChange={(event) => setConfig((prev) => ({ ...prev, provider: event.target.value }))}
                        >
                          <option value="deepl">DeepL</option>
                          <option value="azure">Azure</option>
                        </select>
                      </div>
                      <div className="grow-row">
                        <span>DeepL 密钥</span>
                        <input className="ctl" type="password" name="deepl" autoComplete="off" spellCheck={false} placeholder="填密钥…" aria-label="DeepL 密钥" value={config.deepl_key || ""} onChange={(event) => setConfig((prev) => ({ ...prev, deepl_key: event.target.value }))} />
                      </div>
                      <div className="grow-row">
                        <span>Azure 密钥</span>
                        <input className="ctl" type="password" name="azure" autoComplete="off" spellCheck={false} placeholder="填密钥…" aria-label="Azure 密钥" value={config.azure_key || ""} onChange={(event) => setConfig((prev) => ({ ...prev, azure_key: event.target.value }))} />
                      </div>
                      <div className="grow-row">
                        <span>Azure 区域</span>
                        <input className="ctl" type="text" name="azure-region" autoComplete="off" spellCheck={false} placeholder="eastasia" aria-label="Azure 区域" value={config.azure_region || ""} onChange={(event) => setConfig((prev) => ({ ...prev, azure_region: event.target.value }))} />
                      </div>
                      <p className="note">密钥只存在这台电脑。Azure 要另填区域。</p>
                    </div>
                  )}
                  {engine === "local" && (
                    <div className="group">
                      <h4>这台电脑</h4>
                      <div className="grow-row">
                        <span>Ollama 地址</span>
                        <input className="ctl" type="url" name="ollama" autoComplete="off" spellCheck={false} placeholder="http://127.0.0.1:11434" aria-label="Ollama 地址" value={config.ollama_host || ""} onChange={(event) => setConfig((prev) => ({ ...prev, ollama_host: event.target.value }))} />
                      </div>
                      <div className="grow-row">
                        <span>模型</span>
                        <input className="ctl" type="text" name="ollama-model" autoComplete="off" spellCheck={false} placeholder="llama3.1" aria-label="Ollama 模型" value={config.ollama_model || ""} onChange={(event) => setConfig((prev) => ({ ...prev, ollama_model: event.target.value }))} />
                      </div>
                      <p className="note">先在本机打开 Ollama，再点翻译。</p>
                    </div>
                  )}
                  {engine === "custom" && (
                    <div className="group">
                      <h4>自己的接口</h4>
                      <div className="grow-row">
                        <span>网址</span>
                        <input className="ctl" type="url" name="openai-base" autoComplete="off" spellCheck={false} placeholder="https://api.deepseek.com/v1" aria-label="接口网址" value={config.openai_base || ""} onChange={(event) => setConfig((prev) => ({ ...prev, openai_base: event.target.value }))} />
                      </div>
                      <div className="grow-row">
                        <span>密钥</span>
                        <input className="ctl" type="password" name="openai-key" autoComplete="off" spellCheck={false} placeholder="填密钥…" aria-label="接口密钥" value={config.openai_key || ""} onChange={(event) => setConfig((prev) => ({ ...prev, openai_key: event.target.value }))} />
                      </div>
                      <div className="grow-row">
                        <span>模型</span>
                        <input className="ctl" type="text" name="openai-model" autoComplete="off" spellCheck={false} placeholder="deepseek-chat" aria-label="模型名" value={config.openai_model || ""} onChange={(event) => setConfig((prev) => ({ ...prev, openai_model: event.target.value }))} />
                      </div>
                    </div>
                  )}
                  <div className="group">
                    <h4>先别译这些</h4>
                    <div className="grow-row">
                      <label title="尺寸数字、纯符号，一般不用译"><input type="checkbox" checked={filters.numbers} onChange={(event) => setFilters((prev) => ({ ...prev, numbers: event.target.checked }))} /> 数字、尺寸</label>
                    </div>
                    <div className="grow-row">
                      <label title="同一句在图上出现多次，只译一次"><input type="checkbox" checked={filters.dupes} onChange={(event) => setFilters((prev) => ({ ...prev, dupes: event.target.checked }))} /> 重复的句子</label>
                    </div>
                    <div className="grow-row">
                      <label title="已经是目标语言或夹杂别的文字，先跳过"><input type="checkbox" checked={filters.nonsource} onChange={(event) => setFilters((prev) => ({ ...prev, nonsource: event.target.checked }))} /> 不是原文那种语言</label>
                    </div>
                    <div className="grow-row">
                      <label title="勾上后，这张图会先查术语表"><input type="checkbox" checked={params.glossary} onChange={(event) => setParams((prev) => ({ ...prev, glossary: event.target.checked }))} /> 这张图用术语表</label>
                    </div>
                  </div>
                </>
              )}

              {settingsPane === "open" && (
                <>
                  <h3>打开范围</h3>
                  <p className="lead">打开图纸时，哪些字进表。改完点完成会重新抽一次。</p>
                  <div className="group">
                    <h4>看哪些字</h4>
                    <div className="grow-row"><label><input type="checkbox" checked={params.attribs} onChange={(event) => setParams((prev) => ({ ...prev, attribs: event.target.checked }))} /> 块属性</label></div>
                    <div className="grow-row"><label><input type="checkbox" checked={params.blocks} onChange={(event) => setParams((prev) => ({ ...prev, blocks: event.target.checked }))} /> 块里面的字</label></div>
                    <div className="grow-row"><label><input type="checkbox" checked={params.dims} onChange={(event) => setParams((prev) => ({ ...prev, dims: event.target.checked }))} /> 标注、表格</label></div>
                    <div className="grow-row"><label><input type="checkbox" checked={params.model} onChange={(event) => setParams((prev) => ({ ...prev, model: event.target.checked }))} /> 模型空间</label></div>
                    <div className="grow-row"><label><input type="checkbox" checked={params.paper} onChange={(event) => setParams((prev) => ({ ...prev, paper: event.target.checked }))} /> 图纸空间</label></div>
                    <div className="grow-row"><label title="输出文件名里的中文也一起译"><input type="checkbox" checked={params.filename} onChange={(event) => setParams((prev) => ({ ...prev, filename: event.target.checked }))} /> 文件名也一起译</label></div>
                  </div>
                  <div className="group">
                    <h4>图层</h4>
                    <div className="grow-row"><label><input type="checkbox" checked={params.frozen} onChange={(event) => setParams((prev) => ({ ...prev, frozen: event.target.checked }))} /> 冻结图层里的字</label></div>
                    <div className="grow-row"><label><input type="checkbox" checked={params.locked} onChange={(event) => setParams((prev) => ({ ...prev, locked: event.target.checked }))} /> 锁住图层里的字</label></div>
                    <div className="grow-row"><label><input type="checkbox" checked={params.off} onChange={(event) => setParams((prev) => ({ ...prev, off: event.target.checked }))} /> 关掉的图层里的字</label></div>
                  </div>
                </>
              )}

              {settingsPane === "write" && (
                <>
                  <h3>写回</h3>
                  <p className="lead">译文怎么落回图纸。只动你勾上的那些行。</p>
                  <div className="group">
                    <h4>图纸上怎么写</h4>
                    {LAYOUTS.map(([value, label, title]) => (
                      <div className="grow-row" key={value}>
                        <label title={title}><input type="radio" name="set-lay" checked={layout === value} onChange={() => setLayout(value)} /> {label}</label>
                      </div>
                    ))}
                  </div>
                  <div className="group">
                    <h4>批量</h4>
                    <div className="grow-row"><label title="输出目录按原来的文件夹一层层放"><input type="checkbox" checked={params.tree} onChange={(event) => setParams((prev) => ({ ...prev, tree: event.target.checked }))} /> 按原来的文件夹放</label></div>
                    <div className="grow-row"><label title="没有 ODA 时，写不出 DWG 就改成 DXF"><input type="checkbox" checked={params.odaDxf} onChange={(event) => setParams((prev) => ({ ...prev, odaDxf: event.target.checked }))} /> 打不开 DWG 时改写成 DXF</label></div>
                  </div>
                </>
              )}

              {settingsPane === "terms" && (
                <>
                  <h3>术语</h3>
                  <p className="lead">内置词不能改。这里是你自己的词，导出成表格还能再导回来。</p>
                  <div className="group">
                    {terms.length === 0 && <p className="note">还没有自己的术语。</p>}
                    {terms.map((term) => (
                      <div className="term-row" key={`${term.scope}-${term.id}-${term.source}`}>
                        <input
                          value={asText(term.source)}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTerms((prev) => prev.map((item) => (item === term ? { ...item, source: value } : item)));
                          }}
                          aria-label="术语原文"
                        />
                        <input
                          value={asText(term.target)}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTerms((prev) => prev.map((item) => (item === term ? { ...item, target: value } : item)));
                          }}
                          aria-label="术语译文"
                        />
                        <button type="button" className="tbtn" onClick={() => saveTerm(term)}>保存</button>
                        <button type="button" className="tbtn" onClick={() => deleteTerm(term)}>删除</button>
                      </div>
                    ))}
                    <div className="term-row">
                      <input
                        value={termDraft.source}
                        placeholder="新原文…"
                        aria-label="新术语原文"
                        onChange={(event) => setTermDraft((prev) => ({ ...prev, source: event.target.value }))}
                      />
                      <input
                        value={termDraft.target}
                        placeholder="新译文…"
                        aria-label="新术语译文"
                        onChange={(event) => setTermDraft((prev) => ({ ...prev, target: event.target.value }))}
                      />
                      <button
                        type="button"
                        className="tbtn"
                        onClick={async () => {
                          if (!termDraft.source.trim() || !termDraft.target.trim()) {
                            setStatus("术语、译文不能为空");
                            return;
                          }
                          await saveTerm({ ...termDraft, scope: "global" });
                          setTermDraft({ source: "", target: "" });
                        }}
                      >添加</button>
                      <span />
                    </div>
                    <div className="grow-row">
                      <span>术语表 <b>{glossary}</b> 条</span>
                      <span>
                        <button type="button" className="tbtn" onClick={loadGlossary}>加载术语表</button>
                        <button type="button" className="tbtn" onClick={exportTerms}>导出术语</button>
                      </span>
                    </div>
                  </div>
                </>
              )}

              {settingsPane === "about" && (
                <>
                  <h3>这台电脑</h3>
                  <p className="lead">打开 DWG 需要 ODA。没装的话，把图另存成 DXF 也能译。</p>
                  <div className="group">
                    <div className="grow-row"><span>ODA</span><span>{oda.installed ? `已装 · ${oda.path}` : "未装 · DWG 请另存 DXF"}</span></div>
                    <div className="grow-row"><span>图译</span><span>{appVersion || updateInfo?.current || "—"}</span></div>
                    <div className="grow-row"><span>术语表</span><span>{glossary} 条</span></div>
                  </div>
                  <div className="group">
                    <div className="grow-row">
                      <span>有新版本会写在底下那一行</span>
                      <button type="button" className="tbtn" onClick={() => checkUpdates()} disabled={updating || checking}>检查更新</button>
                    </div>
                    {updateInfo?.available && updateInfo?.can_apply && (
                      <div className="grow-row">
                        <span>{updateMsg || `有新版本 ${updateInfo.latest}`}</span>
                        <button type="button" className="tbtn pri" onClick={applyUpdate} disabled={updating}>更新并重启</button>
                      </div>
                    )}
                    {updateMsg && !(updateInfo?.available && updateInfo?.can_apply) && (
                      <p className="note">{updateMsg}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className={footBusy ? "foot checking" : "foot"}>
        <span className="live">{oda.installed ? "ODA 已安装" : "ODA 未安装 · DXF 仍可译"}</span>
        <span>术语表 <b>{glossary}</b></span>
        <span>全部文字 <b>{rows.length}</b></span>
        <span>去掉重复 <b>{visibleRows.length}</b></span>
        <span className="msg" aria-live="polite">{status}</span>
        <span className="end">
          <span className="spin" aria-hidden="true" />
          {updateInfo?.available && updateInfo?.can_apply && (
            <button type="button" className="tbtn pri" onClick={applyUpdate} disabled={updating}>更新并重启</button>
          )}
          <button type="button" className="tbtn" onClick={() => checkUpdates()} disabled={updating || checking}>检查更新</button>
        </span>
      </footer>
    </div>
  );
}
