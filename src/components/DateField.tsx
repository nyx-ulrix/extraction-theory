// A date stored as a sheet serial. Empty shows 00/00/0000 so a missing date is obvious.
import { useId } from "react";
import { fromSerial, toSerial } from "../calc.ts";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (s: number | null) => {
  if (s == null) return "";
  const d = fromSerial(s);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function DateField({ label, value, onChange, disabled }: {
  label: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean;
}) {
  const id = useId();
  const v = ymd(value);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <span className={`date-field${v ? "" : " empty"}`}>
        <input
          id={id} className="input num" type="date" value={v} disabled={disabled}
          onChange={(e) => {
            const [y, m, d] = e.target.value.split("-").map(Number);
            onChange(e.target.value ? toSerial(new Date(y, m - 1, d)) : null);
          }}
        />
        {!v && <span className="date-blank num" aria-hidden>00/00/0000</span>}
      </span>
    </div>
  );
}
