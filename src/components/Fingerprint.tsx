// Cup fingerprint: the brew's spider chart layers redrawn as smooth see-through shapes,
// with no grid or labels. Every logged cup gets its own shape and colours.
import type { AxisDef, Layer } from "../calc.ts";
import { smooth } from "./shape.ts";

export default function Fingerprint({ axes, layers, size = 96 }: { axes: AxisDef[]; layers: Layer[]; size?: number }) {
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
        return <path key={li} d={smooth(pts)} fill={l.color} fillOpacity={0.35} stroke={l.color} strokeWidth={1.5} />;
      })}
    </svg>
  );
}
