import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Spinner } from "./ui";

const ICONS = { ok: CircleCheck, warn: TriangleAlert, error: CircleAlert, info: Info };

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone] || Info;
        return (
          <div key={toast.id} className={`toast toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
            {toast.tone === "busy" ? <Spinner /> : <Icon size={15} strokeWidth={2} aria-hidden="true" />}
            <span className="toast-text">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="tbtn sm"
                onClick={() => {
                  toast.action.onClick();
                  onDismiss(toast.id);
                }}
              >{toast.action.label}</button>
            )}
            {toast.tone !== "busy" && (
              <button type="button" className="icon-btn" aria-label="关掉" onClick={() => onDismiss(toast.id)}><X size={13} aria-hidden="true" /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}
