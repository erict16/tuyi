import { useMemo, useState } from "react";
import { ArrowLeft, Download, Plus, Search, Trash2, Upload } from "lucide-react";
import { asText, matchTerm, termKey } from "../lib/core";

const BUILTIN_LIMIT = 300;

function TermInput({ value, label, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? asText(value);
  return (
    <input
      type="text"
      value={shown}
      aria-label={label}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (draft != null && draft.trim() && draft !== asText(value)) onCommit(draft.trim());
        setDraft(null);
      }}
    />
  );
}

export default function GlossaryView({ terms, builtinTerms, onBack, onAdd, onSave, onDelete, onDeleteMany, onImport, onExport }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ source: "", target: "" });
  const [picked, setPicked] = useState(() => new Set());
  const [showBuiltin, setShowBuiltin] = useState(false);

  const mine = useMemo(() => terms.filter((term) => matchTerm(term, query)), [terms, query]);
  const builtin = useMemo(() => builtinTerms.filter((term) => matchTerm(term, query)), [builtinTerms, query]);
  const mineKeys = mine.map(termKey);
  const pickedCount = mineKeys.filter((key) => picked.has(key)).length;
  const builtinOpen = showBuiltin || Boolean(query.trim());
  const canAdd = draft.source.trim() && draft.target.trim();

  async function add(event) {
    event.preventDefault();
    if (!canAdd) return;
    const ok = await onAdd({ source: draft.source.trim(), target: draft.target.trim() });
    if (ok !== false) setDraft({ source: "", target: "" });
  }

  return (
    <div className="body page-enter">
      <section className="page gloss" aria-label="术语管理">
        <div className="page-head">
          <button type="button" className="back" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />返回</button>
          <div className="page-title">
            <h1>术语管理</h1>
            <p>图上碰到左边这句，就写成右边。你加的优先于软件自带的，不联网也能用。</p>
          </div>
          <div className="page-actions">
            <button type="button" className="tbtn ghost" onClick={onImport} aria-label="加载术语表"><Upload size={13} aria-hidden="true" />从表格导入</button>
            <button type="button" className="tbtn ghost" onClick={onExport} aria-label="导出术语" disabled={!terms.length}><Download size={13} aria-hidden="true" />导出成表格</button>
          </div>
        </div>

        <form className="term-add card" onSubmit={add}>
          <input value={draft.source} placeholder="图上的中文，比如：进线柜" aria-label="新术语原文" onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))} />
          <span className="arrow" aria-hidden="true">→</span>
          <input value={draft.target} placeholder="要写成，比如：Incoming cabinet" aria-label="新术语译文" onChange={(event) => setDraft((prev) => ({ ...prev, target: event.target.value }))} />
          <button type="submit" className="tbtn pri" disabled={!canAdd}><Plus size={13} aria-hidden="true" />加上</button>
        </form>

        <div className="tools">
          <label className="search">
            <Search size={14} strokeWidth={1.8} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜一下…" aria-label="搜译法" />
          </label>
          <span className="muted">我加的 {terms.length} · 软件自带 {builtinTerms.length}</span>
          <span className="grow" />
          <button
            type="button"
            className="tbtn danger"
            disabled={!pickedCount}
            onClick={async () => {
              await onDeleteMany(terms.filter((term) => picked.has(termKey(term))));
              setPicked(new Set());
            }}
          ><Trash2 size={13} aria-hidden="true" />删掉选中的{pickedCount ? ` ${pickedCount}` : ""}</button>
        </div>

        <div className="table-wrap">
          <table>
            <colgroup>
              <col style={{ width: 40 }} />
              <col />
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 64 }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={mine.length > 0 && pickedCount === mine.length}
                    disabled={!mine.length}
                    onChange={(event) => setPicked(event.target.checked ? new Set(mineKeys) : new Set())}
                    aria-label="全选术语管理"
                  />
                </th>
                <th>图上的中文</th>
                <th>要写成</th>
                <th>谁定的</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mine.length === 0 && (
                <tr><td colSpan={5} className="empty-row">{query.trim() ? "我加的里面没有这句。" : "还没有自己定的译法。上面填一行再点加上。"}</td></tr>
              )}
              {mine.map((term) => {
                const key = termKey(term);
                return (
                  <tr key={key} className="row-enter">
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.has(key)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(key);
                            else next.delete(key);
                            return next;
                          });
                        }}
                        aria-label={`选中 ${asText(term.source)}`}
                      />
                    </td>
                    <td><TermInput value={term.source} label="术语原文" onCommit={(value) => onSave({ ...term, source: value })} /></td>
                    <td><TermInput value={term.target} label="术语译文" onCommit={(value) => onSave({ ...term, target: value })} /></td>
                    <td><span className="tag tag-mine">我加的</span></td>
                    <td><button type="button" className="tbtn sm ghost" onClick={() => onDelete(term)} aria-label={`删掉 ${asText(term.source)}`}>删掉</button></td>
                  </tr>
                );
              })}
              <tr className="group-row">
                <td colSpan={5}>
                  <button type="button" className="linkish" aria-expanded={builtinOpen} onClick={() => setShowBuiltin((on) => !on)} disabled={Boolean(query.trim())}>
                    {builtinOpen ? "▾" : "▸"} 软件自带 {query.trim() ? `（找到 ${builtin.length} 条）` : `${builtinTerms.length} 条，改不了`}
                  </button>
                </td>
              </tr>
              {builtinOpen && builtin.slice(0, BUILTIN_LIMIT).map((term) => (
                <tr key={termKey(term)} className="locked">
                  <td />
                  <td><span className="cell-text">{asText(term.source)}</span></td>
                  <td><span className="cell-text">{asText(term.target)}</span></td>
                  <td><span className="tag">软件自带</span></td>
                  <td />
                </tr>
              ))}
              {builtinOpen && builtin.length > BUILTIN_LIMIT && (
                <tr><td colSpan={5} className="empty-row">还有 {builtin.length - BUILTIN_LIMIT} 条没列出，搜一下就能找到。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
