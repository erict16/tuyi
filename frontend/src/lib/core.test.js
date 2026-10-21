import { describe, expect, it } from "vitest";
import {
  asCount,
  asText,
  carryTargets,
  editRow,
  engineFromConfig,
  enginePayload,
  engineProvider,
  engineReady,
  filterRows,
  guessLang,
  hasWritable,
  mergeFiles,
  mergeTranslated,
  modeKey,
  outputStem,
  rowStats,
  shortPath,
  sourceCounts,
  syncDuplicates,
  termsCsv,
  tickRepeats,
  toggleRow,
  viaLabel,
  writePayload,
} from "./core";

const FILTERS_ON = { numbers: true, dupes: true, nonsource: true };
const FILTERS_OFF = { numbers: false, dupes: false, nonsource: false };

function row(id, source, extra = {}) {
  return { id, source, target: "", handle: `H${id}`, field: "text", duplicate: false, selected: true, ...extra };
}

describe("text helpers", () => {
  it("never throws on odd values", () => {
    expect(asText(null)).toBe("");
    expect(asText(12)).toBe("12");
    expect(asCount("7")).toBe(7);
    expect(asCount("x")).toBe(0);
  });

  it("builds mode keys", () => {
    expect(modeKey("zh-Hans", "en")).toBe("zh_to_en");
    expect(modeKey("en", "zh-Hans")).toBe("en_to_zh");
    expect(modeKey("zh-Hans", "ja")).toBe("zh-Hans_to_ja");
  });

  it("guesses the source language", () => {
    expect(guessLang("配电箱")).toBe("zh-Hans");
    expect(guessLang("カタカナ")).toBe("ja");
    expect(guessLang("한국어")).toBe("ko");
    expect(guessLang("Привет")).toBe("ru");
    expect(guessLang("hello")).toBe("en");
  });

  it("strips folders and extensions for output names", () => {
    expect(outputStem("C:\\a\\b\\总图-A1.dwg")).toBe("总图-A1");
    expect(outputStem("")).toBe("drawing");
    expect(shortPath("/Users/me/Downloads/out", 2)).toBe("…/Downloads/out");
    expect(shortPath("/a", 2)).toBe("/a");
  });
});

describe("engine", () => {
  it("maps saved provider back to the engine card", () => {
    expect(engineFromConfig({ provider: "openai" })).toBe("custom");
    expect(engineFromConfig({ provider: "ollama" })).toBe("local");
    expect(engineFromConfig({ provider: "azure" })).toBe("cloud");
    expect(engineFromConfig(null)).toBe("cloud");
  });

  it("maps the engine card to the API provider", () => {
    expect(engineProvider("cloud", { provider: "azure" })).toBe("azure");
    expect(engineProvider("cloud", { provider: "openai" })).toBe("deepl");
    expect(engineProvider("custom", {})).toBe("openai");
    expect(engineProvider("local", {})).toBe("ollama");
    expect(enginePayload("cloud", { deepl_key: "k" })).toMatchObject({ provider: "deepl", deepl_key: "k", azure_key: "" });
  });

  it("knows when an engine is filled in", () => {
    expect(engineReady("cloud", { deepl_key: " " })).toBe(false);
    expect(engineReady("cloud", { deepl_key: "k" })).toBe(true);
    expect(engineReady("cloud", { provider: "azure", azure_key: "a" })).toBe(true);
    expect(engineReady("custom", { openai_base: "https://x", openai_model: "" })).toBe(false);
    expect(engineReady("local", { ollama_model: "qwen" })).toBe(true);
  });
});

describe("files", () => {
  it("adds drawings without dropping or repeating open ones", () => {
    const a = { path: "/a.dxf", name: "a.dxf" };
    const b = { path: "/b.dwg", name: "b.dwg" };
    const { files, added } = mergeFiles([a], [a, b, b]);
    expect(files).toEqual([a, b]);
    expect(added).toEqual([b]);
  });
});

describe("rows", () => {
  const rows = [
    row(0, "平面布置图"),
    row(1, "平面布置图", { duplicate: true, selected: false }),
    row(2, "1200"),
    row(3, "HELLO"),
    row(4, "配电箱", { layer: "E-POWR" }),
  ];

  it("hides numbers, repeats and foreign text when asked", () => {
    expect(filterRows(rows, FILTERS_ON, "zh-Hans").map((r) => r.id)).toEqual([0, 4]);
    expect(filterRows(rows, FILTERS_OFF, "zh-Hans")).toHaveLength(5);
    expect(filterRows(rows, FILTERS_ON, "en").map((r) => r.id)).toEqual([3]);
  });

  it("searches source, target and layer", () => {
    expect(filterRows(rows, FILTERS_OFF, "zh-Hans", "e-powr").map((r) => r.id)).toEqual([4]);
    expect(filterRows(rows, FILTERS_OFF, "zh-Hans", "布置").map((r) => r.id)).toEqual([0, 1]);
  });

  it("counts repeats", () => {
    expect(sourceCounts(rows).get("平面布置图")).toBe(2);
  });

  it("gives every copy of a repeated label the first copy's 译文", () => {
    const done = syncDuplicates([
      row(0, "平面布置图", { target: "floor plan", target_raw: "floor plan", via: "glossary" }),
      row(1, "平面布置图", { duplicate: true }),
      row(2, "平面布置图", { duplicate: true, target: "plan", via: "edit" }),
    ]);
    expect(done[1]).toMatchObject({ target: "floor plan", via: "glossary" });
    expect(done[2].target).toBe("plan");
  });

  it("keeps the same object when nothing changes", () => {
    const list = [row(0, "a", { target: "x" }), row(1, "a", { duplicate: true, target: "x", target_raw: undefined, via: undefined })];
    const out = syncDuplicates(list);
    expect(out[1]).toBe(list[1]);
  });

  it("merges translations by handle and keeps the user's ticks", () => {
    const merged = mergeTranslated(rows, [
      { id: 0, handle: "H0", field: "text", source: "平面布置图", target: "floor plan", via: "glossary", selected: true },
    ]);
    expect(merged[0].target).toBe("floor plan");
    expect(merged[1]).toMatchObject({ target: "floor plan", duplicate: true, selected: false });
    expect(merged[4].target).toBe("");
  });

  it("carries an edit on the first copy to its repeats", () => {
    const list = syncDuplicates(editRow(rows, 0, "Layout"));
    expect(list[0]).toMatchObject({ target: "Layout", via: "edit" });
    expect(list[1]).toMatchObject({ target: "Layout", via: "edit" });
    expect(editRow(rows, 99, "x")).toBe(rows);
  });

  it("keeps 译文 across a re-read when handle and text match", () => {
    const old = [row(0, "平面布置图", { target: "floor plan", via: "edit" }), row(4, "配电箱", { target: "DB" })];
    const fresh = [row(0, "平面布置图"), row(4, "改了的字"), row(9, "新的")];
    const out = carryTargets(fresh, old);
    expect(out[0]).toMatchObject({ target: "floor plan", via: "edit" });
    expect(out[1].target).toBe("");
    expect(out[2].target).toBe("");
    expect(carryTargets(fresh, [])).toBe(fresh);
  });

  it("knows when there is something to write", () => {
    expect(hasWritable(rows)).toBe(false);
    expect(hasWritable([row(0, "a", { target: "x", selected: false })])).toBe(false);
    expect(hasWritable([row(0, "a", { target: "x", selected: false, duplicate: true })])).toBe(false);
    expect(hasWritable([row(0, "a", { target: " x " })])).toBe(true);
  });

  it("starts repeats ticked and lets the first copy carry the tick", () => {
    const list = tickRepeats([row(0, "a"), row(1, "a", { duplicate: true, selected: false })]);
    expect(list[1].selected).toBe(true);
    const off = toggleRow(list, 0, false);
    expect(off.map((r) => r.selected)).toEqual([false, false]);
    const one = toggleRow(list, 1, false);
    expect(one.map((r) => r.selected)).toEqual([true, false]);
  });

  it("does not hand an unticked first copy's 译文 to its repeats", () => {
    const out = syncDuplicates([row(0, "a", { target: "x", selected: false }), row(1, "a", { duplicate: true })]);
    expect(out[1].target).toBe("");
  });

  it("marks unticked rows excluded for write-back", () => {
    const out = writePayload([row(0, "a", { target: "x" }), row(1, "a", { duplicate: true, selected: false })]);
    expect(out.map((r) => r.excluded)).toEqual([false, true]);
    expect(out[1].target).toBe("x");
  });

  it("counts what is shown and done", () => {
    const list = [row(0, "a", { target: "x" }), row(1, "a", { duplicate: true }), row(2, "b")];
    expect(rowStats(list, [list[0], list[2]])).toEqual({ total: 3, unique: 2, shown: 2, done: 1, picked: 2 });
  });

  it("labels where a 译文 came from", () => {
    expect(viaLabel("glossary")).toBe("术语");
    expect(viaLabel("edit")).toBe("手改");
    expect(viaLabel("deepl")).toBe("机翻");
    expect(viaLabel("")).toBe("");
  });
});

describe("glossary export", () => {
  it("quotes commas, quotes and new lines", () => {
    const csv = termsCsv([
      { source: "进线柜", target: "Incoming cabinet", mode: "zh_to_en" },
      { source: "柜,箱", target: 'say "hi"\nnow', mode: "zh_to_en" },
    ]);
    expect(csv).toBe('source,target,mode\n进线柜,Incoming cabinet,zh_to_en\n"柜,箱","say ""hi""\nnow",zh_to_en\n');
  });
});
