// Cup fingerprint: the brew's spider chart layers redrawn as smooth see-through shapes,
// with no grid or labels. Every logged cup gets its own shape and colours.
import type { AxisDef, Layer } from "../calc.ts";
import { smooth } from "./shape.ts";
import { useId, useState } from "react";
import { ink } from "../palette.ts";

export default function Fingerprint({ axes, layers, size = 96, dense = false }: { axes: AxisDef[]; layers: Layer[]; size?: number; dense?: boolean }) {
  if (!layers.length) return null;
  const n = axes.length;
  return (
    <svg viewBox="-50 -50 100 100" width={size} height={size} aria-hidden style={{ display: "block", flex: "none", maxWidth: "100%", height: "auto" }}>
      {layers.map((l, li) => {
        const pts = axes.map((a, i): [number, number] => {
          const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
          const r = 8 + ((l.v[a.key] ?? 0) / 10) * 40; // minimum radius keeps flat notes visible
          return [Math.cos(ang) * r, Math.sin(ang) * r];
        });
        return <InkShape key={li} d={smooth(pts)} color={l.color} pitch={(dense ? 200 : 300) / size} />;
      })}
    </svg>
  );
}

/**
 * One note printed like a risograph plate: a dense, regular halftone dot screen in the note's ink, no outline,
 * overprinting other notes. `pitch` is the dot spacing in the chart's own units (about 3px on screen).
 */
export function InkShape({ d, color, pitch, grow = true }: { d: string; color: string; pitch: number; grow?: boolean }) {
  const id = useId();
  const [delay] = useState(growDelay);
  const c = ink(color);
  return (
    <>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={pitch} height={pitch} patternTransform="rotate(45)">
          <circle cx={pitch / 2} cy={pitch / 2} r={pitch * 0.34} fill={c} />
        </pattern>
      </defs>
      <path className={grow ? "ink grow" : "ink"} style={grow ? { animationDelay: delay } : undefined} d={d} fill={`url(#${id})`} />
    </>
  );
}

/** Each note layer starts growing at its own random moment, so the shapes bloom one after another. */
export const growDelay = () => `${Math.round(Math.random() * 450)}ms`;
