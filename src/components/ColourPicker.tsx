// Swatch button that opens the 64 approved palette colours as an 8 x 8 grid (8 families x 8 shades).
import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { PALETTE, ink } from "../palette.ts";
import { Dialog } from "../ui.tsx";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export default function ColourPicker({ value, onChange, label, size = 44 }: {
  value: string; onChange: (hex: string) => void; label: string; size?: number;
}) {
  const [open, setOpen] = useState(false);
  const current = PALETTE.find(([, h]) => same(h, value))?.[0];
  return (
    <>
      <button
        type="button" aria-label={`${label}: ${current ?? value}. Change colour`} data-tip={label}
        className="swatch-btn" onClick={() => setOpen(true)}
        style={{ width: size, height: size, background: ink(value) }}
      />
      <Dialog open={open} onClose={() => setOpen(false)} title={label}>
        <div className="palette-grid" role="listbox" aria-label="Approved colours">
          {PALETTE.map(([name, hex]) => {
            const on = same(hex, value);
            return (
              <button
                key={name} type="button" role="option" aria-selected={on} aria-label={name} title={name}
                className="palette-cell" style={{ background: ink(hex) }}
                onClick={() => { onChange(hex); setOpen(false); }}
              >
                {on && <Check size={16} weight="bold" aria-hidden style={{ color: luminance(ink(hex)) > 0.5 ? "#0A0A0A" : "#FFFFFF" }} />}
              </button>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: 12 }}>{current ? current : "Current colour is not in the palette."}</p>
      </Dialog>
    </>
  );
}

export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
