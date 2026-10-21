import { CircleAlert, CircleCheck, Files, Plus, X } from "lucide-react";
import { modKey } from "../lib/native";
import { Kbd, Spinner } from "./ui";

const FILE_STATUS = {
  extracting: ["正在读", "run"],
  translating: ["正在译", "run"],
  writing: ["正在写", "run"],
  written: ["已写出", "ok"],
  error: ["出错了", "bad"],
};

function FileStatus({ state, active }) {
  const [label, tone] = FILE_STATUS[state?.status] || [active ? "当前" : "待译", active ? "cur" : "idle"];
  return (
    <span className={`st st-${tone}`}>
      {tone === "run" && <Spinner size={11} />}
      {tone === "ok" && <CircleCheck size={11} strokeWidth={2.4} aria-hidden="true" />}
      {tone === "bad" && <CircleAlert size={11} strokeWidth={2.4} aria-hidden="true" />}
      {label}
    </span>
  );
}

export default function Rail({
  files,
  current,
  fileState,
  locked,
  view,
  translating,
  canTranslate,
  onAdd,
  onPick,
  onRemove,
  onTranslate,
  onToggleBatch,
}) {
  const mod = modKey();
  return (
    <aside className="rail" aria-label="图纸队列">
      <div className="rail-head">
        <span className="rail-title">图纸{files.length ? <b>{files.length}</b> : null}</span>
        {files.length > 0 && (
          <button type="button" className="tbtn add-mini" onClick={onAdd} title={`添加图纸（${mod}+O）`}>
            <Plus size={14} strokeWidth={2} aria-hidden="true" />添加
          </button>
        )}
      </div>
      {files.length === 0 ? (
        <button type="button" className="drop" onClick={onAdd}>
          <span className="plus" aria-hidden="true"><Plus size={18} strokeWidth={2} /></span>
          <h2>添加图纸</h2>
          <p className="long">DWG、DXF，一次可多张</p>
          <p className="long">打开的图纸排在这里</p>
        </button>
      ) : (
        <ul className="queue" role="listbox" aria-label="打开的图纸">
          {files.map((file) => {
            const active = file.path === current;
            return (
              <li
                key={file.path}
                role="option"
                aria-selected={active}
                tabIndex={0}
                className={`file${active ? " on" : ""}${locked && !active ? " locked" : ""}`}
                title={file.path}
                onClick={() => onPick(file.path)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPick(file.path);
                  }
                  if (event.key === "Delete" || event.key === "Backspace") onRemove(file.path);
                }}
              >
                <span className={`ext ext-${file.ext.toLowerCase()}`}>{file.ext}</span>
                <span className="name">{file.name}</span>
                <FileStatus state={fileState[file.path]} active={active} />
                <button
                  type="button"
                  className="del"
                  aria-label={`从队列去掉 ${file.name}`}
                  title="去掉"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(file.path);
                  }}
                ><X size={13} strokeWidth={2} aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rail-go">
        {files.length > 1 && (
          <button
            type="button"
            className={`tbtn wide${view === "batch" ? " on" : ""}`}
            onClick={onToggleBatch}
            aria-pressed={view === "batch"}
          >
            <Files size={14} strokeWidth={1.8} aria-hidden="true" />
            {view === "batch" ? "回到单张" : `一起译 ${files.length} 张`}
          </button>
        )}
        {onTranslate && <button
          type="button"
          className={`go${translating ? " busy" : ""}`}
          disabled={!canTranslate}
          onClick={onTranslate}
          title={`快速翻译当前图纸（${mod}+Enter）`}
        >
          <i className="spin" aria-hidden="true" />
          <span className="go-label">{translating ? "正在译…" : "快速翻译"}</span>
          {!translating && <Kbd>{mod}↵</Kbd>}
        </button>}
      </div>
    </aside>
  );
}
