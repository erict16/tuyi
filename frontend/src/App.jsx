import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import "./App.css";
import BatchView from "./components/BatchView";
import Footer from "./components/Footer";
import GlossaryView from "./components/GlossaryView";
import Rail from "./components/Rail";
import SettingsView from "./components/SettingsView";
import Toasts from "./components/Toasts";
import UpdateView from "./components/UpdateView";
import WorkView from "./components/WorkView";
import { api, uploadDrawings } from "./lib/api";
import { RAIL_KEY } from "./lib/constants";
import {
  asCount,
  asFiles,
  asText,
  b64ToBytes,
  bytesToB64,
  carryTargets,
  editRow,
  enginePayload,
  engineFromConfig,
  engineProvider,
  fileName,
  filterRows,
  guessLang,
  hasWritable,
  isCadName,
  langLabel,
  mergeFiles,
  mergeTranslated,
  modeKey,
  outputStem,
  rowStats,
  sourceCounts,
  syncDuplicates,
  termsCsv,
} from "./lib/core";
import { usePrefs, useTheme, useToasts } from "./lib/hooks";
import { hasNativeTitlebar, py, reveal, saveFile } from "./lib/native";

const DEMO_ROWS = [
  ["电气原理图", "Electrical Schematic", "0", "MTEXT"],
  ["平面布置图", "Floor Plan", "0", "TEXT"],
  ["隔墙定位图", "Partition Location Plan", "A-WALL", "TEXT"],
  ["进线柜", "Incoming Cabinet", "E-POWR", "ATTRIB"],
  ["接地", "Earthing", "E-POWR", "MTEXT"],
  ["总图", "General Layout", "TITLE", "TEXT"],
  ["材料表", "Bill of Materials", "0", "TABLE"],
  ["电缆桥架", "Cable Tray", "E-TRAY", "MTEXT"],
].map(([source, target, layer, type], id) => ({ id, source, target, layer, type, duplicate: false, via: "glossary" }));

// Extract options that change which rows exist. Leaving 设置 with any of these
// changed re-reads the drawing; filters are applied on screen only.
function extractKey(params) {
  return JSON.stringify([params.attribs, params.blocks, params.dims, params.model, params.paper, params.frozen, params.locked, params.off]);
}

function readRailWidth() {
  try {
    const n = Number(localStorage.getItem(RAIL_KEY));
    if (n >= 220 && n <= 420) return n;
  } catch { /* ignore */ }
  return 280;
}

export default function App() {
  const nativeTitlebar = hasNativeTitlebar();
  const [view, setView] = useState("work");
  const [settingsTab, setSettingsTab] = useState("tr");
  const [themePref, setThemePref, theme] = useTheme();
  const [prefs, setPrefs] = usePrefs();
  const { sourceLang, targetLang, layout, appearance, pdfPaper, filters, params } = prefs;
  const [railW, setRailW] = useState(readRailWidth);
  const [railDrag, setRailDrag] = useState(false);

  const [files, setFiles] = useState([]);
  const [current, setCurrent] = useState("");
  const [rows, setRows] = useState([]);
  const [fileState, setFileState] = useState({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [dropOver, setDropOver] = useState(false);

  const [engine, setEngine] = useState("cloud");
  const [config, setConfig] = useState({});
  const [saved, setSaved] = useState(false);
  const [probe, setProbe] = useState({ busy: false, text: "", ok: false });
  const [oda, setOda] = useState({ installed: false, path: "" });
  const [terms, setTerms] = useState([]);
  const [builtinTerms, setBuiltinTerms] = useState([]);
  const [batch, setBatch] = useState({ tasks: [], started: false, paused: false, progress: 0 });
  const [table, setTable] = useState(null);

  const [appVersion, setAppVersion] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updatePercent, setUpdatePercent] = useState(0);
  const [checking, setChecking] = useState(false);

  const { toasts, push: toast, dismiss } = useToasts();
  const cadInput = useRef(null);
  const glossaryInput = useRef(null);
  const tableInput = useRef(null);
  const sheets = useRef(new Map());
  const extractSeq = useRef(0);
  const extractSnap = useRef("");
  const pageReturn = useRef("work");
  const configLoaded = useRef(false);
  const dragDepth = useRef(0);
  const batchNoticeKey = useRef("");

  const mode = modeKey(sourceLang, targetLang);
  const selected = files.find((item) => item.path === current);
  const visibleRows = useMemo(() => filterRows(rows, filters, sourceLang, query), [rows, filters, sourceLang, query]);
  const stats = useMemo(() => rowStats(rows, filterRows(rows, filters, sourceLang)), [rows, filters, sourceLang]);
  const counts = useMemo(() => sourceCounts(rows), [rows]);
  const curState = fileState[current] || {};
  const notice = curState.notice || fileState[""]?.notice || null;
  const locked = busy === "extract" || busy === "translate" || busy === "write";
  const translating = busy === "translate";
  const writtenPath = asText(curState.output);

  // ---------- small state helpers ----------
  const patchFile = useCallback((path, patch) => {
    setFileState((prev) => ({ ...prev, [path]: { ...(prev[path] || {}), ...patch } }));
  }, []);

  const say = useCallback((path, tone, text, extra = {}) => {
    patchFile(path || "", { notice: text ? { tone, text, ...extra } : null });
  }, [patchFile]);

  const setFilter = (key, value) => setPrefs((prev) => ({ filters: { ...prev.filters, [key]: value } }));
  const setParam = (key, value) => setPrefs((prev) => ({ params: { ...prev.params, [key]: value } }));

  const updateRows = useCallback((fn) => {
    setRows((prev) => {
      const next = fn(prev);
      if (current) sheets.current.set(current, next);
      return next;
    });
  }, [current]);

  // ---------- theme, rail width ----------
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const paint = () => py()?.set_chrome_theme?.(theme === "dark");
    paint();
    window.addEventListener("pywebviewready", paint);
    return () => window.removeEventListener("pywebviewready", paint);
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, String(railW)); } catch { /* ignore */ }
  }, [railW]);

  // ---------- meta, config ----------
  const refreshAssets = useCallback(async () => {
    const assets = await api("/api/language-assets");
    setTerms(Array.isArray(assets.terms) ? assets.terms : []);
    setBuiltinTerms(Array.isArray(assets.builtin_terms) ? assets.builtin_terms : []);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shot")) return;
    (async () => {
      try {
        const [odaStatus, cfg, health] = await Promise.all([
          api("/api/odafc-status").catch(() => ({ installed: false })),
          api("/api/config"),
          api("/api/health").catch(() => ({})),
        ]);
        setOda(odaStatus || { installed: false });
        const safe = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg : {};
        setConfig(safe);
        setEngine(engineFromConfig(safe));
        if (health?.version) setAppVersion(asText(health.version));
        await refreshAssets();
      } catch (error) {
        say("", "error", error.message);
      } finally {
        configLoaded.current = true;
      }
    })();
  }, [refreshAssets, say]);

  // Settings save themselves; there is no 保存 button to forget.
  useEffect(() => {
    if (!configLoaded.current) return undefined;
    const timer = setTimeout(async () => {
      try {
        await api("/api/config", { json: { ...config, provider: engineProvider(engine, config) } });
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      } catch (error) {
        toast(error.message, "error");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [config, engine, toast]);

  // ---------- demo data for README / landing screenshots ----------
  useEffect(() => {
    const shot = new URLSearchParams(window.location.search).get("shot");
    if (!shot) return;
    const demo = asFiles(["/demo/电气原理图.dwg", "/demo/配电箱.dxf", "/demo/总图-A1.dwg"]);
    setFiles(demo);
    setCurrent(demo[0].path);
    setRows(DEMO_ROWS);
    setOda({ installed: true, path: "" });
    setAppVersion("demo");
    if (shot === "export") setView("batch");
    if (shot === "params") setView("settings");
    if (shot === "glossary") setView("glossary");
  }, []);

  // ---------- updates ----------
  async function checkUpdates({ silent = false } = {}) {
    if (!silent) {
      setChecking(true);
      setUpdateMsg("正在检查…");
    }
    try {
      const data = await api("/api/updates/check");
      setUpdateInfo(data);
      if (data.current) setAppVersion(asText(data.current));
      if (data.available) {
        setUpdateMsg(`有新版本 ${data.latest}（当前 ${data.current}）`);
        if (!silent) goPage("update");
      } else if (!silent) {
        setUpdateMsg(data.message || `已是 ${data.current}`);
      }
    } catch {
      if (!silent) setUpdateMsg("GitHub 暂时连不上。过一会再试。");
    } finally {
      if (!silent) setChecking(false);
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shot")) return;
    checkUpdates({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyUpdate() {
    if (updating) return;
    setUpdating(true);
    setChecking(true);
    setUpdatePercent(0);
    setView("update");
    setUpdateMsg("正在下载更新…");
    try {
      await api("/api/updates/apply", { method: "POST" });
      for (let i = 0; i < 900; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const status = await api("/api/updates/status");
        const percent = Math.round(Number(status.percent || 0) * 100);
        if (status.phase === "downloading") {
          setUpdatePercent(percent);
          setUpdateMsg(`正在下载更新… ${percent}%`);
        } else if (status.phase === "verifying") {
          setUpdateMsg("正在校验…");
        } else if (status.phase === "applying") {
          setUpdateMsg("准备重启…");
        } else if (status.phase === "restarting") {
          setUpdateMsg("正在重启…");
          py()?.close_window?.();
          return;
        } else if (status.phase === "cancelling" || status.phase === "idle") {
          setUpdateMsg(status.message || "已取消");
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
      setUpdating(false);
      setChecking(false);
    }
  }

  async function cancelUpdate() {
    try {
      const data = await api("/api/updates/cancel", { method: "POST" });
      setUpdating(false);
      setChecking(false);
      setUpdateMsg(data.message || "已取消");
      if (data.cancelled !== false) setView(pageReturn.current || "work");
    } catch (error) {
      toast(error.message || "取消不了", "error");
    }
  }

  function openReleasePage() {
    py()?.open_url?.(asText(updateInfo?.html_url) || "https://github.com/erict16/tuyi/releases");
  }

  // ---------- pages ----------
  function goPage(next) {
    if (view === "work" || view === "batch") pageReturn.current = view;
    if (next === "settings" && view !== "settings") extractSnap.current = extractKey(params);
    setView(next);
  }

  function leavePage() {
    const fromSettings = view === "settings";
    const back = pageReturn.current || "work";
    setView(back);
    if (fromSettings && extractSnap.current && extractSnap.current !== extractKey(params)) {
      extractSnap.current = "";
      sheets.current.clear();
      if (current) extractFile(current, { keep: rows });
    }
  }

  function toggleSettings(tab = "tr") {
    if (view === "settings") {
      leavePage();
      return;
    }
    setSettingsTab(tab);
    goPage("settings");
  }

  function toggleGlossary() {
    if (view === "glossary") leavePage();
    else goPage("glossary");
  }

  // ---------- drawings ----------
  async function extractFile(path, { keep = null, langs = null } = {}) {
    const seq = extractSeq.current + 1;
    extractSeq.current = seq;
    const src = langs?.[0] || sourceLang;
    const dst = langs?.[1] || targetLang;
    setBusy("extract");
    setRows([]);
    patchFile(path, { status: "extracting", notice: null });
    try {
      const data = await api("/api/drawings/extract", {
        json: {
          path,
          include_blocks: params.blocks,
          include_attribs: params.attribs,
          include_model: params.model,
          include_paper: params.paper,
          include_frozen: params.frozen,
          include_locked: params.locked,
          include_off: params.off,
          enable_v02: params.dims,
          // Filters only hide rows on screen. Every copy stays so it can be written.
          skip_numbers: false,
          skip_dupes: false,
          skip_nonsource: false,
          translation_mode: modeKey(src, dst),
        },
      });
      if (seq !== extractSeq.current) return [];
      const items = carryTargets(Array.isArray(data.items) ? data.items : [], keep);
      sheets.current.set(path, items);
      setRows(items);
      patchFile(path, { status: "" });
      if (!items.length) say(path, "info", "这张图没有可译文字。");
      return items;
    } catch (error) {
      if (seq !== extractSeq.current) return [];
      const dwgNoOda = /\.dwg$/i.test(path) && !oda.installed;
      patchFile(path, { status: "error" });
      say(path, "error", error.message, dwgNoOda ? {
        actions: [{ label: "怎么装 ODA", onClick: () => toggleSettings("wr") }],
      } : {});
      return [];
    } finally {
      if (seq === extractSeq.current) setBusy("");
    }
  }

  async function addDrawings(incoming) {
    if (!incoming.length) return;
    const { files: next, added } = mergeFiles(files, incoming);
    setFiles(next);
    say("", "", "");
    if (!added.length) {
      toast("这些图纸已经打开了。");
      return;
    }
    if (added.length > 1) toast(`加了 ${added.length} 张图纸`, "ok");
    if (!current || view === "work") {
      setCurrent(added[0].path);
      setQuery("");
      await extractFile(added[0].path);
    }
  }

  async function uploadAndAdd(list) {
    const cad = list.filter((file) => isCadName(file.name));
    if (!cad.length) {
      toast("只认 DWG 和 DXF 图纸。", "warn");
      return;
    }
    if (cad.length < list.length) toast(`跳过了 ${list.length - cad.length} 个不是图纸的文件。`, "warn");
    setBusy("extract");
    try {
      const data = await uploadDrawings(cad);
      setBusy("");
      await addDrawings(data.files || []);
    } catch (error) {
      setBusy("");
      toast(error.message || "打开失败", "error");
    }
  }

  async function openDrawings() {
    if (locked) return;
    const native = py();
    if (native?.pick_cad_files) {
      const picked = await native.pick_cad_files();
      const paths = picked?.paths || [];
      if (paths.length) await addDrawings(asFiles(paths));
      return;
    }
    cadInput.current?.click();
  }

  async function onCadPicked(event) {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    if (picked.length) await uploadAndAdd(picked);
  }

  function pickDrawing(path) {
    if (path === current) return;
    if (locked) {
      toast("等这张译完再换。", "warn");
      return;
    }
    setCurrent(path);
    setQuery("");
    if (view !== "work") setView("work");
    const cached = sheets.current.get(path);
    if (cached) setRows(cached);
    else extractFile(path);
  }

  async function removeDrawing(path) {
    if (locked && path === current) {
      toast("等这张译完再去掉。", "warn");
      return;
    }
    const index = files.findIndex((file) => file.path === path);
    const next = files.filter((file) => file.path !== path);
    setFiles(next);
    sheets.current.delete(path);
    setFileState((prev) => {
      const copy = { ...prev };
      delete copy[path];
      return copy;
    });
    if (current === path) {
      const neighbour = next[Math.min(index, next.length - 1)];
      if (neighbour) {
        setCurrent(neighbour.path);
        const cached = sheets.current.get(neighbour.path);
        if (cached) setRows(cached);
        else extractFile(neighbour.path);
      } else {
        setCurrent("");
        setRows([]);
        if (view === "batch") setView("work");
      }
    }
    try {
      await api("/api/drawings/close", { json: { path } });
    } catch {
      /* queue already dropped it */
    }
  }

  // ---------- translate + write ----------
  async function runTranslate() {
    if (!current) {
      say("", "info", "先打开图纸。");
      return;
    }
    if (locked) return;
    const shown = filterRows(rows, filters, sourceLang);
    if (!shown.length) {
      say(current, "info", rows.length ? "过滤后没有可显示的文字。" : "这张图没有可译文字。");
      return;
    }
    const pending = shown.filter((row) => row.selected !== false && !asText(row.target).trim());
    let nextRows = rows;
    let summary = "";
    if (pending.length) {
      setBusy("translate");
      patchFile(current, { status: "translating" });
      say(current, "busy", `正在译 ${pending.length} 句…`);
      try {
        const data = await api("/api/drawings/translate", {
          json: {
            items: pending,
            translation_mode: mode,
            skip_numbers: filters.numbers,
            skip_dupes: false,
            skip_nonsource: filters.nonsource,
            use_glossary: params.glossary,
            ...enginePayload(engine, config),
          },
        });
        nextRows = mergeTranslated(rows, Array.isArray(data.items) ? data.items : []);
        updateRows(() => nextRows);
        const bits = [`术语对上 ${asCount(data.glossary)}`];
        if (asCount(data.mt)) bits.push(`${engine === "cloud" ? "网上" : "接口"}译了 ${asCount(data.mt)}`);
        if (asCount(data.skipped)) bits.push(`未译 ${asCount(data.skipped)}`);
        summary = bits.join("，");
        if (!hasWritable(nextRows)) {
          const hint = engine === "local"
            ? "请先启动 Ollama。"
            : engine === "custom"
              ? "无法连接自定义接口。"
              : "剩下的要填网上翻译的密钥，或手填译文。";
          patchFile(current, { status: "" });
          say(current, "warn", `${summary}。${hint}`, {
            actions: data.has_engine ? [] : [{ label: "去填密钥", primary: true, onClick: () => toggleSettings("tr") }],
          });
          setBusy("");
          return;
        }
        if (asCount(data.skipped) && !data.has_engine) summary += "。没对上的先留原文，可以手填后再写出";
      } catch (error) {
        patchFile(current, { status: "error" });
        say(current, "error", error.message);
        setBusy("");
        return;
      }
    }
    await writeBackRows(nextRows, summary);
  }

  async function writeBack() {
    if (locked) return;
    await writeBackRows(rows, "");
  }

  async function writeBackRows(list, summary) {
    if (!current) {
      say("", "info", "先打开图纸。");
      return;
    }
    const items = syncDuplicates(Array.isArray(list) ? list : []);
    if (!hasWritable(items)) {
      say(current, "info", "没有可写回的译文。先点翻译，或手填译文。");
      return;
    }
    const path = current;
    setBusy("write");
    patchFile(path, { status: "writing" });
    say(path, "busy", "正在写出新文件…");
    try {
      const named = await api(
        `/api/default-output-name?mode=${encodeURIComponent(mode)}&base=${encodeURIComponent(outputStem(selected?.name))}&translate_filename=${params.filename ? "true" : "false"}`
      );
      const data = await api("/api/drawings/writeback", {
        json: {
          input_file: path,
          items,
          output_dir: config.output_dir,
          output_name: named.name,
          translation_mode: mode,
          include_blocks: params.blocks,
          style: layout,
          translate_filename: params.filename,
        },
      });
      const out = asText(data.path);
      const missing = asCount(data.missing) ? `，${asCount(data.missing)} 句在图上没找到` : "";
      patchFile(path, { status: "written", output: out });
      say(path, "ok", `${summary ? `${summary}。` : ""}已写出新文件，写了 ${asCount(data.written)} 句${missing}。`, {
        path: out,
        actions: [
          { label: "在文件夹中显示", onClick: () => reveal(out) },
        ],
      });
    } catch (error) {
      patchFile(path, { status: "error" });
      say(path, "error", error.message);
    } finally {
      setBusy("");
    }
  }

  // ---------- PDF ----------
  function cadPathForPdf() {
    if (writtenPath && /\.(dxf|dwg)$/i.test(writtenPath)) return writtenPath;
    return current;
  }

  async function exportPdf(andPrint = false) {
    if (!current) {
      say("", "info", "先打开图纸。");
      return;
    }
    const sourcePath = cadPathForPdf();
    const fromWriteback = Boolean(writtenPath) && sourcePath === writtenPath;
    const stem = outputStem(fromWriteback ? sourcePath : selected?.name);
    setBusy("pdf");
    const tid = toast(andPrint ? "正在导出并打印…" : "正在导出 PDF…", "busy", { ttl: 0 });
    try {
      const data = await api(andPrint ? "/api/drawings/print" : "/api/drawings/export-pdf", {
        json: {
          path: sourcePath,
          output_dir: config.output_dir,
          output_name: `${stem}.pdf`,
          style: layout,
          appearance,
          paper: pdfPaper,
          items: fromWriteback ? [] : syncDuplicates(rows),
        },
      });
      const out = asText(data.path);
      const where = fromWriteback ? "写回图纸" : "原图，还未写回译文";
      if (andPrint) {
        const printed = data.print || {};
        if (printed.ok) toast(`已送到系统打印（${where}）`, "ok");
        else {
          toast(`${printed.message || data.message || "打印没发出去"}。PDF 已留下。`, "warn", { action: { label: "在文件夹中显示", onClick: () => reveal(out) } });
          if (out) py()?.print_pdf?.(out);
        }
      } else {
        toast(fromWriteback ? `PDF 已导出（写回图纸）：${fileName(out)}` : `PDF 已导出（原图，还未写回译文）：${fileName(out)}`, "ok", {
          action: { label: "在文件夹中显示", onClick: () => reveal(out) },
        });
      }
    } catch (error) {
      toast(error.message, "error");
    } finally {
      dismiss(tid);
      setBusy("");
    }
  }

  // ---------- tables ----------
  async function exportTable(fmt = "csv") {
    if (!current) {
      say("", "info", "先打开图纸。");
      return;
    }
    try {
      const data = await api("/api/drawings/export-table", {
        json: { path: current, items: syncDuplicates(rows), translation_mode: mode, format: fmt },
      });
      const name = data.filename || (fmt === "xlsx" ? "图译表格.xlsx" : "图译表格.csv");
      const savedTo = fmt === "xlsx" && data.xlsx_b64
        ? await saveFile(name, { b64: data.xlsx_b64, bytes: b64ToBytes(data.xlsx_b64), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
        : await saveFile(name, { text: data.csv || "" });
      if (savedTo) toast(`表格已导出 ${asCount(data.count)} 条`, "ok");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function applyTable(next) {
    setTable(next);
    if (view === "batch") {
      toast(`已导入 ${next.name}。点「全部写回」写进每张图。`, "ok");
      return;
    }
    let items = rows;
    if (!items.length && current) items = await extractFile(current);
    if (!items.length) {
      say("", "info", "先打开图纸。");
      return;
    }
    const data = await api("/api/drawings/import-table", {
      json: { csv: next.csv, xlsx_b64: next.xlsx_b64, items, file: selected?.name || "" },
    });
    updateRows(() => syncDuplicates(Array.isArray(data.items) ? data.items : []));
    say(current, "ok", `表格填入 ${asCount(data.applied)} 条。可以改译文再写出新文件。`);
  }

  async function importTable() {
    const native = py();
    if (native?.pick_table_file) {
      const picked = await native.pick_table_file();
      if (!picked?.path) return;
      if (picked.error) {
        toast(picked.error, "error");
        return;
      }
      try {
        await applyTable({ name: fileName(picked.path), csv: picked.text || "", xlsx_b64: picked.xlsx_b64 || "" });
      } catch (error) {
        toast(error.message, "error");
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
        await applyTable({ name: file.name, csv: "", xlsx_b64: bytesToB64(await file.arrayBuffer()) });
      } else {
        const csv = await file.text();
        if (!csv.trim()) {
          toast("表格是空的", "warn");
          return;
        }
        await applyTable({ name: file.name, csv, xlsx_b64: "" });
      }
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function writeBackAll() {
    if (!files.length) {
      say("", "info", "先打开图纸。");
      return;
    }
    if (!table) {
      await importTable();
      return;
    }
    setBusy("table");
    try {
      const data = await api("/api/batch/import", {
        json: {
          csv: table.csv,
          xlsx_b64: table.xlsx_b64,
          files: files.map((item) => item.path),
          output_dir: config.output_dir,
          translation_mode: mode,
          style: layout,
          translate_filename: params.filename,
        },
      });
      (data.results || []).forEach((item) => {
        const match = files.find((file) => file.name === item.file);
        if (item.written && item.path && match) patchFile(match.path, { status: "written", output: item.path });
      });
      const last = [...(data.results || [])].reverse().find((item) => item.written && item.path);
      say(current || "", "ok", `已写回 ${asCount(data.written)} 条，共 ${asCount(data.files)} 张图。`, last?.path ? {
        path: last.path,
        actions: [{ label: "在文件夹中显示", onClick: () => reveal(last.path) }],
      } : {});
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setBusy("");
    }
  }

  // ---------- batch ----------
  const batchWasRunning = useRef(false);
  const refreshBatch = useCallback(async () => {
    try {
      const data = await api("/api/batch");
      setBatch(data);
      if (batchWasRunning.current && !data.started) {
        const tasks = data.tasks || [];
        const done = tasks.filter((task) => task.status === "succeeded");
        const failed = tasks.filter((task) => task.status === "failed").length;
        const stopped = tasks.some((task) => task.status === "cancelled" || task.status === "queued");
        const last = done[done.length - 1]?.output_file;
        const text = stopped
          ? `已停止：写出 ${done.length} 张。`
          : failed
            ? `译完了：写出 ${done.length} 张，${failed} 张没译成，可以点重试。`
            : `全部译完，写出 ${done.length} 张新图纸。`;
        say(batchNoticeKey.current, failed || stopped ? "warn" : "ok", text, last ? {
          actions: [{ label: "在文件夹中显示", onClick: () => reveal(last) }],
        } : {});
      }
      batchWasRunning.current = Boolean(data.started);
      (data.tasks || []).forEach((task) => {
        if (task.status === "succeeded" && task.output_file) {
          setFileState((prev) => (prev[task.input_file]?.output === task.output_file ? prev : {
            ...prev,
            [task.input_file]: { ...(prev[task.input_file] || {}), status: "written", output: task.output_file },
          }));
        }
      });
    } catch { /* next tick */ }
  }, [say]);

  useEffect(() => {
    if (view !== "batch") return undefined;
    refreshBatch();
    const timer = setInterval(refreshBatch, 1200);
    return () => clearInterval(timer);
  }, [view, refreshBatch]);

  async function startExport() {
    const paths = files.map((item) => item.path);
    if (!paths.length) {
      say("", "info", "先打开图纸。");
      return;
    }
    try {
      // Drop leftovers from an earlier session that are no longer in the list.
      const wanted = new Set(paths);
      for (const task of batch.tasks || []) {
        if (!wanted.has(task.input_file) && task.status !== "running") {
          await api(`/api/batch/${task.id}/remove`, { method: "POST" }).catch(() => {});
        }
      }
      await api("/api/batch/add", { json: { files: paths } });
      const started = await api("/api/batch/start", {
        json: {
          output_dir: config.output_dir,
          translation_mode: mode,
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
        },
      });
      setBatch(started);
      batchWasRunning.current = Boolean(started.started);
      batchNoticeKey.current = current || "";
      say(batchNoticeKey.current, "busy", started.message || "正在一起译。可以先去做别的，译完会在这里显示。");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function batchCall(path, message, tone = "info") {
    try {
      const data = await api(path, { method: "POST" });
      setBatch(data);
      if (message) toast(message, tone);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function pauseExport(paused) {
    try {
      const data = await api("/api/batch/pause", { json: { paused } });
      setBatch(data);
      toast(paused ? "已暂停。" : "继续导出。");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  // ---------- glossary ----------
  async function saveTerm(term, { quiet = false } = {}) {
    try {
      await api("/api/language-assets/terms", {
        json: {
          scope: term.scope || "global",
          mode: term.mode || mode,
          source: term.source,
          target: term.target,
          layer_contains: term.layer_contains || "",
          project_package_path: config.project_package_path || "",
          id: term.id,
        },
      });
      await refreshAssets();
      if (!quiet) toast("这条译法记下了。", "ok");
      return true;
    } catch (error) {
      toast(error.message, "error");
      return false;
    }
  }

  async function deleteTerms(list) {
    if (!list.length) {
      toast("先勾要删的。");
      return;
    }
    try {
      for (const term of list) {
        await api("/api/language-assets/terms/delete", {
          json: { scope: term.scope || "global", id: term.id, project_package_path: config.project_package_path || "" },
        });
      }
      await refreshAssets();
      toast(list.length > 1 ? `删掉了 ${list.length} 条。` : "删掉了。", "ok");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function exportTerms() {
    const savedTo = await saveFile("术语表.csv", { text: termsCsv(terms) });
    if (savedTo) toast(`术语表已导出 ${terms.length} 条`, "ok");
  }

  async function loadGlossary() {
    const native = py();
    if (native?.pick_term_package) {
      const picked = await native.pick_term_package();
      if (picked?.path) {
        try {
          await api("/api/language-assets/project", { json: { path: picked.path, create: false } });
          await refreshAssets();
          toast("已加载术语表。", "ok");
        } catch (error) {
          toast(error.message, "error");
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
        toast("术语表是空的", "warn");
        return;
      }
      const payload = { mode, csv: "", terms: [] };
      if (/\.json$/i.test(file.name)) payload.terms = JSON.parse(text).terms || [];
      else payload.csv = text;
      const result = await api("/api/language-assets/import", { json: payload });
      await refreshAssets();
      toast(`术语表写入 ${result.count} 条。`, "ok");
    } catch (error) {
      const message = String(error.message || "");
      toast(/json|unexpected/i.test(message) ? "术语表读不出来。" : message || "术语表读不出来。", "error");
    }
  }

  // ---------- settings ----------
  function updateConfig(patch) {
    setConfig((prev) => ({ ...prev, ...patch }));
    setProbe({ busy: false, text: "", ok: false });
  }

  async function pickOutputDir() {
    const native = py();
    if (!native?.pick_output_dir) {
      toast("浏览器里选不了文件夹。用图译桌面版选。", "warn");
      return;
    }
    const picked = await native.pick_output_dir();
    if (picked?.path) updateConfig({ output_dir: picked.path });
  }

  async function runProbe() {
    setProbe({ busy: true, text: "", ok: false });
    const sample = mode.startsWith("zh") ? "请在安装前确认接线正确" : "Check the wiring before installation";
    try {
      const data = await api("/api/drawings/translate", {
        json: {
          items: [{ id: 0, source: sample, type: "TEXT", layer: "0", handle: "", field: "text" }],
          translation_mode: mode,
          use_glossary: false,
          ...enginePayload(engine, config),
        },
      });
      const target = asText(data.items?.[0]?.target).trim();
      if (!data.has_engine) setProbe({ busy: false, ok: false, text: "还没填全，连不上。" });
      else if (target) setProbe({ busy: false, ok: true, text: `通了：${target}` });
      else setProbe({ busy: false, ok: false, text: "连上了，但没译出来。" });
    } catch (error) {
      setProbe({ busy: false, ok: false, text: error.message });
    }
  }

  // ---------- languages ----------
  function changeLangs(src, dst) {
    if (src === sourceLang && dst === targetLang) return;
    setPrefs({ sourceLang: src, targetLang: dst });
    sheets.current.clear();
    if (current && !locked) extractFile(current, { langs: [src, dst] });
  }

  function detectSource() {
    const blob = rows.slice(0, 40).map((row) => asText(row.source)).join("\n");
    if (!blob.trim()) {
      toast("先打开图纸再检测");
      return;
    }
    const next = guessLang(blob);
    const dst = next === targetLang ? (next === "en" ? "zh-Hans" : "en") : targetLang;
    changeLangs(next, dst);
    toast(`原文设成${langLabel(next)}`);
  }

  // ---------- keyboard + drag/drop ----------
  const keyHandler = useRef(null);
  keyHandler.current = (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape" && (view === "settings" || view === "glossary" || (view === "update" && !updating))) {
      if (!document.querySelector(".menu, .lang-pop")) leavePage();
      return;
    }
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "o") {
      event.preventDefault();
      openDrawings();
    } else if (key === "enter" && view === "work") {
      event.preventDefault();
      runTranslate();
    } else if (key === "s" && view === "work") {
      event.preventDefault();
      writeBack();
    } else if (key === ",") {
      event.preventDefault();
      toggleSettings();
    }
  };

  useEffect(() => {
    const onKey = (event) => keyHandler.current?.(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dragHasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");

  function onDragEnter(event) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropOver(true);
  }

  function onDragLeave(event) {
    if (!dragHasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDropOver(false);
  }

  async function onDrop(event) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropOver(false);
    if (locked) {
      toast("等这张译完再加。", "warn");
      return;
    }
    await uploadAndAdd([...event.dataTransfer.files]);
  }

  function onLights(kind) {
    const native = py();
    if (kind === "close") native?.close_window?.();
    if (kind === "min") native?.minimize_window?.();
    if (kind === "max") native?.toggle_maximize?.();
  }

  const onWorkPage = view === "work" || view === "batch";

  return (
    <div
      className="win"
      data-theme={theme}
      data-view={view}
      data-files={files.length ? "1" : "0"}
      data-native-titlebar={nativeTitlebar ? "true" : "false"}
      data-engine={engine}
      onDragEnter={onWorkPage ? onDragEnter : undefined}
      onDragOver={onWorkPage ? (event) => { if (dragHasFiles(event)) event.preventDefault(); } : undefined}
      onDragLeave={onWorkPage ? onDragLeave : undefined}
      onDrop={onWorkPage ? onDrop : undefined}
    >
      <a className="skip" href="#main">跳到图纸文字</a>
      {!nativeTitlebar && (
        <header className="tb pywebview-drag-region">
          <div className="lights" aria-hidden="true">
            <i className="r" onClick={() => onLights("close")} />
            <i className="y" onClick={() => onLights("min")} />
            <i className="g" onClick={() => onLights("max")} />
          </div>
          <span className="tb-title">图译</span>
        </header>
      )}

      <input ref={cadInput} type="file" accept=".dwg,.dxf" multiple hidden onChange={onCadPicked} />
      <input ref={glossaryInput} type="file" accept=".json,.csv,.txt,.hcterms.json" hidden onChange={onGlossaryPicked} />
      <input ref={tableInput} type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={onTablePicked} />

      {onWorkPage && (
        <div className="body page-enter">
          <div className="rail-wrap" style={{ width: railW }}>
            <Rail
              files={files}
              current={current}
              fileState={fileState}
              locked={locked}
              view={view}
              translating={translating || busy === "write"}
              canTranslate={Boolean(current) && !locked}
              onAdd={openDrawings}
              onPick={pickDrawing}
              onRemove={removeDrawing}
              onTranslate={view === "work" ? runTranslate : null}
              onToggleBatch={() => setView(view === "batch" ? "work" : "batch")}
            />
          </div>
          <div
            className={`split${railDrag ? " on" : ""}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整左右宽度"
            onDoubleClick={() => setRailW(280)}
            onPointerDown={(event) => {
              event.preventDefault();
              setRailDrag(true);
              const startX = event.clientX;
              const startW = railW;
              const move = (ev) => setRailW(Math.min(420, Math.max(220, startW + ev.clientX - startX)));
              const up = () => {
                setRailDrag(false);
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          />
          {view === "work" ? (
            <WorkView
              file={selected}
              rows={rows}
              visibleRows={visibleRows}
              stats={stats}
              counts={counts}
              filters={filters}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
              notice={notice}
              onCloseNotice={() => say(current, "", "")}
              loading={busy === "extract"}
              translating={translating}
              locked={locked}
              canWrite={hasWritable(rows)}
              dropOver={dropOver}
              onAdd={openDrawings}
              onEditRow={(id, value) => updateRows((prev) => editRow(prev, id, value))}
              onToggleRow={(id, checked) => updateRows((prev) => prev.map((item) => (item.id === id ? { ...item, selected: checked } : item)))}
              onToggleAll={(checked) => {
                const ids = new Set(visibleRows.map((row) => row.id));
                updateRows((prev) => prev.map((item) => (ids.has(item.id) ? { ...item, selected: checked } : item)));
              }}
              onWriteBack={writeBack}
              onExportTable={exportTable}
              onImportTable={importTable}
            />
          ) : (
            <BatchView
              files={files}
              batch={batch}
              layout={layout}
              onLayout={(value) => setPrefs({ layout: value })}
              outputDir={asText(config.output_dir)}
              onPickOutputDir={pickOutputDir}
              params={params}
              onParam={setParam}
              filters={filters}
              onFilter={setFilter}
              notice={notice}
              onCloseNotice={() => say(current, "", "")}
              busy={Boolean(busy)}
              tableName={table?.name || ""}
              onStart={startExport}
              onPause={pauseExport}
              onStop={() => batchCall("/api/batch/stop", "已停止。")}
              onClear={() => batchCall("/api/batch/clear", "列表清空了。")}
              onRetry={(id) => batchCall(`/api/batch/${id}/retry`, "已重新排队。")}
              onRemoveTask={(id) => batchCall(`/api/batch/${id}/remove`, "")}
              onImportTable={importTable}
              onWriteBackAll={writeBackAll}
              onReveal={reveal}
            />
          )}
          {dropOver && (
            <div className="drop-veil" aria-hidden="true">
              <div><FilePlus2 size={34} strokeWidth={1.5} /><strong>松手就加进来</strong><span>DWG、DXF，一次可以多张</span></div>
            </div>
          )}
        </div>
      )}

      {view === "settings" && (
        <SettingsView
          tab={settingsTab}
          onTab={setSettingsTab}
          onBack={leavePage}
          engine={engine}
          onEngine={(value) => {
            setEngine(value);
            setProbe({ busy: false, text: "", ok: false });
          }}
          config={config}
          onConfig={updateConfig}
          saved={saved}
          probe={probe}
          onProbe={runProbe}
          params={params}
          onParam={setParam}
          filters={filters}
          onFilter={setFilter}
          layout={layout}
          onLayout={(value) => setPrefs({ layout: value })}
          appearance={appearance}
          onAppearance={(value) => setPrefs({ appearance: value })}
          pdfPaper={pdfPaper}
          onPdfPaper={(value) => setPrefs({ pdfPaper: value })}
          onPickOutputDir={pickOutputDir}
          oda={oda}
          themePref={themePref}
          onTheme={setThemePref}
          appVersion={appVersion}
          updateInfo={updateInfo}
          updateMsg={updateMsg}
          checking={checking}
          updating={updating}
          onCheckUpdates={() => (updateInfo?.available ? goPage("update") : checkUpdates())}
          onOpenGlossary={() => setView("glossary")}
        />
      )}

      {view === "glossary" && (
        <GlossaryView
          terms={terms}
          builtinTerms={builtinTerms}
          onBack={leavePage}
          onAdd={(term) => saveTerm({ ...term, scope: "global" })}
          onSave={(term) => saveTerm(term, { quiet: true })}
          onDelete={(term) => deleteTerms([term])}
          onDeleteMany={deleteTerms}
          onImport={loadGlossary}
          onExport={exportTerms}
        />
      )}

      {view === "update" && (
        <UpdateView
          updateInfo={updateInfo}
          updateMsg={updateMsg}
          updating={updating}
          updatePercent={updatePercent}
          checking={checking}
          appVersion={appVersion}
          onBack={leavePage}
          onCancel={cancelUpdate}
          onApply={applyUpdate}
          onCheck={() => checkUpdates()}
          onOpenRelease={openReleasePage}
        />
      )}

      <Footer
        oda={oda}
        onOdaHelp={() => toggleSettings("wr")}
        lang={{
          sourceLang,
          targetLang,
          disabled: locked,
          onSource: (code) => code !== targetLang && changeLangs(code, targetLang),
          onTarget: (code) => code !== sourceLang && changeLangs(sourceLang, code),
          onSwap: () => changeLangs(targetLang, sourceLang),
          onDetect: detectSource,
        }}
        view={view}
        canPdf={Boolean(current) && !busy}
        pdf={{
          appearance,
          paper: pdfPaper,
          fromWriteback: Boolean(writtenPath),
          onAppearance: (value) => setPrefs({ appearance: value }),
          onPaper: (value) => setPrefs({ pdfPaper: value }),
        }}
        onExportPdf={exportPdf}
        onOpenGlossary={toggleGlossary}
        onOpenSettings={() => toggleSettings()}
        appVersion={appVersion}
        footBusy={checking || updating}
        updateAvailable={Boolean(updateInfo?.available)}
        updating={updating}
        onOpenUpdate={() => goPage("update")}
      />

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
