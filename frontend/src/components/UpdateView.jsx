import { ArrowLeft, Sparkles } from "lucide-react";

export default function UpdateView({
  updateInfo,
  updateMsg,
  updating,
  updatePercent,
  checking,
  appVersion,
  onBack,
  onCancel,
  onApply,
  onCheck,
  onOpenRelease,
}) {
  const available = Boolean(updateInfo?.available);
  return (
    <div className="body page-enter">
      <section className="page upd" aria-label="检查更新">
        <div className="page-head">
          {updating ? (
            <button type="button" className="back" onClick={onCancel}><ArrowLeft size={14} aria-hidden="true" />取消这次</button>
          ) : (
            <button type="button" className="back" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />{available ? "以后再说" : "返回"}</button>
          )}
        </div>
        <div className="card upd-card">
          <span className="upd-icon" aria-hidden="true"><Sparkles size={22} strokeWidth={1.6} /></span>
          <h1>{updating ? "正在更新" : (available ? "有新版本" : "检查更新")}</h1>
          <p>
            {updating
              ? (updateMsg || "正在下载更新…")
              : (available
                ? `现在是 ${updateInfo.current || appVersion}，可以换成 ${updateInfo.latest}。`
                : (updateMsg || "点下面检查。"))}
          </p>
          {updating && (
            <div className="upd-bar" aria-label="下载进度">
              <span className="bar"><i style={{ width: `${updatePercent}%` }} /></span>
              <span>{updatePercent}%</span>
            </div>
          )}
          {available && !updating && updateInfo.notes && <pre className="notes">{updateInfo.notes}</pre>}
          <div className="upd-actions">
            {available && !updating && (
              <>
                {updateInfo.can_apply ? (
                  <button type="button" className="go inline" onClick={onApply}>
                    <span className="go-label">现在更新并重启</span>
                  </button>
                ) : (
                  <p className="note">这个版本得下安装包。点下面会用系统浏览器打开 GitHub，不会新开图译窗口。</p>
                )}
                <button type="button" className="tbtn ghost" onClick={onOpenRelease}>打开 GitHub 发布页</button>
              </>
            )}
            {!available && !updating && (
              <button type="button" className="go inline" onClick={onCheck} disabled={checking}>
                <i className="spin" aria-hidden="true" />
                <span className="go-label">{checking ? "正在查…" : "再检查一次"}</span>
              </button>
            )}
            {updating && <button type="button" className="tbtn danger" onClick={onCancel}>取消这次</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
