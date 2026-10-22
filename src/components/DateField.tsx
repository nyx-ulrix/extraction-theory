// A date stored as a sheet serial. Empty shows 00/00/0000 so a missing date is obvious.
import { useEffect, useId, useState } from "react";
import { fromSerial, toSerial } from "../calc.ts";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (s: number | null) => {
  if (s == null) return "";
  const d = fromSerial(s);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Browsers report partial years while one is typed (0002, 0020...): only a real year counts.
const toValue = (text: string): number | null | undefined => {
  if (!text) return null;
  const [y, m, d] = text.split("-").map(Number);
  if (!(y >= 1000)) return undefined;
  const date = new Date(0);
  date.setFullYear(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return toSerial(date);
};

/** `commitOnBlur`: save once when the field is left (for fields that write straight to the sheet). */
export function DateField({ label, value, onChange, disabled, commitOnBlur }: {
  label: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean; commitOnBlur?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(ymd(value));
  useEffect(() => setText(ymd(value)), [value]);
  const commit = (t: string) => {
    const v = toValue(t);
    if (v !== undefined && v !== value) onChange(v);
  };
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <span className={`date-field${text ? "" : " empty"}`}>
        <input
          id={id} className="input num" type="date" value={text} disabled={disabled}
          onChange={(e) => { setText(e.target.value); if (!commitOnBlur) commit(e.target.value); }}
          onBlur={(e) => { if (commitOnBlur) commit(e.target.value); }}
        />
        {!text && <span className="date-blank num" aria-hidden>00/00/0000</span>}
      </span>
    </div>
  );
}
