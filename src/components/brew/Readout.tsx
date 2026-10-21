import type { ReactNode } from "react";

/** Read-only value with a field label, for calculated numbers. Empty shows "-". */
export default function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <span className="strong num readout">{children ?? "-"}</span>
    </div>
  );
}
