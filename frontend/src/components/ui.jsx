import { useCallback, useRef, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useOutsideClose } from "../lib/hooks";

export function Choice({ on, onClick, children, title, disabled }) {
  return (
    <button type="button" className={`choice${on ? " on" : ""}`} aria-pressed={on} title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([id, text, hint]) => (
        <button
          type="button"
          role="radio"
          key={id}
          title={hint}
          aria-checked={value === id}
          className={value === id ? "on" : ""}
          onClick={() => onChange(id)}
        >{text}</button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children, title, hint }) {
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span className="check-text">
        {children}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-body">
        {children}
        {hint && <small>{hint}</small>}
      </span>
    </div>
  );
}

export function Spinner({ size = 14 }) {
  return <LoaderCircle className="spinner" size={size} strokeWidth={2} aria-hidden="true" />;
}

const TONE_ICON = { ok: CircleCheck, warn: TriangleAlert, error: CircleAlert, info: Info, busy: null };

export function Banner({ tone = "info", children, actions, onClose }) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
      <span className="banner-icon">{tone === "busy" ? <Spinner /> : Icon ? <Icon size={16} strokeWidth={2} aria-hidden="true" /> : null}</span>
      <div className="banner-text">{children}</div>
      {actions && <div className="banner-actions">{actions}</div>}
      {onClose && (
        <button type="button" className="icon-btn" aria-label="关掉提示" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// Small popover menu anchored to a trigger button.
export function Menu({ label, icon, children, align = "end", up = false, className = "tbtn", disabled, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(open, ref, close);
  return (
    <span className="menu-anchor" ref={ref}>
      <button
        type="button"
        className={`${className}${open ? " on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        {label}
        <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className="caret" />
      </button>
      {open && (
        <div className={`menu menu-${align}${up ? " menu-up" : ""}`} role="menu" onClick={(event) => {
          if (event.target.closest("[data-close]")) close();
        }}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </span>
  );
}

export function MenuItem({ onClick, children, disabled, hint, danger }) {
  return (
    <button type="button" role="menuitem" data-close className={`menu-item${danger ? " danger" : ""}`} disabled={disabled} onClick={onClick}>
      <span>{children}</span>
      {hint && <small>{hint}</small>}
    </button>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}
