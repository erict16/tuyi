import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PREFS, PREFS_KEY, THEME_KEY } from "./constants";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage: prefs just don't stick */
  }
}

// Remembered choices (languages, layout, filters, params). Unknown keys from
// older versions are dropped; missing keys fall back to defaults.
export function loadPrefs() {
  const stored = readJson(PREFS_KEY) || {};
  return {
    ...DEFAULT_PREFS,
    ...Object.fromEntries(Object.entries(stored).filter(([key]) => key in DEFAULT_PREFS)),
    filters: { ...DEFAULT_PREFS.filters, ...(stored.filters || {}) },
    params: { ...DEFAULT_PREFS.params, ...(stored.params || {}) },
  };
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => {
    writeRaw(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);
  const update = useCallback((patch) => {
    setPrefs((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);
  return [prefs, update];
}

export function readThemePref() {
  try {
    const stored = localStorage.getItem(THEME_KEY + "-pref") || localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemDark() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

// Returns [pref, setPref, resolved]. `tuyi-theme` keeps holding light/dark so
// the launcher can paint the native titlebar before React loads.
export function useTheme() {
  const [pref, setPref] = useState(readThemePref);
  const [dark, setDark] = useState(systemDark);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const onChange = () => setDark(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);
  const resolved = pref === "system" ? (dark ? "dark" : "light") : pref;
  useEffect(() => {
    writeRaw(THEME_KEY + "-pref", pref);
    writeRaw(THEME_KEY, resolved);
  }, [pref, resolved]);
  return [pref, setPref, resolved];
}

let toastSeq = 0;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);
  const push = useCallback((message, tone = "info", options = {}) => {
    toastSeq += 1;
    const id = toastSeq;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone, action: options.action }]);
    const ttl = options.ttl ?? (tone === "error" ? 7000 : 4000);
    if (ttl > 0) timers.current.set(id, setTimeout(() => dismiss(id), ttl));
    return id;
  }, [dismiss]);
  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);
  return { toasts, push, dismiss };
}

export function useOutsideClose(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, onClose]);
}
