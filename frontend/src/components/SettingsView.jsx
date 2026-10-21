import { useState } from "react";
import { ArrowLeft, CircleCheck, Cloud, Cpu, FolderOpen, Monitor, Palette, Server, Wand2 } from "lucide-react";
import { APPEARANCES, LAYOUTS, PDF_PAPERS, THEMES } from "../lib/constants";
import { asText, engineReady, shortPath } from "../lib/core";
import { Banner, Check, Field, Seg, Spinner } from "./ui";

const TABS = [
  ["tr", "翻译", Wand2],
  ["wr", "图上怎么写", Palette],
  ["more", "外观和更新", Monitor],
];

const ENGINE_OPTIONS = [
  ["cloud", "网上翻译", Cloud, "DeepL 或 Azure，要密钥"],
  ["custom", "自己配接口", Server, "DeepSeek、通义等 OpenAI 兼容接口"],
  ["local", "不联网", Cpu, "本机 Ollama，图纸不出电脑"],
];

function EngineCards({ engine, onEngine }) {
  return (
    <div className="engine-cards" role="radiogroup" aria-label="用哪个翻译">
      {ENGINE_OPTIONS.map(([id, label, Icon, hint]) => (
        <button key={id} type="button" role="radio" aria-checked={engine === id} className={`engine${engine === id ? " on" : ""}`} onClick={() => onEngine(id)}>
          <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
          <strong>{label}</strong>
          <small>{hint}</small>
        </button>
      ))}
    </div>
  );
}

function Secret({ label, value, onChange, placeholder = "没有就空着" }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <span className="secret">
        <input
          type={show ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label={label}
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="tbtn sm ghost" onClick={() => setShow((on) => !on)}>{show ? "藏起来" : "显示"}</button>
      </span>
    </Field>
  );
}

export default function SettingsView({
  tab,
  onTab,
  onBack,
  engine,
  onEngine,
  config,
  onConfig,
  saved,
  probe,
  onProbe,
  params,
  onParam,
  filters,
  onFilter,
  layout,
  onLayout,
  appearance,
  onAppearance,
  pdfPaper,
  onPdfPaper,
  onPickOutputDir,
  oda,
  themePref,
  onTheme,
  appVersion,
  updateInfo,
  updateMsg,
  checking,
  updating,
  onCheckUpdates,
  onOpenGlossary,
}) {
  const set = (key) => (value) => onConfig({ [key]: value });
  const ready = engineReady(engine, config);
  return (
    <div className="body page-enter">
      <section className="page set-page" aria-label="设置">
        <nav className="set-nav" role="tablist" aria-label="设置分页">
          <button type="button" className="back" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />返回</button>
          {TABS.map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" className={tab === id ? "on" : ""} aria-selected={tab === id} onClick={() => onTab(id)}>
              <Icon size={15} strokeWidth={1.7} aria-hidden="true" />{label}
            </button>
          ))}
          <span className="grow" />
          <span className={`saved${saved ? " on" : ""}`} aria-live="polite">{saved ? <><CircleCheck size={12} aria-hidden="true" />已保存</> : ""}</span>
        </nav>

        <div className="set-pane" key={tab}>
          {tab === "tr" && (
            <>
              <h1>翻译</h1>
              <p className="help">术语表里有的词直接用，不联网。剩下的交给下面选的翻译。</p>
              <div className="card">
                <EngineCards engine={engine} onEngine={onEngine} />
                {engine === "cloud" && (
                  <>
                    <Field label="网上用哪家">
                      <Seg
                        label="网上翻译服务"
                        value={config.provider === "azure" ? "azure" : "deepl"}
                        options={[["deepl", "DeepL"], ["azure", "Azure"]]}
                        onChange={set("provider")}
                      />
                    </Field>
                    {config.provider === "azure" ? (
                      <>
                        <Secret label="Azure 密钥" value={config.azure_key} onChange={set("azure_key")} />
                        <Field label="Azure 区域">
                          <input type="text" autoComplete="off" spellCheck={false} placeholder="eastasia" aria-label="Azure 区域" value={config.azure_region || ""} onChange={(event) => set("azure_region")(event.target.value)} />
                        </Field>
                      </>
                    ) : (
                      <Secret label="DeepL 密钥" value={config.deepl_key} onChange={set("deepl_key")} />
                    )}
                  </>
                )}
                {engine === "custom" && (
                  <>
                    <Field label="网址">
                      <input type="url" autoComplete="off" spellCheck={false} placeholder="https://api.deepseek.com/v1" aria-label="接口网址" value={config.openai_base || ""} onChange={(event) => set("openai_base")(event.target.value)} />
                    </Field>
                    <Secret label="密钥" value={config.openai_key} onChange={set("openai_key")} />
                    <Field label="模型">
                      <input type="text" autoComplete="off" spellCheck={false} placeholder="deepseek-chat" aria-label="模型名" value={config.openai_model || ""} onChange={(event) => set("openai_model")(event.target.value)} />
                    </Field>
                  </>
                )}
                {engine === "local" && (
                  <>
                    <Field label="Ollama 网址" hint="空着就是本机 http://127.0.0.1:11434">
                      <input type="url" autoComplete="off" spellCheck={false} placeholder="http://127.0.0.1:11434" aria-label="Ollama 网址" value={config.ollama_host || ""} onChange={(event) => set("ollama_host")(event.target.value)} />
                    </Field>
                    <Field label="模型">
                      <input type="text" autoComplete="off" spellCheck={false} placeholder="qwen2.5 或 llama3.1" aria-label="Ollama 模型名" value={config.ollama_model || ""} onChange={(event) => set("ollama_model")(event.target.value)} />
                    </Field>
                  </>
                )}
                <div className="probe">
                  <button type="button" className="tbtn" onClick={onProbe} disabled={probe.busy}>
                    {probe.busy ? <Spinner size={12} /> : null}试译一句
                  </button>
                  {!ready && !probe.text && <span className="muted">还没填全。不填也能用术语表译。</span>}
                  {probe.text && <span className={probe.ok ? "ok" : "bad"}>{probe.text}</span>}
                </div>
                <Check checked={params.glossary} title="勾上后，这张图会先查术语表" onChange={(value) => onParam("glossary", value)} hint="术语表里有的词直接用，不联网">先查术语表</Check>
              </div>

              <details className="card adv">
                <summary>高级翻译设置</summary>
                <p className="help">图上的字默认全译。一般不用改。改了以后回到图纸会重新读一遍。</p>
                <div className="check-grid">
                  <div>
                    <h4>先别译</h4>
                    <Check checked={filters.numbers} title="尺寸数字、纯符号，一般不用译" onChange={(value) => onFilter("numbers", value)}>数字、尺寸先别译</Check>
                    <Check checked={filters.dupes} title="同一句在图上出现多次，只译一次" onChange={(value) => onFilter("dupes", value)}>重复的句子先别译</Check>
                    <Check checked={filters.nonsource} title="已经是目标语言或夹杂别的文字，先跳过" onChange={(value) => onFilter("nonsource", value)}>已经是外文的先别译</Check>
                    <Check checked={params.filename} onChange={(value) => onParam("filename", value)}>文件名也译</Check>
                  </div>
                  <div>
                    <h4>读哪些字</h4>
                    <Check checked={params.attribs} onChange={(value) => onParam("attribs", value)}>块属性</Check>
                    <Check checked={params.blocks} onChange={(value) => onParam("blocks", value)}>块里的字</Check>
                    <Check checked={params.dims} onChange={(value) => onParam("dims", value)}>标注、表格</Check>
                    <Check checked={params.model} onChange={(value) => onParam("model", value)}>模型空间</Check>
                    <Check checked={params.paper} onChange={(value) => onParam("paper", value)}>图纸空间</Check>
                  </div>
                  <div>
                    <h4>图层</h4>
                    <Check checked={params.frozen} onChange={(value) => onParam("frozen", value)}>冻住看不见的图层</Check>
                    <Check checked={params.locked} onChange={(value) => onParam("locked", value)}>锁住改不了的图层</Check>
                    <Check checked={params.off} onChange={(value) => onParam("off", value)}>关掉藏起来的图层</Check>
                  </div>
                </div>
              </details>
            </>
          )}

          {tab === "wr" && (
            <>
              <h1>图上怎么写</h1>
              <p className="help">译完的新文件里，图上留什么字。原图不会被改。</p>
              <div className="card">
                <Field label="图纸上">
                  <Seg label="图纸上怎么写" value={layout} options={LAYOUTS} onChange={onLayout} />
                </Field>
                <Field label="导出到" hint="没选的话，文件进下载文件夹。">
                  <span className="path">
                    <span className="path-text" title={asText(config.output_dir)}>{asText(config.output_dir) ? shortPath(config.output_dir, 3) : "下载文件夹"}</span>
                    <button type="button" className="tbtn sm" onClick={onPickOutputDir}><FolderOpen size={12} aria-hidden="true" />选取文件夹</button>
                  </span>
                </Field>
                <Check checked={params.tree} title="输出目录按原来的文件夹一层层放" onChange={(value) => onParam("tree", value)}>按原来的文件夹放（一起译时）</Check>
                <Check checked={params.odaDxf} title="没有 ODA 时，写不出 DWG 就改成 DXF" onChange={(value) => onParam("odaDxf", value)}>打不开 DWG 时改存成 DXF</Check>
              </div>
              <h2>导出 PDF</h2>
              <div className="card">
                <Field label="看起来">
                  <Seg label="PDF 看起来" value={appearance} options={APPEARANCES} onChange={onAppearance} />
                </Field>
                <Field label="纸张">
                  <Seg label="PDF 纸张" value={pdfPaper} options={PDF_PAPERS} onChange={onPdfPaper} />
                </Field>
              </div>
              <div id="oda-setup">
                <Banner tone={oda.installed ? "ok" : "warn"}>
                  {oda.installed
                    ? "已装 ODA，DWG 能直接开、直接存。"
                    : <>没装 ODA，DWG 打不开。DXF 不受影响。去 <b>opendesign.com</b> 下载免费的 ODA File Converter，装好后重开图译。</>}
                </Banner>
              </div>
            </>
          )}

          {tab === "more" && (
            <>
              <h1>外观和更新</h1>
              <div className="card">
                <Field label="窗口颜色">
                  <Seg label="窗口颜色" value={themePref} options={THEMES} onChange={onTheme} />
                </Field>
              </div>
              <h2>版本</h2>
              <div className="card">
                <p className="help">图译 {appVersion || updateInfo?.current || "—"} · ODA {oda.installed ? "已安装" : "未装"}</p>
                {updateMsg && <p className="help">{updateMsg}</p>}
                <div className="btn-row">
                  <button type="button" className="tbtn" onClick={onCheckUpdates} disabled={updating || checking}>
                    {checking ? <Spinner size={12} /> : null}{updateInfo?.available ? `更新到 ${updateInfo.latest}` : "检查更新"}
                  </button>
                  <button type="button" className="tbtn ghost" onClick={onOpenGlossary}>打开术语管理</button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
