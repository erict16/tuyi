import { CircleAlert, CircleCheck, Plus, X } from "lucide-react";
import { modKey } from "../lib/native";
import { Kbd, Spinner } from "./ui";

const FILE_STATUS = {
  extracting: ["正在读", "run"],
  translating: ["正在译", "run"],
  writing: ["正在写", "run"],
  written: ["已写出", "ok"],
  skip: ["不用译", "idle"],
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
  translating,
  runAll,
  canTranslate,
  onAdd,
  onPick,
  onRemove,
  onTranslate,
  onStop,
}) {
  const mod = modKey();
  return (
    <aside className="rail" aria-label="图纸队列">
      <div className="rail-head">
        <span className="rail-title">图纸{files.length ? <b>{files.length}</b> : null}</span>
        <button type="button" className="tbtn add-mini" onClick={onAdd} aria-label="添加图纸" title={`添加图纸（${mod}+O）`}>
          <Plus size={14} strokeWidth={2} aria-hidden="true" />添加
        </button>
      </div>
      {files.length === 0 ? (
        // One drop target only: the big card in the middle. The rail just says what goes here.
        <p className="queue-empty">打开的图纸排在这里</p>
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
                  // Keys on the inner 去掉 button belong to that button.
                  if (event.target !== event.currentTarget) return;
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
        {runAll && (
          <p className="run-all" aria-live="polite">
            正在译第 {runAll.index} / {runAll.total} 张
            <span className="bar"><i style={{ width: `${Math.round(((runAll.index - 1) * 100) / runAll.total)}%` }} /></span>
          </p>
        )}
        {runAll ? (
          <button type="button" className="go secondary" onClick={onStop}>停止</button>
        ) : (
          <button
            type="button"
            className={`go${translating ? " busy" : ""}`}
            disabled={!canTranslate}
            onClick={onTranslate}
            title={`${files.length > 1 ? "把左边每张图纸都译好、各写出一个新文件" : "翻译这张图纸，写出新文件"}（${mod}+Enter）`}
          >
            <i className="spin" aria-hidden="true" />
            <span className="go-label">{translating ? "正在译…" : files.length > 1 ? `翻译全部 ${files.length} 张` : "快速翻译"}</span>
            {!translating && <Kbd>{mod}↵</Kbd>}
          </button>
        )}
      </div>
    </aside>
  );
}
