import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { PREFS_KEY } from "./lib/constants";
import { fakeBackend, fakeNative } from "./test/fakeBackend";

async function openFloorPlan(user, backend) {
  await user.click(screen.getByRole("button", { name: /添加图纸/ }));
  await screen.findByRole("heading", { name: "floor.dxf" });
  await waitFor(() => expect(backend.called("POST", "/api/drawings/extract")).toHaveLength(1));
  await screen.findByText("天花图");
}

function dstInputs() {
  return screen.getAllByRole("textbox", { name: "译文" });
}

describe("work view", () => {
  it("starts on a calm empty state", async () => {
    fakeBackend();
    render(<App />);
    expect(screen.getByText("把 DWG / DXF 拖到这里")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /快速翻译/ })).toBeDisabled();
    await screen.findByText("ODA 已安装");
    await screen.findByText("v9.9.9");
  });

  it("offers ODA help when it is missing", async () => {
    fakeBackend({ "GET /api/odafc-status": () => ({ installed: false }) });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /没装 ODA/ }));
    expect(screen.getByRole("tab", { name: /图上怎么写/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/没装 ODA，DWG 打不开/)).toBeInTheDocument();
  });

  it("reads every copy, hides numbers and repeats on screen, and badges repeats", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);

    const sent = backend.last("POST", "/api/drawings/extract").body;
    expect(sent).toMatchObject({ skip_dupes: false, skip_numbers: false, skip_nonsource: false, translation_mode: "zh_to_en" });
    expect(screen.queryByText("1200")).not.toBeInTheDocument();
    expect(dstInputs()).toHaveLength(3);
    expect(screen.getByTitle(/图上出现 2 次/)).toHaveTextContent("×2");
    expect(screen.getByText("这张图有 4 句")).toBeInTheDocument();
  });

  it("quick translate sends only the shown rows and writes every copy", async () => {
    const backend = fakeBackend();
    const native = fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);

    await user.click(screen.getByRole("button", { name: /快速翻译/ }));
    await screen.findByText(/已写出新文件，写了 4 句/);

    const translated = backend.last("POST", "/api/drawings/translate").body;
    expect(translated.items.map((item) => item.source)).toEqual(["平面布置图", "天花图", "配电箱"]);
    expect(translated.skip_dupes).toBe(false);

    const written = backend.last("POST", "/api/drawings/writeback").body;
    const repeat = written.items.find((item) => item.handle === "B1");
    expect(repeat).toMatchObject({ target: "floor plan", duplicate: true });
    expect(written.style).toBe("纯译文");
    expect(dstInputs().map((input) => input.value)).toEqual(["floor plan", "reflected ceiling plan", "distribution board"]);
    expect(within(screen.getByRole("listbox", { name: "打开的图纸" })).getByText("已写出")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "在文件夹中显示" }));
    expect(native.reveal_file).toHaveBeenCalledWith("/out/en_floor_1200.dxf");
  });

  it("only translates what is still empty the second time", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(screen.getByRole("button", { name: /快速翻译/ }));
    await screen.findByText(/已写出新文件/);
    await user.click(screen.getByRole("button", { name: /快速翻译/ }));
    await waitFor(() => expect(backend.called("POST", "/api/drawings/writeback")).toHaveLength(2));
    expect(backend.called("POST", "/api/drawings/translate")).toHaveLength(1);
  });

  it("points to the key when nothing could be translated", async () => {
    const backend = fakeBackend({
      "POST /api/drawings/translate": (body) => ({ items: body.items.map((item) => ({ ...item, target: "", via: "needs_engine" })), glossary: 0, mt: 0, skipped: body.items.length, has_engine: false }),
    });
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(screen.getByRole("button", { name: /快速翻译/ }));
    await screen.findByText(/剩下的要填网上翻译的密钥，或手填译文。/);
    expect(backend.called("POST", "/api/drawings/writeback")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "去填密钥" }));
    expect(screen.getByRole("heading", { name: "翻译" })).toBeInTheDocument();
  });

  it("hand edits are written and follow to repeats", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    const write = screen.getByRole("button", { name: /写出新文件/ });
    expect(write).toBeDisabled();
    await user.type(dstInputs()[0], "Layout");
    expect(write).toBeEnabled();
    await user.click(write);
    await screen.findByText(/已写出新文件，写了 2 句/);
    const items = backend.last("POST", "/api/drawings/writeback").body.items;
    expect(items.find((item) => item.handle === "A1")).toMatchObject({ target: "Layout", via: "edit" });
    expect(items.find((item) => item.handle === "B1")).toMatchObject({ target: "Layout" });
  });

  it("Enter moves to the next 译文", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(dstInputs()[0]);
    await user.keyboard("{Enter}");
    expect(dstInputs()[1]).toHaveFocus();
  });

  it("adds drawings instead of replacing them and keeps edits per drawing", async () => {
    const backend = fakeBackend();
    const native = fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.type(dstInputs()[0], "Layout");

    native.pick_cad_files.mockResolvedValueOnce({ paths: ["/d/floor.dxf", "/d/second.dxf"] });
    await user.click(screen.getByRole("button", { name: /添加/ }));
    await screen.findByRole("heading", { name: "second.dxf" });
    expect(screen.getAllByRole("option")).toHaveLength(2);

    await user.click(screen.getByRole("option", { name: /floor\.dxf/ }));
    expect(await screen.findByDisplayValue("Layout")).toBeInTheDocument();
    expect(backend.called("POST", "/api/drawings/extract")).toHaveLength(2);
  });

  it("removes a drawing and moves to its neighbour", async () => {
    const backend = fakeBackend();
    fakeNative({ pick_cad_files: async () => ({ paths: ["/d/floor.dxf", "/d/second.dxf"] }) });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /添加图纸/ }));
    await screen.findByRole("heading", { name: "floor.dxf" });
    await user.click(screen.getByRole("button", { name: "从队列去掉 floor.dxf" }));
    await screen.findByRole("heading", { name: "second.dxf" });
    expect(backend.last("POST", "/api/drawings/close").body).toEqual({ path: "/d/floor.dxf" });
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("shows a calm error when a drawing cannot be read", async () => {
    fakeBackend();
    fakeNative({ pick_cad_files: async () => ({ paths: ["/d/broken.dxf"] }) });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /添加图纸/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取DXF文件");
    expect(within(screen.getByRole("listbox")).getByText("出错了")).toBeInTheDocument();
  });

  it("filter menu brings numbers back without re-reading the drawing", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(screen.getByRole("button", { name: /先别译 3/ }));
    await user.click(screen.getByRole("checkbox", { name: /^数字、尺寸/ }));
    expect(screen.queryByText("1200")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /^已经是外文的/ }));
    expect(screen.getByText("1200")).toBeInTheDocument();
    expect(backend.called("POST", "/api/drawings/extract")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)).filters.numbers).toBe(false);
  });

  it("search narrows the rows", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.type(screen.getByRole("searchbox", { name: "在图纸文字里找" }), "配电");
    expect(dstInputs()).toHaveLength(1);
    await user.clear(screen.getByRole("searchbox", { name: "在图纸文字里找" }));
    await user.type(screen.getByRole("searchbox", { name: "在图纸文字里找" }), "没有的");
    expect(screen.getByText("没有找到「没有的」。")).toBeInTheDocument();
  });

  it("Ctrl+Enter translates, Ctrl+O opens", async () => {
    const backend = fakeBackend();
    const native = fakeNative();
    render(<App />);
    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    await screen.findByRole("heading", { name: "floor.dxf" });
    expect(native.pick_cad_files).toHaveBeenCalled();
    await screen.findByText("天花图");
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(backend.called("POST", "/api/drawings/writeback")).toHaveLength(1));
  });

  it("changing languages re-reads with the new pair", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(screen.getByRole("button", { name: /中.*英/ }));
    const targets = screen.getByRole("group", { name: "译文" });
    await user.click(within(targets).getByRole("button", { name: "日语" }));
    await waitFor(() => expect(backend.called("POST", "/api/drawings/extract")).toHaveLength(2));
    expect(backend.last("POST", "/api/drawings/extract").body.translation_mode).toBe("zh-Hans_to_ja");
    expect(within(screen.getByRole("group", { name: "原文" })).getByRole("button", { name: "日语" })).toBeDisabled();
  });

  it("exports a PDF of the written drawing with the chosen look", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(screen.getByRole("button", { name: /快速翻译/ }));
    await screen.findByText(/已写出新文件/);
    await user.click(screen.getByRole("button", { name: /导出 PDF/ }));
    const looks = screen.getByRole("radiogroup", { name: "PDF 看起来" });
    await user.click(within(looks).getByRole("radio", { name: "白纸，颜色还在" }));
    await user.click(screen.getByRole("radio", { name: "A3 横向" }));
    await user.click(screen.getAllByRole("button", { name: "导出 PDF" }).at(-1));
    await screen.findByText(/PDF 已导出（写回图纸）/);
    expect(backend.last("POST", "/api/drawings/export-pdf").body).toMatchObject({
      path: "/out/en_floor_1200.dxf",
      appearance: "彩色",
      paper: "a3l",
      items: [],
    });
  });
});

describe("settings", () => {
  it("restores the saved engine and saves edits by itself", async () => {
    const backend = fakeBackend({ "GET /api/config": () => ({ provider: "openai", openai_base: "https://api.x/v1", openai_model: "m", output_dir: "/out" }) });
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(backend.called("GET", "/api/config")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /设置/ }));
    expect(screen.getByRole("radio", { name: /自己配接口/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox", { name: "模型名" })).toHaveValue("m");

    await user.click(screen.getByRole("radio", { name: /网上翻译/ }));
    await user.type(screen.getByLabelText("DeepL 密钥"), "abc");
    await waitFor(() => expect(backend.last("POST", "/api/config")?.body).toMatchObject({ provider: "deepl", deepl_key: "abc" }), { timeout: 2000 });
    await screen.findByText("已保存");
  });

  it("tries one sentence with the current engine", async () => {
    const backend = fakeBackend({
      "POST /api/drawings/translate": (body) => ({ items: body.items.map((item) => ({ ...item, target: "Confirm the wiring" })), has_engine: true }),
    });
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.click(screen.getByRole("button", { name: "试译一句" }));
    await screen.findByText("通了：Confirm the wiring");
    expect(backend.last("POST", "/api/drawings/translate").body.use_glossary).toBe(false);
  });

  it("picks an output folder and Escape goes back", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(backend.called("GET", "/api/config")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.click(screen.getByRole("tab", { name: /图上怎么写/ }));
    await user.click(screen.getByRole("button", { name: /选取文件夹/ }));
    await waitFor(() => expect(backend.last("POST", "/api/config")?.body.output_dir).toBe("/picked"), { timeout: 2000 });
    await user.keyboard("{Escape}");
    expect(screen.getByText("把 DWG / DXF 拖到这里")).toBeInTheDocument();
  });

  it("re-reads the drawing after scan options change, keeping 译文", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.type(dstInputs()[1], "RCP");
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.click(screen.getByText("高级翻译设置"));
    await user.click(screen.getByRole("checkbox", { name: "块里的字" }));
    await user.click(screen.getByRole("button", { name: "返回" }));
    await waitFor(() => expect(backend.called("POST", "/api/drawings/extract")).toHaveLength(2));
    expect(backend.last("POST", "/api/drawings/extract").body.include_blocks).toBe(false);
    expect(await screen.findByDisplayValue("RCP")).toBeInTheDocument();
  });

  it("switches the window theme", async () => {
    fakeBackend();
    const native = fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.click(screen.getByRole("tab", { name: /外观和更新/ }));
    await user.click(screen.getByRole("radio", { name: "深色" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(native.set_chrome_theme).toHaveBeenLastCalledWith(true);
    expect(localStorage.getItem("tuyi-theme")).toBe("dark");
  });
});

describe("glossary", () => {
  it("adds, edits and deletes my terms", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /术语管理/ }));
    const add = screen.getByRole("button", { name: /加上/ });
    expect(add).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "新术语原文" }), "进线柜");
    await user.type(screen.getByRole("textbox", { name: "新术语译文" }), "Incoming cabinet{Enter}");
    await screen.findByRole("textbox", { name: "术语原文" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "新术语原文" })).toHaveValue(""));
    expect(backend.last("POST", "/api/language-assets/terms").body).toMatchObject({ source: "进线柜", target: "Incoming cabinet", scope: "global", mode: "zh_to_en" });
    expect(screen.getByRole("textbox", { name: "新术语原文" })).toHaveValue("");

    const target = screen.getByDisplayValue("Incoming cabinet");
    await user.clear(target);
    await user.type(target, "Incomer{Enter}");
    await waitFor(() => expect(backend.last("POST", "/api/language-assets/terms").body).toMatchObject({ id: "t1", target: "Incomer" }));
    const saves = backend.called("POST", "/api/language-assets/terms").length;
    await user.click(screen.getByRole("textbox", { name: "术语原文" }));
    await user.tab();
    expect(backend.called("POST", "/api/language-assets/terms")).toHaveLength(saves);

    await user.click(screen.getByRole("checkbox", { name: "选中 进线柜" }));
    await user.click(screen.getByRole("button", { name: /删掉选中的 1/ }));
    await screen.findByText("还没有自己定的译法。上面填一行再点加上。");
  });

  it("lists built-in terms on demand and searches them", async () => {
    fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /术语管理/ }));
    expect(screen.queryByText("grounding")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /软件自带 1 条/ }));
    expect(screen.getByText("grounding")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "搜译法" }), "不存在");
    expect(screen.queryByText("grounding")).not.toBeInTheDocument();
  });

  it("exports terms as a CSV through the native dialog", async () => {
    const backend = fakeBackend();
    backend.state.terms = [{ id: "t1", scope: "global", source: "柜,箱", target: "Cabinet", mode: "zh_to_en" }];
    const native = fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /术语管理/ }));
    await screen.findByDisplayValue("柜,箱");
    await user.click(screen.getByRole("button", { name: "导出术语" }));
    expect(native.save_table_file).toHaveBeenCalledWith("术语表.csv", 'source,target,mode\n"柜,箱",Cabinet,zh_to_en\n', "");
  });
});

describe("batch", () => {
  it("drops leftovers, starts the queue and speaks Chinese", async () => {
    const backend = fakeBackend();
    backend.state.batch.tasks = [{ id: "old", input_file: "/gone/junk.dxf", status: "failed", progress: 0, message: "图纸不存在" }];
    fakeNative({ pick_cad_files: async () => ({ paths: ["/d/floor.dxf", "/d/second.dxf"] }) });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /添加图纸/ }));
    await screen.findByRole("heading", { name: "floor.dxf" });
    await user.click(screen.getByRole("button", { name: /一起译 2 张/ }));
    expect(await screen.findByText("junk.dxf")).toBeInTheDocument();
    expect(screen.getByText("没译成")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /快速翻译这几张/ }));
    await waitFor(() => expect(backend.called("POST", "/api/batch/start")).toHaveLength(1));
    expect(backend.called("POST", "/api/batch/old/remove")).toHaveLength(1);
    expect(backend.last("POST", "/api/batch/add").body.files).toEqual(["/d/floor.dxf", "/d/second.dxf"]);
    expect(backend.last("POST", "/api/batch/start").body).toMatchObject({ style: "纯译文", translation_mode: "zh_to_en", output_format: "source" });
    expect(await screen.findByRole("button", { name: /暂停/ })).toBeInTheDocument();

    await act(async () => {
      backend.state.batch = {
        started: false,
        paused: false,
        progress: 100,
        tasks: [
          { id: "task-0", input_file: "/d/floor.dxf", status: "succeeded", progress: 100, output_file: "/out/en_floor.dxf" },
          { id: "task-1", input_file: "/d/second.dxf", status: "failed", progress: 0, message: "翻译失败" },
        ],
      };
      await new Promise((resolve) => setTimeout(resolve, 1400));
    });
    await screen.findByText(/写出 1 张，1 张没译成/);
    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
    expect(within(screen.getByRole("listbox")).getByText("已写出")).toBeInTheDocument();
  });
});

describe("review regressions", () => {
  it("keeps a loaded term package when settings save later", async () => {
    const backend = fakeBackend();
    fakeNative({ pick_term_package: async () => ({ path: "/p/项目.hcterms.json" }) });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(backend.called("GET", "/api/config")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /术语管理/ }));
    await user.click(screen.getByRole("button", { name: "加载术语表" }));
    await screen.findByText("已加载术语表。");
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.type(screen.getByLabelText("DeepL 密钥"), "k");
    await waitFor(() => expect(backend.last("POST", "/api/config")?.body.deepl_key).toBe("k"), { timeout: 2000 });
    expect(backend.last("POST", "/api/config").body.project_package_path).toBe("/p/项目.hcterms.json");
  });

  it("never saves settings when the saved config could not be read", async () => {
    const backend = fakeBackend({ "GET /api/config": () => new Response("boom", { status: 500 }) });
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(backend.called("GET", "/api/config")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.type(screen.getByLabelText("DeepL 密钥"), "k");
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(backend.called("POST", "/api/config")).toHaveLength(0);
  });

  it("gets back from 一起译 after the list shrinks to one drawing", async () => {
    fakeBackend();
    fakeNative({ pick_cad_files: async () => ({ paths: ["/d/floor.dxf", "/d/second.dxf"] }) });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /添加图纸/ }));
    await screen.findByRole("heading", { name: "floor.dxf" });
    await user.click(screen.getByRole("button", { name: /一起译 2 张/ }));
    await user.click(screen.getByRole("button", { name: "从队列去掉 second.dxf" }));
    expect(screen.getByRole("button", { name: /回到单张/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /floor\.dxf/ }));
    expect(await screen.findByRole("heading", { name: "floor.dxf" })).toBeInTheDocument();
  });

  it("re-reads after scan options change even when 设置 is left via 术语管理", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.click(screen.getByText("高级翻译设置"));
    await user.click(screen.getByRole("checkbox", { name: "块里的字" }));
    await user.click(screen.getByRole("button", { name: /术语管理/ }));
    await waitFor(() => expect(backend.called("POST", "/api/drawings/extract")).toHaveLength(2));
    expect(backend.last("POST", "/api/drawings/extract").body.include_blocks).toBe(false);
  });

  it("keeps hand edits on other drawings when scan options change", async () => {
    const backend = fakeBackend();
    fakeNative({ pick_cad_files: async () => ({ paths: ["/d/floor.dxf", "/d/second.dxf"] }) });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /添加图纸/ }));
    await screen.findByText("天花图");
    await user.type(dstInputs()[1], "RCP");
    await user.click(screen.getByRole("option", { name: /second\.dxf/ }));
    await screen.findByRole("heading", { name: "second.dxf" });
    await user.click(screen.getByRole("button", { name: /设置/ }));
    await user.click(screen.getByText("高级翻译设置"));
    await user.click(screen.getByRole("checkbox", { name: "块属性" }));
    await user.click(screen.getByRole("button", { name: "返回" }));
    await user.click(screen.getByRole("option", { name: /floor\.dxf/ }));
    expect(await screen.findByDisplayValue("RCP")).toBeInTheDocument();
    expect(backend.last("POST", "/api/drawings/extract").body).toMatchObject({ path: "/d/floor.dxf", include_attribs: false });
  });

  it("an unticked repeat is sent as excluded", async () => {
    const backend = fakeBackend();
    fakeNative();
    const user = userEvent.setup();
    render(<App />);
    await openFloorPlan(user, backend);
    await user.click(screen.getByRole("button", { name: /先别译 3/ }));
    await user.click(screen.getByRole("checkbox", { name: /^重复的句子/ }));
    await user.keyboard("{Escape}");
    const ticks = screen.getAllByRole("checkbox", { name: /翻译这一句：平面布置图/ });
    expect(ticks).toHaveLength(2);
    expect(ticks[1]).toBeChecked();
    await user.click(ticks[1]);
    await user.click(screen.getByRole("button", { name: /快速翻译/ }));
    await screen.findByText(/已写出新文件，写了 3 句/);
    const items = backend.last("POST", "/api/drawings/writeback").body.items;
    expect(items.find((item) => item.handle === "B1")).toMatchObject({ excluded: true });
    expect(items.find((item) => item.handle === "A1")).toMatchObject({ excluded: false, target: "floor plan" });
  });

  it("Enter on a file's 去掉 button removes it instead of opening it", async () => {
    const backend = fakeBackend();
    fakeNative({ pick_cad_files: async () => ({ paths: ["/d/floor.dxf", "/d/second.dxf"] }) });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /添加图纸/ }));
    await screen.findByRole("heading", { name: "floor.dxf" });
    screen.getByRole("button", { name: "从队列去掉 second.dxf" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(backend.last("POST", "/api/drawings/close").body).toEqual({ path: "/d/second.dxf" });
  });
});

