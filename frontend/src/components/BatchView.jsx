import { FolderOpen, Pause, Play, RotateCcw, Square, Trash2, X } from "lucide-react";
import { LAYOUTS } from "../lib/constants";
import { batchSummary, fileName, shortPath, taskStatus } from "../lib/core";
import { Notice } from "./WorkView";
import { Check, Choice } from "./ui";

function JobRow({ name, progress, status, message, output, actions }) {
  const [label, tone] = taskStatus(status);
  return (
    <li className={`job job-${tone}`}>
      <span className="job-name" title={name}>{fileName(name)}</span>
      <span className="bar" aria-label={`进度 ${progress || 0}%`}><i style={{ width: `${progress || 0}%` }} /></span>
      <span className={`chip chip-${tone}`} title={message || label}>{label}</span>
      <span className="job-actions">
        {output && (
          <button type="button" className="icon-btn" title="在文件夹中显示" aria-label="在文件夹中显示" onClick={() => actions.reveal(output)}>
            <FolderOpen size={14} aria-hidden="true" />
          </button>
        )}
        {actions.retry && (
          <button type="button" className="tbtn sm" onClick={actions.retry}><RotateCcw size={12} aria-hidden="true" />重试</button>
        )}
        {actions.remove && (
          <button type="button" className="icon-btn" title="去掉" aria-label={`去掉 ${fileName(name)}`} onClick={actions.remove}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </span>
      {tone === "bad" && message && <span className="job-msg">{message}</span>}
    </li>
  );
}

export default function BatchView({
  files,
  batch,
  layout,
  onLayout,
  outputDir,
  onPickOutputDir,
  params,
  onParam,
  filters,
  onFilter,
  notice,
  onCloseNotice,
  busy,
  tableName,
  onStart,
  onPause,
  onStop,
  onClear,
  onRetry,
  onRemoveTask,
  onImportTable,
  onWriteBackAll,
  onReveal,
}) {
  const tasks = Array.isArray(batch.tasks) ? batch.tasks : [];
  const sum = batchSummary(tasks);
  const running = batch.started && !batch.paused;
  const finished = sum.total > 0 && !batch.started && sum.done === sum.total;

  return (
    <section className="stage" id="main">
      <div className="work-head">
        <div className="work-title">
          <h1>一起译 {files.length} 张</h1>
          <p className="work-meta">
            {sum.total ? (
              <>
                <span className="ok">已写出 {sum.done}</span>
                {sum.failed > 0 && (<><span className="dot" aria-hidden="true" /><span className="bad">没译成 {sum.failed}</span></>)}
                <span className="dot" aria-hidden="true" />
                <span>共 {sum.total}</span>
                <span className="meter" aria-hidden="true"><i style={{ width: `${batch.progress || 0}%` }} /></span>
              </>
            ) : "用同一套设置，把左边的图纸一张张译完、写出新文件。"}
          </p>
        </div>
        <div className="work-tools">
          {sum.total > 0 && !batch.started && (
            <button type="button" className="tbtn ghost" onClick={onClear}><Trash2 size={13} aria-hidden="true" />清空列表</button>
          )}
          {batch.started && (
            <button type="button" className="tbtn ghost" onClick={onStop}><Square size={12} aria-hidden="true" />停止</button>
          )}
          {running ? (
            <button type="button" className="tbtn" onClick={() => onPause(true)}><Pause size={13} aria-hidden="true" />暂停</button>
          ) : (
            <button type="button" className="go inline" disabled={!files.length || busy} onClick={() => (batch.started ? onPause(false) : onStart())}>
              <Play size={13} aria-hidden="true" />
              <span className="go-label">{batch.started ? "继续" : finished ? "再译一遍" : "快速翻译这几张"}</span>
            </button>
          )}
        </div>
      </div>

      <Notice notice={notice} onClose={onCloseNotice} />

      <div className="batch-body">
        <ul className="jobs" aria-label="批量任务">
          {tasks.length === 0 && files.map((file) => (
            <JobRow key={file.path} name={file.name} progress={0} status="queued" actions={{}} />
          ))}
          {tasks.map((task) => {
            const retryable = task.status === "failed" || task.status === "cancelled";
            return (
              <JobRow
                key={task.id}
                name={task.input_file || ""}
                progress={task.progress}
                status={task.status}
                message={task.message}
                output={task.status === "succeeded" ? task.output_file : ""}
                actions={{
                  reveal: onReveal,
                  retry: retryable ? () => onRetry(task.id) : null,
                  remove: task.status !== "running" && !running ? () => onRemoveTask(task.id) : null,
                }}
              />
            );
          })}
        </ul>

        <aside className="insp" aria-label="一起译的设置">
          <section>
            <h3>图纸上怎么写</h3>
            <div className="choices">
              {LAYOUTS.map(([value, label, title]) => (
                <Choice key={value} on={layout === value} title={title} onClick={() => onLayout(value)}>{label}</Choice>
              ))}
            </div>
          </section>
          <section>
            <h3>放到哪里</h3>
            <div className="path">
              <span className="path-text" title={outputDir}>{outputDir ? shortPath(outputDir, 3) : "下载文件夹"}</span>
              <button type="button" className="tbtn sm" onClick={onPickOutputDir}>选取</button>
            </div>
            <Check checked={params.tree} title="输出目录按原来的文件夹一层层放" onChange={(value) => onParam("tree", value)}>按原来的文件夹放</Check>
            <Check checked={params.odaDxf} title="没有 ODA 时，写不出 DWG 就改成 DXF" onChange={(value) => onParam("odaDxf", value)}>打不开 DWG 时改存成 DXF</Check>
          </section>
          <section>
            <h3>先别译</h3>
            <Check checked={filters.numbers} title="尺寸数字、纯符号，一般不用译" onChange={(value) => onFilter("numbers", value)}>数字、尺寸</Check>
            <Check checked={filters.nonsource} title="已经是目标语言或夹杂别的文字，先跳过" onChange={(value) => onFilter("nonsource", value)}>不是原文那种语言</Check>
            <p className="note">重复的句子只译一次，图上每一处都会写。</p>
          </section>
          <section>
            <h3>用表格回填</h3>
            <p className="note">同事改好的表格（CSV 或 Excel）导进来，按表里的文件名写回每张图。</p>
            <div className="btn-row">
              <button type="button" className="tbtn" disabled={busy} onClick={onImportTable}>导入表格</button>
              <button type="button" className="tbtn" disabled={busy || !files.length} onClick={onWriteBackAll}>全部写回</button>
            </div>
            {tableName && <p className="note">已导入：{tableName}</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
