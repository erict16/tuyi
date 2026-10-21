// In-memory stand-in for backend/api.py. Records every call so tests can
// assert what the UI sent, and lets a test override any route.
import { vi } from "vitest";

export const FLOOR_ROWS = [
  { id: 0, source: "平面布置图", handle: "A1", field: "text", layer: "TITLE", type: "TEXT", duplicate: false, selected: true, target: "", via: "" },
  { id: 1, source: "天花图", handle: "A2", field: "text", layer: "TITLE", type: "TEXT", duplicate: false, selected: true, target: "", via: "" },
  { id: 2, source: "1200", handle: "A3", field: "text", layer: "DIM", type: "TEXT", duplicate: false, selected: true, target: "", via: "" },
  { id: 3, source: "平面布置图", handle: "B1", field: "text", layer: "TITLE", type: "TEXT", duplicate: true, selected: false, target: "", via: "" },
  { id: 4, source: "配电箱", handle: "A4", field: "text", layer: "E-POWR", type: "ATTRIB", duplicate: false, selected: true, target: "", via: "" },
];

const GLOSSARY = { 平面布置图: "floor plan", 天花图: "reflected ceiling plan", 配电箱: "distribution board" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function fakeBackend(overrides = {}) {
  const calls = [];
  const state = {
    config: { provider: "deepl", deepl_key: "", output_dir: "/out", project_package_path: "" },
    terms: [],
    batch: { tasks: [], started: false, paused: false, progress: 0 },
    rows: { "/d/floor.dxf": FLOOR_ROWS, "/d/second.dxf": [FLOOR_ROWS[1]] },
  };

  const routes = {
    "GET /api/health": () => ({ ok: true, version: "9.9.9" }),
    "GET /api/odafc-status": () => ({ installed: true, path: "/oda" }),
    "GET /api/config": () => state.config,
    "POST /api/config": (body) => {
      state.config = body;
      return { ok: true };
    },
    "GET /api/language-assets": () => ({ terms: state.terms, builtin_terms: [{ id: "b1", scope: "builtin", source: "接地", target: "grounding" }] }),
    "GET /api/updates/check": () => ({ available: false, current: "9.9.9" }),
    "POST /api/drawings/extract": (body) => {
      const items = state.rows[body.path];
      if (!items) return json({ detail: "无法读取DXF文件" }, 400);
      return { path: body.path, count: items.length, unique: items.filter((r) => !r.duplicate).length, items: items.map((r) => ({ ...r })) };
    },
    "POST /api/drawings/translate": (body) => {
      const items = body.items.map((item) => {
        const hit = body.use_glossary === false ? null : GLOSSARY[item.source];
        return hit ? { ...item, target: hit, target_raw: hit, via: "glossary" } : { ...item, target: "", via: "needs_engine" };
      });
      const glossary = items.filter((item) => item.via === "glossary").length;
      return { items, glossary, mt: 0, skipped: items.length - glossary, has_engine: false };
    },
    "GET /api/default-output-name": () => ({ name: "en_floor_1200" }),
    "POST /api/drawings/writeback": (body) => ({
      path: `/out/${body.output_name}.dxf`,
      written: body.items.filter((item) => (item.target || "").trim() && !item.excluded && (item.selected !== false || item.duplicate)).length,
      missing: 0,
    }),
    "POST /api/drawings/export-pdf": (body) => ({ path: `/out/${body.output_name}` }),
    "POST /api/drawings/export-table": () => ({ filename: "表格.csv", csv: "a,b\n", count: 3 }),
    "POST /api/drawings/close": () => ({ ok: true }),
    "POST /api/language-assets/project": (body) => {
      state.config = { ...state.config, project_package_path: body.path };
      return { path: body.path, name: "项目", terms: [] };
    },
    "POST /api/language-assets/terms": (body) => {
      const id = body.id || `t${state.terms.length + 1}`;
      state.terms = [...state.terms.filter((term) => term.id !== id), { ...body, id }];
      return { ok: true };
    },
    "POST /api/language-assets/terms/delete": (body) => {
      state.terms = state.terms.filter((term) => term.id !== body.id);
      return { ok: true };
    },
    "GET /api/batch": () => state.batch,
    "POST /api/batch/add": (body) => {
      body.files.forEach((path) => {
        if (!state.batch.tasks.some((task) => task.input_file === path)) {
          state.batch.tasks.push({ id: `task-${state.batch.tasks.length}`, input_file: path, status: "queued", progress: 0 });
        }
      });
      return state.batch;
    },
    "POST /api/batch/start": () => {
      state.batch = { ...state.batch, started: true };
      return state.batch;
    },
    ...overrides,
  };

  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const parsed = new URL(url, "http://tuyi.test");
    let body = null;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    calls.push({ method, path: parsed.pathname, query: parsed.searchParams, body });
    let key = `${method} ${parsed.pathname}`;
    if (!routes[key] && /^\/api\/batch\/[^/]+\/(remove|retry)$/.test(parsed.pathname)) {
      const [, , , id, action] = parsed.pathname.split("/");
      if (action === "remove") state.batch.tasks = state.batch.tasks.filter((task) => task.id !== id);
      return json(state.batch);
    }
    const handler = routes[key];
    if (!handler) return json({ detail: `no route ${key}` }, 404);
    const out = await handler(body, parsed.searchParams, state);
    return out instanceof Response ? out : json(out);
  });

  vi.stubGlobal("fetch", fetchMock);
  return {
    state,
    calls,
    called: (method, path) => calls.filter((call) => call.method === method && call.path === path),
    last: (method, path) => calls.filter((call) => call.method === method && call.path === path).at(-1),
  };
}

export function fakeNative(extra = {}) {
  const native = {
    pick_cad_files: vi.fn(async () => ({ paths: ["/d/floor.dxf"] })),
    reveal_file: vi.fn(),
    set_chrome_theme: vi.fn(),
    pick_output_dir: vi.fn(async () => ({ path: "/picked" })),
    save_table_file: vi.fn(async (name) => ({ path: `/saved/${name}` })),
    ...extra,
  };
  window.pywebview = { api: native };
  return native;
}
