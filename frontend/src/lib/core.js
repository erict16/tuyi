// Pure helpers. No DOM, no fetch, so they stay unit-testable.
import { LANGS, LATIN_LANGS, LAYOUTS, VIA_LABELS } from "./constants";

export function asText(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

export function asCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function langLabel(code) {
  return LANGS.find(([id]) => id === code)?.[1] || code;
}

export function langShort(code) {
  return LANGS.find(([id]) => id === code)?.[2] || code;
}

export function layoutLabel(value) {
  return LAYOUTS.find(([api]) => api === value)?.[1] || value;
}

export function guessLang(text) {
  const sample = asText(text);
  if (/[一-鿿]/.test(sample)) return "zh-Hans";
  if (/[぀-ヿ]/.test(sample)) return "ja";
  if (/[가-힯]/.test(sample)) return "ko";
  if (/[฀-๿]/.test(sample)) return "th";
  if (/[Ѐ-ӿ]/.test(sample)) return "ru";
  return "en";
}

export function modeKey(source, target) {
  const src = asText(source);
  const dst = asText(target);
  if (src === "zh-Hans" && dst === "en") return "zh_to_en";
  if (src === "en" && dst === "zh-Hans") return "en_to_zh";
  return `${src}_to_${dst}`;
}

export function engineFromConfig(config) {
  const provider = asText(config?.provider);
  if (provider === "ollama") return "local";
  if (provider === "openai") return "custom";
  return "cloud";
}

export function engineProvider(engine, config) {
  if (engine === "local") return "ollama";
  if (engine === "custom") return "openai";
  return asText(config?.provider) === "azure" ? "azure" : "deepl";
}

export function enginePayload(engine, config) {
  const cfg = config && typeof config === "object" ? config : {};
  return {
    provider: engineProvider(engine, cfg),
    deepl_key: asText(cfg.deepl_key),
    azure_key: asText(cfg.azure_key),
    azure_region: asText(cfg.azure_region),
    openai_key: asText(cfg.openai_key),
    openai_base: asText(cfg.openai_base),
    openai_model: asText(cfg.openai_model),
    ollama_host: asText(cfg.ollama_host),
    ollama_model: asText(cfg.ollama_model),
    project_package_path: asText(cfg.project_package_path),
  };
}

// True when the chosen engine has what it needs to translate online.
export function engineReady(engine, config) {
  const cfg = config || {};
  if (engine === "local") return Boolean(asText(cfg.ollama_model).trim());
  if (engine === "custom") return Boolean(asText(cfg.openai_base).trim() && asText(cfg.openai_model).trim());
  if (asText(cfg.provider) === "azure") return Boolean(asText(cfg.azure_key).trim());
  return Boolean(asText(cfg.deepl_key).trim());
}

export function fileName(path) {
  return asText(path).split(/[/\\]/).pop();
}

export function asFiles(paths) {
  return (paths || []).map((path) => ({
    path,
    name: fileName(path),
    ext: asText(path).toLowerCase().endsWith(".dxf") ? "DXF" : "DWG",
  }));
}

// 添加图纸 adds to the list; it never drops what is already open.
export function mergeFiles(existing, incoming) {
  const seen = new Set((existing || []).map((file) => file.path));
  const added = (incoming || []).filter((file) => file?.path && !seen.has(file.path) && seen.add(file.path));
  return { files: [...(existing || []), ...added], added };
}

export function isCadName(name) {
  return /\.(dxf|dwg)$/i.test(asText(name));
}

export function rowVisible(row, filters, sourceLang) {
  const source = asText(row?.source);
  const lang = asText(sourceLang);
  if (filters.dupes && row?.duplicate) return false;
  if (filters.numbers && source && /^[\d.\-\s]+$/.test(source)) return false;
  if (filters.nonsource) {
    const hasCjk = /[一-鿿]/.test(source);
    if (lang.startsWith("zh") && !hasCjk) return false;
    if (LATIN_LANGS.has(lang) && hasCjk) return false;
  }
  return true;
}

export function filterRows(rows, filters, sourceLang, query = "") {
  const list = Array.isArray(rows) ? rows : [];
  const needle = asText(query).trim().toLowerCase();
  return list.filter((row) => {
    if (!rowVisible(row, filters, sourceLang)) return false;
    if (!needle) return true;
    return (
      asText(row.source).toLowerCase().includes(needle) ||
      asText(row.target).toLowerCase().includes(needle) ||
      asText(row.layer).toLowerCase().includes(needle)
    );
  });
}

// How many times each source string appears on the drawing.
export function sourceCounts(rows) {
  const counts = new Map();
  (rows || []).forEach((row) => {
    const key = asText(row.source);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

// 重复的句子只译一次: every other copy on the drawing gets the first copy's 译文,
// so a label repeated in two title blocks is written in both.
export function syncDuplicates(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const master = new Map();
  list.forEach((row) => {
    if (row.duplicate) return;
    if (!master.has(asText(row.source))) master.set(asText(row.source), row);
  });
  return list.map((row) => {
    if (!row.duplicate) return row;
    const lead = master.get(asText(row.source));
    if (!lead || lead.selected === false || !asText(lead.target).trim()) return row;
    if (row.via === "edit" && asText(row.target).trim()) return row;
    if (row.target === lead.target && row.target_raw === lead.target_raw && row.via === lead.via) return row;
    return { ...row, target: lead.target, target_raw: lead.target_raw, via: lead.via };
  });
}

// Merge translated rows back by handle+field, then id.
export function mergeTranslated(rows, translated) {
  const byKey = new Map();
  (translated || []).forEach((item) => {
    const handle = asText(item?.handle);
    const field = asText(item?.field) || "text";
    if (handle) byKey.set(`${handle}\t${field}`, item);
    if (item?.id != null) byKey.set(`id:${item.id}`, item);
  });
  const merged = (Array.isArray(rows) ? rows : []).map((row) => {
    const handle = asText(row?.handle);
    const field = asText(row?.field) || "text";
    const hit = (handle && byKey.get(`${handle}\t${field}`)) || (row?.id != null && byKey.get(`id:${row.id}`));
    return hit ? { ...row, ...hit, duplicate: row.duplicate, selected: row.selected } : row;
  });
  return syncDuplicates(merged);
}

// After a re-read (other layers, other spaces) keep 译文 the user already has.
export function carryTargets(nextRows, prevRows) {
  const prev = new Map();
  (prevRows || []).forEach((row) => {
    const handle = asText(row?.handle);
    if (handle && asText(row.target).trim()) prev.set(`${handle}\t${asText(row.field) || "text"}`, row);
  });
  if (!prev.size) return nextRows || [];
  return (nextRows || []).map((row) => {
    const old = prev.get(`${asText(row.handle)}\t${asText(row.field) || "text"}`);
    if (!old || asText(old.source) !== asText(row.source)) return row;
    return { ...row, target: old.target, target_raw: old.target_raw, via: old.via, selected: old.selected };
  });
}

export function editRow(rows, id, target) {
  const list = Array.isArray(rows) ? rows : [];
  const row = list.find((item) => item.id === id);
  if (!row) return list;
  const source = asText(row.source);
  const before = asText(row.target);
  // Editing the first copy carries to the copies that still match it; a copy
  // the user changed on its own keeps its own text.
  return list.map((item) => {
    if (item.id === id) return { ...item, target, target_raw: target, via: "edit" };
    const follows = !row.duplicate && item.duplicate && asText(item.source) === source
      && (asText(item.target) === before || !asText(item.target).trim());
    return follows ? { ...item, target, target_raw: target, via: "edit" } : item;
  });
}

// Extract unticks repeats; on screen every copy starts ticked like its first copy.
export function tickRepeats(rows) {
  return (rows || []).map((row) => (row.duplicate && row.selected === false ? { ...row, selected: true } : row));
}

// Ticking the first copy ticks its repeats; a repeat can be unticked on its own.
export function toggleRow(rows, id, checked) {
  const list = Array.isArray(rows) ? rows : [];
  const row = list.find((item) => item.id === id);
  if (!row) return list;
  const source = asText(row.source);
  return list.map((item) => {
    if (item.id === id) return { ...item, selected: checked };
    if (!row.duplicate && item.duplicate && asText(item.source) === source) return { ...item, selected: checked };
    return item;
  });
}

// What write-back receives: repeats filled, unticked rows marked so the
// backend leaves those copies alone.
export function writePayload(rows) {
  return syncDuplicates(rows).map((row) => ({ ...row, excluded: row.selected === false }));
}

export function hasWritable(rows) {
  return (rows || []).some((row) => row.selected !== false && asText(row.target).trim());
}

export function rowStats(rows, visible) {
  const list = Array.isArray(rows) ? rows : [];
  const shown = Array.isArray(visible) ? visible : list;
  const unique = list.filter((row) => !row.duplicate).length;
  const done = shown.filter((row) => asText(row.target).trim()).length;
  const picked = shown.filter((row) => row.selected !== false).length;
  return { total: list.length, unique, shown: shown.length, done, picked };
}

export function viaLabel(via) {
  const key = asText(via);
  if (!key) return "";
  return VIA_LABELS[key] || "机翻";
}

function csvCell(value) {
  const text = asText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function termsCsv(terms) {
  const lines = ["source,target,mode"];
  (terms || []).forEach((term) => {
    lines.push([term.source, term.target, term.mode].map(csvCell).join(","));
  });
  return `${lines.join("\n")}\n`;
}

export function termKey(term) {
  return `${asText(term?.scope) || "global"}-${term?.id}-${asText(term?.source)}`;
}

export function matchTerm(term, query) {
  const needle = asText(query).trim().toLowerCase();
  if (!needle) return true;
  return asText(term.source).toLowerCase().includes(needle) || asText(term.target).toLowerCase().includes(needle);
}

export function outputStem(name) {
  return asText(name).replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "") || "drawing";
}

export function bytesToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function b64ToBytes(b64) {
  const binary = atob(b64);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

export function shortPath(path, keep = 2) {
  const parts = asText(path).split(/[/\\]/).filter(Boolean);
  if (parts.length <= keep) return asText(path);
  return `…/${parts.slice(-keep).join("/")}`;
}
