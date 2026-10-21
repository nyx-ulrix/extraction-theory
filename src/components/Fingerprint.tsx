// Cup fingerprint: the brew's spider chart layers redrawn as smooth see-through shapes,
// with no grid or labels. Every logged cup gets its own shape and colours.
import type { AxisDef, Layer } from "../calc.ts";

/** Closed Catmull-Rom spline through points, as cubic Beziers. */
function smooth(p: [number, number][]) {
  const n = p.length;
  const at = (i: number) => p[(i + n) % n];
  let d = `M${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${c1.map((v) => v.toFixed(2))} ${c2.map((v) => v.toFixed(2))} ${c[0].toFixed(2)},${c[1].toFixed(2)}`;
  }
  return d + "Z";
}

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
