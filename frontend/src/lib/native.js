// pywebview bridge (desktop/native_bridge.py). Absent in a plain browser.
export function py() {
  return window.pywebview?.api || null;
}

export function isMacChrome() {
  return /Mac/i.test(navigator.userAgent || "");
}

export function hasNativeTitlebar() {
  // Desktop shell uses the OS caption bar on Windows and Mac.
  // Do not paint fake Mac traffic lights on Windows.
  if (isMacChrome()) return true;
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`;
  if (/Win/i.test(platform)) return true;
  return Boolean(window.pywebview);
}

export function modKey() {
  return isMacChrome() ? "⌘" : "Ctrl";
}

export function reveal(path) {
  if (!path) return;
  py()?.reveal_file?.(path);
}

// Save text/xlsx through the native dialog, or fall back to a browser download.
export async function saveFile(filename, { text = "", bytes = null, mime = "text/csv;charset=utf-8", b64 = "" } = {}) {
  const native = py();
  if (native?.save_table_file) {
    const saved = await native.save_table_file(filename, text, b64);
    return saved?.path || "";
  }
  const blob = new Blob([bytes || text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return filename;
}
