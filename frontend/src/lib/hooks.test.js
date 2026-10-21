import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, PREFS_KEY, THEME_KEY } from "./constants";
import { loadPrefs, readThemePref } from "./hooks";

describe("loadPrefs", () => {
  it("falls back to defaults", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it("merges saved choices over defaults and drops unknown keys", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ layout: "原译对照", filters: { dupes: false }, junk: 1 }));
    const prefs = loadPrefs();
    expect(prefs.layout).toBe("原译对照");
    expect(prefs.filters).toEqual({ ...DEFAULT_PREFS.filters, dupes: false });
    expect(prefs.params).toEqual(DEFAULT_PREFS.params);
    expect(prefs).not.toHaveProperty("junk");
  });

  it("survives broken storage", () => {
    localStorage.setItem(PREFS_KEY, "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe("readThemePref", () => {
  it("keeps the old light/dark value and defaults to system", () => {
    expect(readThemePref()).toBe("system");
    localStorage.setItem(THEME_KEY, "dark");
    expect(readThemePref()).toBe("dark");
    localStorage.setItem(`${THEME_KEY}-pref`, "system");
    expect(readThemePref()).toBe("system");
  });
});
