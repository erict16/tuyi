import { useRef } from "react";
import { ListFilter, Plus, Save, Search, Table2, X } from "lucide-react";
import { asText, fileName, viaLabel } from "../lib/core";
import { modKey } from "../lib/native";
import { Banner, Check, Menu, MenuItem } from "./ui";

export function Notice({ notice, onClose }) {
  if (!notice?.text) return null;
  return (
    <Banner
      tone={notice.tone}
      onClose={notice.tone === "busy" ? null : onClose}
      actions={notice.actions?.length ? notice.actions.map((action) => (
        <button key={action.label} type="button" className={`tbtn${action.primary ? " pri" : ""}`} onClick={action.onClick}>{action.label}</button>
      )) : null}
    >
      <span>{notice.text}</span>
      {notice.path && <span className="banner-path" title={notice.path}>{fileName(notice.path)}</span>}
    </Banner>
  );
}

function EmptyStart({ onAdd, dropOver }) {
  return (
    <div className="empty start">
      <button type="button" className={`drop-hero${dropOver ? " over" : ""}`} onClick={onAdd}>
        <span className="plus" aria-hidden="true"><Plus size={26} strokeWidth={1.8} /></span>
        <strong>把 DWG / DXF 拖到这里</strong>
        <span>或点这里选图纸，一次可以多张（{modKey()}+O）</span>
      </button>
      <ol className="empty-steps">
        <li><b>1</b>添加图纸</li>
        <li><b>2</b>点「快速翻译」</li>
        <li><b>3</b>另存新文件，原图不动</li>
      </ol>
    </div>
  );
}

const FILTER_OPTIONS = [
  ["numbers", "数字、尺寸", "尺寸数字、纯符号，一般不用译"],
  ["dupes", "重复的句子", "同一句在图上出现多次，只译一次，每处都写回"],
  ["nonsource", "已经是外文的", "已经是目标语言或夹杂别的文字，先跳过"],
];

export default function WorkView({
  file,
  rows,
  visibleRows,
  stats,
  counts,
  filters,
  onFilter,
  query,
  onQuery,
  notice,
  onCloseNotice,
  loading,
  translating,
  locked,
  canWrite,
  dropOver,
  onAdd,
  onEditRow,
  onToggleRow,
  onToggleAll,
  onWriteBack,
  onExportTable,
  onImportTable,
}) {
  const tableRef = useRef(null);
  const hiddenFilters = FILTER_OPTIONS.filter(([key]) => filters[key]).length;

  if (!file) {
    return (
      <section className="stage" id="main">
        <Notice notice={notice} onClose={onCloseNotice} />
        <EmptyStart onAdd={onAdd} dropOver={dropOver} />
      </section>
    );
  }

  const allPicked = visibleRows.length > 0 && visibleRows.every((row) => row.selected !== false);
  const somePicked = visibleRows.some((row) => row.selected !== false);
  const percent = stats.shown ? Math.round((stats.done * 100) / stats.shown) : 0;

  function focusRow(index) {
    const next = tableRef.current?.querySelector(`input[data-row="${index}"]`);
    if (next) {
      next.focus();
      next.select();
    }
  }

  return (
    <section className="stage" id="main">
      <div className="work-head">
        <div className="work-title">
          <h1 title={file.path}>{file.name}</h1>
          <p className="work-meta">
            {loading ? "正在读图纸里的文字…" : (
              <>
                <span>这张图有 {stats.unique} 句</span>
                <span className="dot" aria-hidden="true" />
                <span>显示 {stats.shown}</span>
                <span className="dot" aria-hidden="true" />
                <span className={stats.done && stats.done === stats.shown ? "ok" : ""}>已有译文 {stats.done}</span>
                {stats.shown > 0 && <span className="meter" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>}
              </>
            )}
          </p>
        </div>
        <div className="work-tools">
          <label className="search">
            <Search size={14} strokeWidth={1.8} aria-hidden="true" />
            <input type="search" value={query} placeholder="找一句…" aria-label="在图纸文字里找" onChange={(event) => onQuery(event.target.value)} />
            {query && (
              <button type="button" className="icon-btn" aria-label="清空搜索" onClick={() => onQuery("")}><X size={12} aria-hidden="true" /></button>
            )}
          </label>
          <Menu
            label={hiddenFilters ? `先别译 ${hiddenFilters}` : "先别译"}
            icon={<ListFilter size={14} strokeWidth={1.8} aria-hidden="true" />}
            title="哪些文字先不显示、不翻译"
          >
            <div className="menu-pad">
              <p className="menu-title">这些先别译</p>
              {FILTER_OPTIONS.map(([key, label, hint]) => (
                <Check key={key} checked={filters[key]} hint={hint} onChange={(value) => onFilter(key, value)}>{label}</Check>
              ))}
            </div>
          </Menu>
          <Menu label="表格" icon={<Table2 size={14} strokeWidth={1.8} aria-hidden="true" />} disabled={locked} title="导出给别人改，改好再导回来">
            <MenuItem onClick={() => onExportTable("xlsx")} hint="给同事改译文">导出 Excel</MenuItem>
            <MenuItem onClick={() => onExportTable("csv")}>导出表格</MenuItem>
            <MenuItem onClick={onImportTable} hint="填回译文">导入表格</MenuItem>
          </Menu>
          <button
            type="button"
            className="tbtn"
            disabled={locked || !canWrite}
            onClick={onWriteBack}
            title={`改过译文后重新写出新文件（${modKey()}+S）`}
          >
            <Save size={14} strokeWidth={1.8} aria-hidden="true" />写出新文件
          </button>
        </div>
      </div>

      <Notice notice={notice} onClose={onCloseNotice} />

      <div className={`table${translating ? " busy" : ""}${loading ? " loading" : ""}`} aria-busy={translating || loading} ref={tableRef}>
        <table>
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allPicked}
                  ref={(node) => { if (node) node.indeterminate = somePicked && !allPicked; }}
                  disabled={!visibleRows.length || locked}
                  onChange={(event) => onToggleAll(event.target.checked)}
                  aria-label="全选"
                />
              </th>
              <th>原文</th>
              <th>译文</th>
              <th>图层 · 类型</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              Array.from({ length: 6 }, (_, index) => (
                <tr key={`sk-${index}`} className="skeleton" aria-hidden="true">
                  <td /><td><i /></td><td><i /></td><td><i /></td>
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-row">
                  {query ? `没有找到「${query}」。` : rows.length ? "过滤后没有可显示的文字。" : "这张图没有可译文字。"}
                </td>
              </tr>
            ) : visibleRows.map((row, index) => {
              const repeats = filters.dupes ? counts.get(asText(row.source)) || 1 : 1;
              const via = viaLabel(row.via);
              const off = row.selected === false;
              return (
                <tr key={row.id} className={`${off ? "off" : ""}${row.duplicate ? " dup" : ""}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!off}
                      disabled={locked}
                      onChange={(event) => onToggleRow(row.id, event.target.checked)}
                      aria-label={`翻译这一句：${asText(row.source)}`}
                    />
                  </td>
                  <td className="src">
                    <span className="src-text">{asText(row.source)}</span>
                    {repeats > 1 && <span className="tag" title={`图上出现 ${repeats} 次，只译一次，每处都写回`}>×{repeats}</span>}
                  </td>
                  <td className="dst">
                    <input
                      type="text"
                      data-row={index}
                      value={asText(row.target)}
                      placeholder={translating && !off && !asText(row.target) ? "正在译…" : off ? "" : "点快速翻译，或直接填"}
                      readOnly={locked}
                      spellCheck={false}
                      onChange={(event) => onEditRow(row.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "ArrowDown") {
                          event.preventDefault();
                          focusRow(index + 1);
                        }
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          focusRow(index - 1);
                        }
                      }}
                      aria-label="译文"
                    />
                    {via && <span className={`via via-${row.via}`}>{via}</span>}
                  </td>
                  <td className="kind" title={`${asText(row.layer) || "0"} · ${asText(row.type)}`}>
                    <span>{asText(row.layer) || "0"}</span>
                    <span className="kind-type">{asText(row.type)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
