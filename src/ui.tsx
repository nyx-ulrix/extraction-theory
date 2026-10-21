// Shared form primitives. Every view builds from these so the look stays one system.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { X } from "@phosphor-icons/react";
import { fmtTime, num, parseTime, type Num } from "./calc.ts";

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id?: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Number with an optional unit suffix. Empty input = null. */
export function NumField({ label, value, onChange, unit, step = "any", min, max, hint, placeholder }: {
  label: string; value: Num | undefined; onChange: (v: Num) => void; unit?: string;
  step?: number | "any"; min?: number; max?: number; hint?: string; placeholder?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value == null ? "" : String(value));
  // Follow outside changes (prefill, ratio solver) without fighting the user's typing.
  useEffect(() => {
    if (num(text) !== (value ?? null)) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label={label} hint={hint} id={id}>
      <div className={unit ? "unit" : undefined}>
        <input
          id={id} className="input num" type="number" inputMode="decimal" step={step} min={min} max={max}
          placeholder={placeholder} value={text}
          onChange={(e) => { setText(e.target.value); onChange(num(e.target.value)); }}
        />
        {unit && <span>{unit}</span>}
      </div>
    </Field>
  );
}

/** m:ss text input stored as seconds. */
export function TimeField({ label, value, onChange, hint }: { label: string; value: Num | undefined; onChange: (v: Num) => void; hint?: string }) {
  const id = useId();
  const [text, setText] = useState(fmtTime(value ?? null));
  useEffect(() => {
    if (parseTime(text) !== (value ?? null)) setText(fmtTime(value ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = text.trim() !== "" && parseTime(text) == null;
  return (
    <Field label={label} hint={hint ?? "m:ss"} error={bad ? "Use m:ss, for example 2:45" : undefined} id={id}>
      <input
        id={id} className="input num" inputMode="numeric" placeholder="0:00" value={text} aria-invalid={bad}
        onChange={(e) => { setText(e.target.value); const s = parseTime(e.target.value); if (s != null || !e.target.value.trim()) onChange(s); }}
      />
    </Field>
  );
}

export function TextField({ label, value, onChange, hint, placeholder, multiline, maxLength }: {
  label: string; value: string | undefined | null; onChange: (v: string) => void; hint?: string; placeholder?: string; multiline?: boolean; maxLength?: number;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} id={id}>
      {multiline ? (
        <textarea id={id} className="textarea" value={value ?? ""} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value ?? ""} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export type Opt = string | [value: string, label: string];
const optPair = (o: Opt): [string, string] => (Array.isArray(o) ? o : [o, o]);
export const OTHER = "__other__";

/**
 * Native select. With `other`, an "Other..." option either reveals a free-text box
 * (value not in the list is shown as typed) or, if `onOther` is given, calls it instead.
 */
export function SelectField({ label, value, options, onChange, placeholder = "Choose", other, onOther, hint }: {
  label: string; value: string | undefined | null; options: Opt[]; onChange: (v: string) => void;
  placeholder?: string; other?: boolean; onOther?: () => void; hint?: string;
}) {
  const id = useId();
  const pairs = options.map(optPair);
  const v = value ?? "";
  const known = v === "" || pairs.some(([p]) => p === v);
  // Derived each render so a custom value arriving later (prefill) still shows as typed text.
  const [typingState, setTyping] = useState(false);
  const typing = !!other && (typingState || !known);
  return (
    <Field label={label} hint={hint} id={id}>
      <select
        id={id} className="select" value={typing ? OTHER : v}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            if (onOther) return onOther();
            setTyping(true);
            onChange("");
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {pairs.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
        {!other && !known && <option value={v} disabled>{v}</option>}
        {other && <option value={OTHER}>Other...</option>}
      </select>
      {typing && (
        <input className="input" aria-label={`${label}, other`} placeholder="Type your own" value={v} onChange={(e) => onChange(e.target.value)} autoFocus />
      )}
    </Field>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, full }: {
  value: T; options: [T, string, Icon?][]; onChange: (v: T) => void; label: string; full?: boolean;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className={`seg${full ? " full" : ""}`} role="group" aria-label={label}>
        {options.map(([v, lab, I]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {I && <I size={16} aria-hidden />}
            {lab}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Segmented label={label} value={checked ? "y" : "n"} options={[["n", "No"], ["y", "Yes"]]} onChange={(v) => onChange(v === "y")} />
  );
}

/** Icon-only button. `label` is the tooltip and the accessible name. `tipAlign="end"` near the right screen edge. */
export function IconButton({ icon: I, label, onClick, variant, disabled, pressed, type = "button", size = 20, tipAlign }: {
  icon: Icon; label: string; onClick?: () => void; variant?: "solid" | "bare"; disabled?: boolean;
  pressed?: boolean; type?: "button" | "submit"; size?: number; tipAlign?: "end";
}) {
  return (
    <button
      type={type} className={`icon-btn${variant ? ` ${variant}` : ""}`} data-tip={label} data-tip-align={tipAlign} aria-label={label}
      aria-pressed={pressed} onClick={onClick} disabled={disabled}
    >
      <I size={size} aria-hidden />
    </button>
  );
}

/** Primary action: one per view. Icon plus a short label. */
export function Button({ icon: I, children, onClick, ghost, disabled, type = "button" }: {
  icon?: Icon; children: ReactNode; onClick?: () => void; ghost?: boolean; disabled?: boolean; type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`btn${ghost ? " ghost" : ""}`} onClick={onClick} disabled={disabled}>
      {I && <I size={18} aria-hidden />}
      {children}
    </button>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <IconButton icon={X} label="Close" variant="bare" onClick={onClose} tipAlign="end" />
      </div>
      <div className="dialog-body">{open && children}</div>
    </dialog>
  );
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header><h2>{title}</h2>{actions && <div className="row">{actions}</div>}</header>
      {children}
    </section>
  );
}

export function Msg({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  return <div className={`msg ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}
