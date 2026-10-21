import { useCallback, useRef, useState } from "react";
import { ArrowLeftRight, BookOpen, Printer, Settings, Share } from "lucide-react";
import { APPEARANCES, LANGS, PDF_PAPERS } from "../lib/constants";
import { langShort } from "../lib/core";
import { useOutsideClose } from "../lib/hooks";
import { Menu, Seg } from "./ui";

function LangPicker({ sourceLang, targetLang, onSource, onTarget, onSwap, onDetect, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(open, ref, close);
  return (
    <span className="lang-anchor" ref={ref}>
      <button
        type="button"
        className={`lang-mini${open ? " on" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="原文和译文是什么语言"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {langShort(sourceLang)} <ArrowLeftRight size={11} strokeWidth={2} aria-hidden="true" /> {langShort(targetLang)}
      </button>
      {open && (
        <div className="lang-pop" role="dialog" aria-label="选择语言">
          <div className="chip-row" role="group" aria-label="原文">
            <span>
              原文
              <button type="button" className="detect" onClick={onDetect}>检测</button>
            </span>
            {LANGS.map(([code, label]) => (
              <button
                key={`src-${code}`}
                type="button"
                className={sourceLang === code ? "on" : ""}
                aria-pressed={sourceLang === code}
                disabled={code === targetLang}
                onClick={() => onSource(code)}
              >{label}</button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label="译文">
            <span>译文</span>
            {LANGS.map(([code, label]) => (
              <button
                key={`dst-${code}`}
                type="button"
                className={targetLang === code ? "on" : ""}
                aria-pressed={targetLang === code}
                disabled={code === sourceLang}
                onClick={() => onTarget(code)}
              >{label}</button>
            ))}
          </div>
          <button type="button" className="pop-swap" onClick={onSwap}>⇄ 对调</button>
        </div>
      )}
    </span>
  );
}

export default function Footer({
  oda,
  onOdaHelp,
  lang,
  view,
  canPdf,
  pdf,
  onExportPdf,
  onOpenGlossary,
  onOpenSettings,
  appVersion,
  footBusy,
  updateAvailable,
  updating,
  onOpenUpdate,
}) {
  return (
    <footer className={footBusy ? "foot slim checking" : "foot slim"}>
      {oda.installed ? (
        <span className="live" title={oda.path || ""}>ODA 已安装</span>
      ) : (
        <button type="button" className="live missing" onClick={onOdaHelp} title="DWG 要装 ODA File Converter，DXF 不用">没装 ODA · 点这里</button>
      )}
      <span className="sep" aria-hidden="true" />
      <LangPicker {...lang} />
      <span className="grow" />
      <Menu
        label="导出 PDF"
        className="tbtn ico"
        up
        icon={<Share size={14} strokeWidth={1.5} aria-hidden="true" />}
        disabled={!canPdf}
        title="把当前图纸出成 PDF"
      >
        <div className="menu-pad pdf-pop">
          <p className="menu-title">PDF 看起来</p>
          <Seg label="PDF 看起来" value={pdf.appearance} options={APPEARANCES} onChange={pdf.onAppearance} />
          <p className="menu-title">纸张</p>
          <Seg label="PDF 纸张" value={pdf.paper} options={PDF_PAPERS} onChange={pdf.onPaper} />
          <p className="note">{pdf.fromWriteback ? "出的是写好译文的新图纸。" : "还没写出新文件，出的是原图。"}</p>
          <div className="btn-row">
            <button type="button" className="tbtn pri" data-close onClick={() => onExportPdf(false)}>导出 PDF</button>
            <button type="button" className="tbtn" data-close onClick={() => onExportPdf(true)}><Printer size={13} aria-hidden="true" />打印</button>
          </div>
        </div>
      </Menu>
      <button type="button" className={`tbtn ico${view === "glossary" ? " on" : ""}`} onClick={onOpenGlossary}>
        <BookOpen size={14} strokeWidth={1.5} aria-hidden="true" />术语管理
      </button>
      <button type="button" className={`tbtn ico${view === "settings" ? " on" : ""}`} onClick={onOpenSettings}>
        <Settings size={14} strokeWidth={1.5} aria-hidden="true" />设置
      </button>
      <span className="sep" aria-hidden="true" />
      <span className="ver">{appVersion ? `v${appVersion}` : ""}</span>
      <span className="end">
        <span className="spin" aria-hidden="true" />
        {updateAvailable && view !== "update" && (
          <button type="button" className="tbtn badge" onClick={onOpenUpdate} disabled={updating}>有新版本</button>
        )}
      </span>
    </footer>
  );
}
