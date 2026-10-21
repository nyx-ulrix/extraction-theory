// Flavour radar: Kiviat grid with coloured axis dots, one see-through polygon per tasting note.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clamp10, type AxisDef, type Layer } from "../calc.ts";

const R = 150; // radius of value 10
const DOT_R = R + 16; // axis dot at the outer end of each spoke
const LABEL_R = DOT_R + 14; // label baseline ring
const RINGS = [2, 4, 6, 8, 10];

const xy = (i: number, n: number, r: number): [number, number] => {
  const a = (i / n) * Math.PI * 2; // clockwise from the top
  return [Math.sin(a) * r, -Math.cos(a) * r];
};
const poly = (n: number, r: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => xy(i, n, r(i)).map((c) => c.toFixed(2)).join(",")).join(" ");

/** True for colours that vanish on paper (very light) or carbon (very dark): give them an outline. */
function extreme(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  if (c.some(Number.isNaN)) return false;
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l < 0.04 || l > 0.7;
}

export default function Radar({
  axes, layers, onChange, selected = null, onSelect, size = 420, legend = true, title = "Flavour radar",
  emptyText = "Add tasting notes to draw layers.",
}: {
  axes: AxisDef[];
  layers: Layer[];
  onChange?: (layers: Layer[]) => void;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
  size?: number;
  legend?: boolean;
  title?: string;
  /** Centre text when there are no layers. Pass "" to hide (small previews). */
  emptyText?: string;
}) {
  const n = axes.length;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ axis: number | null; id: number } | null>(null);
  const handles = useRef<(SVGGElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const sel = selected != null && layers[selected] ? selected : null;
  const editable = !!onChange && sel != null;

  // Label size shrinks so neighbouring tangential labels do not collide. Mono glyph + 0.2em tracking = 0.8em.
  const maxLen = Math.max(1, ...axes.map((a) => a.label.length));
  const fs = Math.max(8, Math.min(12, ((2 * Math.PI * LABEL_R) / n) * 0.85 / (0.8 * maxLen)));
  const half = (maxLen * 0.8 * fs) / 2;
  const vb = Math.ceil(Math.hypot(LABEL_R + fs, half)) + 4;
  // Invisible handle hit area: at least 44px across when the radar is drawn 328px wide (a phone).
  const hitR = Math.ceil((22 * vb * 2) / 328);

  const setVal = (axis: number, value: number) => {
    if (sel == null || !onChange) return;
    const key = axes[axis].key;
    const v = clamp10(value);
    if (layers[sel].v[key] === v) return;
    onChange(layers.map((l, i) => (i === sel ? { ...l, v: { ...l.v, [key]: v } } : l)));
  };

  const toSvg = (e: PointerEvent) => {
    const m = svgRef.current?.getScreenCTM();
    return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const p = toSvg(e);
    if (!d || d.id !== e.pointerId || !p) return;
    if (d.axis == null) {
      // Handles stacked near the centre: pick the axis the pointer heads towards.
      if (Math.hypot(p.x, p.y) < 10) return;
      const a = (Math.atan2(p.x, -p.y) + Math.PI * 2) % (Math.PI * 2);
      d.axis = Math.round(a / ((Math.PI * 2) / n)) % n;
    }
    const [ux, uy] = xy(d.axis, n, 1);
    setVal(d.axis, ((p.x * ux + p.y * uy) / R) * 10);
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
  };

  const order = layers.map((_, i) => i).filter((i) => i !== sel);
  if (sel != null) order.push(sel);

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: size, margin: "0 auto" }}>
      <svg
        ref={svgRef}
        viewBox={`${-vb} ${-vb} ${vb * 2} ${vb * 2}`}
        role="group"
        aria-label={title}
        // Editable: a finger anywhere on the chart shapes it instead of scrolling the page.
        style={{
          width: "100%", height: "auto", display: "block", overflow: "visible", fontFamily: "var(--mono)",
          ...(onChange ? { touchAction: "none", overscrollBehavior: "contain", userSelect: "none", WebkitUserSelect: "none" } : {}),
        }}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <title>{title}</title>
        {RINGS.map((v) => (
          <polygon key={v} points={poly(n, () => (v / 10) * R)} fill="none" stroke="var(--border-soft)" strokeWidth={1} />
        ))}
        {axes.map((a, i) => {
          const [x, y] = xy(i, n, DOT_R);
          const [lx, ly] = xy(i, n, LABEL_R);
          return (
            <g key={a.key}>
              <line x1={0} y1={0} x2={x} y2={y} stroke="var(--border-soft)" strokeWidth={1} />
              <circle cx={x} cy={y} r={5} fill={a.color} stroke={extreme(a.color) ? "var(--text)" : "none"} strokeWidth={1} />
              <text
                transform={`translate(${lx.toFixed(2)} ${ly.toFixed(2)}) rotate(${((i / n) * 360).toFixed(2)})`}
                textAnchor="middle" fontSize={fs} letterSpacing="0.2em" fill="var(--text)"
              >
                {a.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {!layers.length && emptyText && (
          <text textAnchor="middle" fontSize={12} fill="var(--text)" stroke="var(--bg)" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
            {emptyText.length > 20
              ? splitHalf(emptyText).map((t, i) => <tspan key={i} x={0} dy={i ? 16 : -4}>{t}</tspan>)
              : emptyText}
          </text>
        )}

        {order.map((li) => {
          const l = layers[li];
          const pts = poly(n, (i) => ((l.v[axes[i].key] ?? 0) / 10) * R);
          const outline = extreme(l.color);
          return (
            <g
              key={li}
              opacity={sel != null && li !== sel ? 0.4 : 1}
              onClick={onSelect ? () => onSelect(li) : undefined}
              style={{ cursor: onSelect ? "pointer" : undefined }}
            >
              {outline && <polygon points={pts} fill="none" stroke="var(--text)" strokeWidth={4} strokeLinejoin="round" />}
              <polygon points={pts} fill={l.color} fillOpacity={0.35} stroke={l.color} strokeWidth={2} strokeLinejoin="round" />
              {axes.map((a, i) => {
                const [x, y] = xy(i, n, ((l.v[a.key] ?? 0) / 10) * R);
                return <circle key={a.key} cx={x} cy={y} r={3} fill={l.color} stroke={outline ? "var(--text)" : "none"} strokeWidth={1} />;
              })}
            </g>
          );
        })}

        {editable && sel != null && axes.map((a, i) => {
          const l = layers[sel];
          const v = l.v[a.key] ?? 0;
          const [x, y] = xy(i, n, (v / 10) * R);
          const key = (e: KeyboardEvent) => {
            const step = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5 }[e.key];
            if (step == null) return;
            e.preventDefault();
            setVal(i, v + step);
          };
          return (
            <g
              key={a.key}
              ref={(el) => { handles.current[i] = el; }}
              tabIndex={0}
              role="slider"
              aria-label={`${l.note} ${a.label}`}
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={v}
              // Only handles block panning, so the page still scrolls when a touch starts elsewhere.
              style={{ cursor: "grab", outline: "none", touchAction: "none" }}
              onKeyDown={key}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus((f) => (f === i ? null : f))}
              onPointerDown={(e) => {
                e.stopPropagation();
                // Hit areas overlap, so drag the handle nearest the pointer, not the one drawn on top.
                const p = toSvg(e);
                const vals = axes.map((ax) => l.v[ax.key] ?? 0);
                const dist = (k: number) => {
                  const [hx, hy] = xy(k, n, (vals[k] / 10) * R);
                  return p ? Math.hypot(hx - p.x, hy - p.y) : k === i ? 0 : Infinity;
                };
                const j = vals.reduce((best, _, k) => (dist(k) < dist(best) ? k : best), i);
                handles.current[j]?.focus();
                svgRef.current?.setPointerCapture(e.pointerId);
                drag.current = { axis: vals[j] < 1 ? null : j, id: e.pointerId };
              }}
            >
              <circle cx={x} cy={y} r={hitR} fill="transparent" />
              <circle cx={x} cy={y} r={7} fill={l.color} stroke="var(--text-strong)" strokeWidth={1.5} />
              {focus === i && <rect x={x - 11} y={y - 11} width={22} height={22} fill="none" stroke="var(--focus)" strokeWidth={2} />}
            </g>
          );
        })}
      </svg>

      {legend && layers.length > 0 && (
        <div className="row" style={{ justifyContent: "center" }}>
          {layers.map((l, i) =>
            onSelect ? (
              <button key={i} type="button" className="chip" style={{ minHeight: 44 }} aria-pressed={sel === i} onClick={() => onSelect(sel === i ? null : i)}>
                <span className="swatch" style={{ background: l.color }} />
                {l.note}
              </button>
            ) : (
              <span key={i} className="chip" style={{ cursor: "default" }}>
                <span className="swatch" style={{ background: l.color }} />
                {l.note}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Two lines at the word break nearest the middle. */
function splitHalf(s: string): [string, string] {
  const mid = s.length / 2;
  let best = -1;
  for (let i = s.indexOf(" "); i >= 0; i = s.indexOf(" ", i + 1)) if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
  return best < 0 ? [s, ""] : [s.slice(0, best), s.slice(best + 1)];
}
