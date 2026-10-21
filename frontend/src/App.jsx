import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import "./App.css";
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
  tickRepeats,
  toggleRow,
  writePayload,
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
  const [runAll, setRunAll] = useState(null);
  const [stopping, setStopping] = useState(false);

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
  const tablePick = useRef(null);
  const sheets = useRef(new Map());
  const extractSeq = useRef(0);
  const extractSnap = useRef("");
  const pageReturn = useRef("work");
  const configLoaded = useRef(false);
  const dragDepth = useRef(0);
  const stopAll = useRef(false);
  const currentRef = useRef("");
  const stale = useRef(new Set());

  const mode = modeKey(sourceLang, targetLang);
  const selected = files.find((item) => item.path === current);
  const visibleRows = useMemo(() => filterRows(rows, filters, sourceLang, query), [rows, filters, sourceLang, query]);
  // Count only text in the source language: an English schematic has nothing to translate.
  const stats = useMemo(
    () => rowStats(filterRows(rows, { ...filters, dupes: false }, sourceLang), filterRows(rows, filters, sourceLang)),
    [rows, filters, sourceLang],
  );
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

  useEffect(() => {
    currentRef.current = current;
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
        // Only now may edits save: saving before the real config loads would wipe keys.
        configLoaded.current = true;
        if (health?.version) setAppVersion(asText(health.version));
        await refreshAssets();
      } catch (error) {
        say("", "error", error.message);
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
    if (locked) {
      // Leaving mid-run would hide 停止 and could re-read a drawing under the run.
      toast("等译完再去设置。", "warn");
      return;
    }
    if (view === "work") pageReturn.current = view;
    if (next === "settings" && view !== "settings") extractSnap.current = extractKey(params);
    setView(next);
  }

  function leavePage() {
    setView(pageReturn.current || "work");
  }

  // Leaving 设置 by any route (返回, 术语管理, 检查更新) re-reads if scan options changed.
  const lastView = useRef(view);
  useEffect(() => {
    const was = lastView.current;
    lastView.current = view;
    if (was !== "settings" || view === "settings") return;
    if (!extractSnap.current || extractSnap.current === extractKey(params)) return;
    extractSnap.current = "";
    // Other drawings re-read when next opened, keeping their 译文.
    sheets.current.forEach((cached, path) => stale.current.add(path));
    if (current) extractFile(current, { keep: rows });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

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
  function selectFile(path) {
    currentRef.current = path;
    setCurrent(path);
    setQuery("");
  }

  function showRows(path, items) {
    if (currentRef.current === path) setRows(items);
  }

  // Read a drawing's text into the cache. Throws on a drawing that cannot be read.
  async function readRows(path, { keep = null, langs = null } = {}) {
    const src = langs?.[0] || sourceLang;
    const dst = langs?.[1] || targetLang;
    patchFile(path, { status: "extracting", notice: null });
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
    const items = carryTargets(tickRepeats(Array.isArray(data.items) ? data.items : []), keep);
    stale.current.delete(path);
    sheets.current.set(path, items);
    patchFile(path, { status: items.length ? "" : "skip" });
    if (!items.length) say(path, "info", "这张图没有要翻译的文字，不用译。");
    return items;
  }

  function readFailed(path, error) {
    const dwgNoOda = /\.dwg$/i.test(path) && !oda.installed;
    patchFile(path, { status: "error" });
    say(path, "error", error.message, dwgNoOda ? {
      actions: [{ label: "怎么装 ODA", onClick: () => toggleSettings("wr") }],
    } : {});
  }

  async function extractFile(path, options = {}) {
    const seq = extractSeq.current + 1;
    extractSeq.current = seq;
    setBusy("extract");
    if (currentRef.current === path) setRows([]);
    try {
      const items = await readRows(path, options);
      if (seq === extractSeq.current) showRows(path, items);
      return items;
    } catch (error) {
      if (seq === extractSeq.current) readFailed(path, error);
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
    selectFile(added[0].path);
    await extractFile(added[0].path);
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
      toast("等译完再换。", "warn");
      return;
    }
    selectFile(path);
    openCached(path);
  }

  function openCached(path) {
    const cached = sheets.current.get(path);
    if (cached && stale.current.has(path)) extractFile(path, { keep: cached });
    else if (cached) setRows(cached);
    else extractFile(path);
  }

  async function removeDrawing(path) {
    if (locked) {
      toast("等译完再去掉。", "warn");
      return;
    }
    const index = files.findIndex((file) => file.path === path);
    const removed = { file: files[index], index, rows: sheets.current.get(path), state: fileState[path] };
    const next = files.filter((file) => file.path !== path);
    setFiles(next);
    sheets.current.delete(path);
    stale.current.delete(path);
    setFileState((prev) => {
      const copy = { ...prev };
      delete copy[path];
      return copy;
    });
    let undone = false;
    toast(`去掉了 ${removed.file?.name || ""}`, "info", {
      ttl: 6000,
      action: {
        label: "撤销",
        onClick: () => {
          undone = true;
          setFiles((prev) => {
            if (prev.some((file) => file.path === path)) return prev;
            const copy = [...prev];
            copy.splice(Math.min(removed.index, copy.length), 0, removed.file);
            return copy;
          });
          if (removed.rows) sheets.current.set(path, removed.rows);
          if (removed.state) patchFile(path, removed.state);
          selectFile(path);
          if (removed.rows) setRows(removed.rows);
          else extractFile(path);
        },
      },
    });
    if (current === path) {
      const neighbour = next[Math.min(index, next.length - 1)];
      if (neighbour) {
        selectFile(neighbour.path);
        openCached(neighbour.path);
      } else {
        selectFile("");
        setRows([]);
      }
    }
    // A dropped drawing's temp copy is deleted on close, so wait out the undo.
    setTimeout(() => {
      if (!undone) api("/api/drawings/close", { json: { path } }).catch(() => {});
    }, 6500);
  }

  // ---------- translate + write ----------
  // Translate what is still empty in one drawing, then write its new file.
  // Returns { state: "written" | "empty" | "needs_engine" | "error" }.
  async function translateFile(path, list) {
    const shown = filterRows(list, filters, sourceLang);
    if (!shown.length) {
      const anySource = filterRows(list, { numbers: true, dupes: false, nonsource: true }, sourceLang).length > 0;
      if (anySource) {
        say(path, "info", "要译的字都被「先别译」藏起来了，在设置里改。");
      } else {
        patchFile(path, { status: "skip" });
        say(path, "info", `这张图没有${langLabel(sourceLang)}，不用译。`);
      }
      return { state: "empty" };
    }
    const pending = shown.filter((row) => row.selected !== false && !asText(row.target).trim());
    let next = list;
    let summary = "";
    if (pending.length) {
      patchFile(path, { status: "translating" });
      say(path, "busy", `正在译 ${pending.length} 句…`);
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
        next = mergeTranslated(list, Array.isArray(data.items) ? data.items : []);
        sheets.current.set(path, next);
        showRows(path, next);
        const bits = [`术语对上 ${asCount(data.glossary)}`];
        if (asCount(data.mt)) bits.push(`${engine === "cloud" ? "网上" : "接口"}译了 ${asCount(data.mt)}`);
        if (asCount(data.skipped)) bits.push(`未译 ${asCount(data.skipped)}`);
        summary = bits.join("，");
        if (!hasWritable(next)) {
          const hint = engine === "local"
            ? "请先启动 Ollama。"
            : engine === "custom"
              ? "无法连接自定义接口。"
              : "剩下的要填网上翻译的密钥，或手填译文。";
          patchFile(path, { status: "" });
          say(path, "warn", `${summary}。${hint}`, {
            actions: data.has_engine ? [] : [{ label: "去填密钥", primary: true, onClick: () => toggleSettings("tr") }],
          });
          return { state: "needs_engine" };
        }
        if (asCount(data.skipped) && !data.has_engine) summary += "。没对上的先留原文，可以手填后再写出";
      } catch (error) {
        patchFile(path, { status: "error" });
        say(path, "error", error.message);
        return { state: "error" };
      }
    }
    return writeFile(path, next, summary);
  }

  async function writeFile(path, list, summary) {
    const items = writePayload(Array.isArray(list) ? list : []);
    if (!hasWritable(items)) {
      say(path, "info", "没有可写回的译文。先点翻译，或手填译文。");
      return { state: "empty" };
    }
    patchFile(path, { status: "writing" });
    say(path, "busy", "正在写出新文件…");
    try {
      const named = await api(
        `/api/default-output-name?mode=${encodeURIComponent(mode)}&base=${encodeURIComponent(outputStem(fileName(path)))}&translate_filename=${params.filename ? "true" : "false"}`
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
        actions: [{ label: "在文件夹中显示", onClick: () => reveal(out) }],
      });
      return { state: "written", path: out };
    } catch (error) {
      patchFile(path, { status: "error" });
      say(path, "error", error.message);
      return { state: "error" };
    }
  }

  // One button: the drawing on screen, or every open drawing when there are several.
  async function runTranslate() {
    if (!current) {
      say("", "info", "先打开图纸。");
      return;
    }
    if (locked) return;
    if (files.length > 1) {
      await translateAll();
      return;
    }
    setBusy("translate");
    try {
      let list = rows;
      if (fileState[current]?.status === "error" || !sheets.current.has(current) || stale.current.has(current)) {
        try {
          list = await readRows(current, { keep: sheets.current.get(current) });
          showRows(current, list);
        } catch (error) {
          readFailed(current, error);
          return;
        }
      }
      await translateFile(current, list);
    } finally {
      setBusy("");
    }
  }

  async function translateAll() {
    stopAll.current = false;
    setStopping(false);
    setBusy("translate");
    const queue = [...files];
    const done = [];
    const failed = [];
    let stopped = false;
    let needsEngine = false;
    let lastOut = "";
    try {
      for (let index = 0; index < queue.length; index += 1) {
        if (stopAll.current) {
          stopped = true;
          break;
        }
        const file = queue[index];
        setRunAll({ index: index + 1, total: queue.length, name: file.name });
        selectFile(file.path);
        let list = sheets.current.get(file.path);
        if (!list || stale.current.has(file.path)) {
          if (currentRef.current === file.path) setRows([]);
          try {
            list = await readRows(file.path, { keep: list });
          } catch (error) {
            readFailed(file.path, error);
            failed.push(file.name);
            continue;
          }
        }
        showRows(file.path, list);
        const result = await translateFile(file.path, list);
        if (result.state === "written") {
          done.push(file.name);
          lastOut = result.path;
        } else if (result.state === "needs_engine") {
          // Same missing key for every drawing: say it once and stop.
          needsEngine = true;
          break;
        } else if (result.state !== "empty") failed.push(file.name);
      }
    } finally {
      setBusy("");
      setRunAll(null);
      setStopping(false);
    }
    const showFolder = lastOut ? { action: { label: "在文件夹中显示", onClick: () => reveal(lastOut) } } : {};
    if (needsEngine) toast(`术语表译不完，要填翻译密钥才能继续。已写好 ${done.length} 张。`, "warn", {
      ttl: 0,
      action: { label: "去填密钥", onClick: () => toggleSettings("tr") },
    });
    else if (stopped) toast(`已停止，写好 ${done.length} 张。`, "warn", showFolder);
    else if (failed.length) toast(`写好 ${done.length} 张，${failed.length} 张没写成。点左边的图纸看原因。`, "warn", { ttl: 9000, ...showFolder });
    else if (done.length) toast(done.length > 1 ? `${done.length} 张都写好了。` : "写好了。", "ok", showFolder);
  }

  async function writeBack() {
    if (locked || !current) return;
    setBusy("write");
    try {
      await writeFile(current, rows, "");
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
          items: fromWriteback ? [] : writePayload(rows),
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
          ttl: 10000,
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

  // Pick a table file (CSV or Excel); resolves null when cancelled.
  function pickTable() {
    const native = py();
    if (native?.pick_table_file) {
      return native.pick_table_file().then((picked) => {
        if (!picked?.path) return null;
        if (picked.error) throw new Error(picked.error);
        return { name: fileName(picked.path), csv: picked.text || "", xlsx_b64: picked.xlsx_b64 || "" };
      });
    }
    return new Promise((resolve) => {
      tablePick.current = resolve;
      tableInput.current?.click();
    });
  }

  async function onTablePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const resolve = tablePick.current;
    tablePick.current = null;
    if (!resolve) return;
    if (!file) {
      resolve(null);
      return;
    }
    try {
      if (/\.xlsx$/i.test(file.name)) resolve({ name: file.name, csv: "", xlsx_b64: bytesToB64(await file.arrayBuffer()) });
      else resolve({ name: file.name, csv: await file.text(), xlsx_b64: "" });
    } catch {
      resolve(null);
    }
  }

  // Fill this drawing's 译文 from a table someone filled in.
  async function importTable() {
    if (!current || locked) return;
    try {
      const table = await pickTable();
      if (!table) return;
      if (!table.csv.trim() && !table.xlsx_b64) {
        toast("表格是空的", "warn");
        return;
      }
      if (!rows.length) {
        say(current, "info", "这张图没读出文字，没法用表格填。");
        return;
      }
      const data = await api("/api/drawings/import-table", {
        json: { csv: table.csv, xlsx_b64: table.xlsx_b64, items: rows, file: selected?.name || "" },
      });
      updateRows(() => syncDuplicates(Array.isArray(data.items) ? data.items : []));
      say(current, "ok", `表格填入 ${asCount(data.applied)} 条。可以改译文再写出新文件。`);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  // One table for many drawings: rows are matched by the file name in the table.
  async function writeBackAll() {
    if (!files.length || locked) return;
    let table;
    try {
      table = await pickTable();
    } catch (error) {
      toast(error.message, "error");
      return;
    }
    if (!table) return;
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
        // The API reports file names; skip names shared by two open drawings.
        const matches = files.filter((file) => file.name === item.file);
        if (item.written && item.path && matches.length === 1) patchFile(matches[0].path, { status: "written", output: item.path });
      });
      const last = [...(data.results || [])].reverse().find((item) => item.written && item.path);
      toast(`按表格写好 ${(data.results || []).filter((item) => item.written).length} 张，共写了 ${asCount(data.written)} 句。`, "ok", last?.path ? {
        action: { label: "在文件夹中显示", onClick: () => reveal(last.path) },
      } : {});
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setBusy("");
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
          const project = await api("/api/language-assets/project", { json: { path: picked.path, create: false } });
          // The server saved the path; keep it here too or the next autosave erases it.
          setConfig((prev) => ({ ...prev, project_package_path: asText(project.path) || picked.path }));
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
    // 译文 belong to the old language pair; every drawing is read again.
    sheets.current.clear();
    stale.current.clear();
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

  // A file dropped outside the work view must not navigate the web view to it.
  useEffect(() => {
    const guard = (event) => event.preventDefault();
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
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

  const onWorkPage = view === "work";

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
          {files.length > 0 && <>
          <div className="rail-wrap" style={{ width: railW }}>
            <Rail
              files={files}
              current={current}
              fileState={fileState}
              locked={locked}
              translating={translating || busy === "write"}
              runAll={runAll}
              canTranslate={Boolean(current) && !locked}
              onAdd={openDrawings}
              onPick={pickDrawing}
              onRemove={removeDrawing}
              onTranslate={runTranslate}
              stopping={stopping}
              onStop={() => {
                stopAll.current = true;
                setStopping(true);
              }}
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
          </>}
            <WorkView
              file={selected}
              rows={rows}
              visibleRows={visibleRows}
              stats={stats}
              counts={counts}
              filters={filters}
              query={query}
              onQuery={setQuery}
              notice={notice}
              onCloseNotice={() => say(curState.notice ? current : "", "", "")}
              loading={busy === "extract"}
              translating={translating}
              locked={locked}
              canWrite={hasWritable(rows)}
              dropOver={dropOver}
              onAdd={openDrawings}
              onEditRow={(id, value) => updateRows((prev) => editRow(prev, id, value))}
              onToggleRow={(id, checked) => updateRows((prev) => toggleRow(prev, id, checked))}
              onToggleAll={(checked) => {
                const ids = new Set(visibleRows.map((row) => row.id));
                const sources = new Set(visibleRows.filter((row) => !row.duplicate).map((row) => row.source));
                updateRows((prev) => prev.map((item) => (
                  ids.has(item.id) || (item.duplicate && sources.has(item.source)) ? { ...item, selected: checked } : item
                )));
              }}
              onWriteBack={writeBack}
              onExportTable={exportTable}
              onImportTable={importTable}
              onWriteBackAll={files.length > 1 ? writeBackAll : null}
            />
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
        hasFile={Boolean(current)}
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
