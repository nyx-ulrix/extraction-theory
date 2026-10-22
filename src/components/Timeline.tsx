// Brew timeline: lanes of water, agitation, valve, press, chill and events on one time axis.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtTime, num, pressTimes, stageToTime } from "../calc.ts";
import type { MethodDef, Phase, Rec } from "../schema.ts";

export interface TimelineItem { label: string; method: MethodDef; brew: Rec; phases: Phase[] }

type Span = { s: number; e: number };
interface Model {
  label: string;
  hours: boolean;
  end: number; // 0 = nothing time based
  pours: (Span & { g: number; temp: number | null })[];
  line: [number, number][]; // running total water (t, grams)
  agit: { t: number; text: string }[];
  valve: (Span & { closed: boolean })[] | null;
  press: Span[];
  steep: Span | null; // cold brew, hours
  chill: (Span & { text: string }) | null;
  events: { t: number; text: string }[];
}

const isNum = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

function build({ label, brew, phases }: TimelineItem): Model {
  const n = (k: string) => num(brew[k]);
  const pours = phases.filter((p) => p.kind === "pour").sort((a, b) => a.n - b.n);
  const presses = phases.filter((p) => p.kind === "press").sort((a, b) => a.n - b.n);
  const empty: Model = { label, hours: false, end: 0, pours: [], line: [], agit: [], valve: null, press: [], steep: null, chill: null, events: [] };

  // Espresso: pre-soak, then hold, then flow (older brews logged one preinfusion time).
  const soak = n("presoak_s");
  const pre = soak != null || n("hold_s") != null ? (soak ?? 0) + (n("hold_s") ?? 0) : n("preinfusion_s");
  const total = n("total_s") ?? pressTimes(presses.map((p) => ({ start: p.start_s, duration: p.duration_s }))).total;
  const known = [
    total, n("drain_at_s"), n("first_flow_s"), soak, pre,
    ...phases.map((p) => (p.start_s == null ? null : p.start_s + (p.duration_s ?? 0))),
    ...phases.map((p) => (p.agitation_timing === "at" ? p.agitation_at_s : null)),
  ].filter((x): x is number => isNum(x) && x > 0);

  if (!known.length) {
    const steep = n("steep_h");
    return steep && steep > 0 ? { ...empty, hours: true, end: steep, steep: { s: 0, e: steep } } : empty;
  }
  const T = total ?? Math.max(...known);

  // Water: each pour lasts its logged duration, else until the next pour starts, or the end.
  const timed = pours.filter((p) => p.start_s != null).sort((a, b) => a.start_s! - b.start_s!);
  const segEnd = new Map<Phase, number>();
  const m: Model = { ...empty, end: T };
  let cum = 0;
  m.line.push([timed[0]?.start_s ?? 0, 0]);
  timed.forEach((p, i) => {
    const s = p.start_s!;
    const e = p.duration_s != null ? s + p.duration_s : Math.max(s, timed[i + 1]?.start_s ?? T);
    segEnd.set(p, e);
    const g = p.water_g ?? 0;
    m.pours.push({ s, e, g, temp: p.temp_c ?? n("temp_c") });
    m.line.push([s, cum], [Math.min(e, s + (p.duration_s ?? 0)), (cum += g)]);
  });
  if (timed.length) m.line.push([T, cum]);
  else m.line = [];
  for (const p of presses) if (p.start_s != null) segEnd.set(p, p.start_s + (p.duration_s ?? 0));

  // Agitation markers by timing.
  for (const p of phases) {
    if (!p.agitation || p.agitation === "None") continue;
    const s = p.start_s;
    const e = s == null ? null : p.duration_s != null ? s + p.duration_s : segEnd.get(p) ?? s;
    const at: Record<string, number | null | undefined> = { before: s, during: s == null || e == null ? null : (s + e) / 2, after: e, at: p.agitation_at_s };
    const t = p.agitation_timing in at ? at[p.agitation_timing] : s;
    if (isNum(t)) m.agit.push({ t, text: p.agitation + ((p.agitation_count ?? 0) > 1 ? ` x${p.agitation_count}` : "") });
  }

  // Valve: a blank setting keeps the previous state.
  if (phases.some((p) => p.valve)) {
    let state = "";
    m.valve = timed.map((p) => {
      state = p.valve || state;
      return { s: p.start_s!, e: segEnd.get(p)!, closed: state === "closed" };
    });
  }

  m.press = presses.filter((p) => p.start_s != null).map((p) => ({ s: p.start_s!, e: segEnd.get(p)! }));

  const cs = brew.chill_start;
  if (typeof cs === "string" && cs) {
    const ctx = { total: T, phaseStarts: pours.map((p) => p.start_s ?? undefined) as number[], pre, yieldG: n("yield_g") };
    const a = stageToTime(cs, ctx);
    const b = stageToTime(String(brew.chill_stop || "end"), ctx);
    if (a && isNum(a.t)) {
      const name = String(brew.chill_method || "Chill");
      m.chill = { s: a.t, e: Math.max(a.t, b && isNum(b.t) ? b.t : T), text: (a.approx || b?.approx ? "~" : "") + name };
    }
  }

  const ev: [string, number | null][] = [
    ["Pre-soak", soak], ["Hold", n("hold_s") != null ? pre : null], ["Preinfusion", soak == null && n("hold_s") == null ? pre : null],
    ["First flow", n("first_flow_s")], ["Drain", n("drain_at_s")], ["End", total],
  ];
  m.events = ev.filter(([, t]) => isNum(t)).map(([text, t]) => ({ t: t!, text }));
  return m;
}

const STEPS_S = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
const STEPS_H = [0.5, 1, 2, 3, 4, 6, 12, 24, 48];
const LABEL_W = 96;
const PAD_R = 20;

/** Container width in px so text stays at its real size. The ref must sit on a node that is always rendered. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export default function Timeline({ items }: { items: TimelineItem[] }) {
  const [ref, W] = useWidth();
  const models = items.slice(0, 2).map(build);
  const empty = !models.some((m) => m.end > 0);

  // Shared scale per unit so a compare reads on the same axis.
  const maxEnd = (hours: boolean) => Math.max(1, ...models.filter((m) => m.hours === hours).map((m) => m.end));
  const maxG = Math.max(1, ...models.flatMap((m) => m.pours.map((p) => p.g)));
  const maxCum = Math.max(1, ...models.flatMap((m) => m.line.map(([, g]) => g)));
  const plotW = W - LABEL_W - PAD_R;

  const out: ReactNode[] = [];
  let y = 0;
  const lab = (text: string, yy: number, key: string) => (
    <text key={key} x={0} y={yy} dominantBaseline="middle" fontSize={10} letterSpacing="0.2em" fill="var(--text)">{text.toUpperCase()}</text>
  );

  models.forEach((m, mi) => {
    const T = maxEnd(m.hours);
    const x = (t: number) => LABEL_W + (Math.max(0, t) / T) * plotW;
    const wd = (s: Span, min = 2) => Math.max(min, x(s.e) - x(s.s));
    const k = `m${mi}`;
    if (models.length > 1) {
      if (mi) y += 16;
      out.push(<text key={`${k}h`} x={0} y={y + 12} fontSize={12} fontWeight={700} fill="var(--text-strong)">{m.label}</text>);
      y += 24;
    }
    if (!m.end) {
      out.push(<text key={`${k}e`} x={0} y={y + 12} fontSize={12} fill="var(--text)">Add times to see the timeline.</text>);
      y += 24;
      return;
    }
    const lane = (name: string, h: number, body: (top: number) => ReactNode) => {
      out.push(
        <g key={`${k}${name}`}>
          <line x1={LABEL_W} x2={W - PAD_R} y1={y + h} y2={y + h} stroke="var(--border-soft)" />
          {lab(name, y + h / 2, "l")}
          {body(y)}
        </g>,
      );
      y += h + 4;
    };

    if (m.hours) {
      lane("Steep", 24, (top) => <rect x={x(0)} y={top + 6} width={wd(m.steep!)} height={12} fill="var(--series-2)" />);
    } else {
      if (m.pours.length) lane("Water", 60, (top) => {
        const base = top + 58;
        return (
          <>
            {m.pours.map((p, i) => {
              const pct = p.temp == null ? 50 : Math.round(Math.max(0, Math.min(1, (p.temp - 80) / 20)) * 100);
              const h = (p.g / maxG) * 44;
              return (
                <rect key={i} x={x(p.s)} y={base - h} width={wd(p)} height={h} stroke="var(--bg)" strokeWidth={1}
                  style={{ fill: `color-mix(in srgb, var(--series-1) ${pct}%, var(--series-3))` }}>
                  <title>{`Pour ${i + 1}: ${p.g} g${p.temp == null ? "" : `, ${p.temp} °C`}`}</title>
                </rect>
              );
            })}
            {m.line.length > 1 && (
              <polyline fill="none" stroke="var(--text-strong)" strokeWidth={1.5} strokeLinejoin="round"
                points={m.line.map(([t, g]) => `${x(t).toFixed(1)},${(base - (g / maxCum) * 54).toFixed(1)}`).join(" ")} />
            )}
          </>
        );
      });
      if (m.agit.length) lane("Agitation", 26, (top) => m.agit.map((a, i) => (
        <g key={i}>
          <rect x={x(a.t) - 3} y={top + 10} width={6} height={6} fill="var(--text-strong)" />
          <text x={x(a.t) + 6} y={top + 13 + (i % 2 ? 7 : -4)} fontSize={9} dominantBaseline="middle" fill="var(--text)">{a.text}</text>
        </g>
      )));
      if (m.valve) lane("Valve", 18, (top) => m.valve!.map((v, i) => v.closed
        ? <rect key={i} x={x(v.s)} y={top + 3} width={wd(v)} height={12} fill="var(--text)" fillOpacity={0.35}><title>Valve closed</title></rect>
        : <line key={i} x1={x(v.s)} x2={x(v.e)} y1={top + 9} y2={top + 9} stroke="var(--text)" strokeDasharray="2 3" />));
      if (m.press.length) lane("Press", 22, (top) => m.press.map((p, i) => (
        <rect key={i} x={x(p.s)} y={top + 4} width={wd(p, 3)} height={14} fill="var(--series-4)" />
      )));
      if (m.chill) {
        const c = m.chill;
        lane("Chill", 22, (top) => (
          <>
            <rect x={x(c.s)} y={top + 4} width={wd(c, 6)} height={14} fill="var(--info)" fillOpacity={0.35} stroke="var(--info)" />
            <text x={Math.min(x(c.s) + 4, W - PAD_R - 60)} y={top + 11} fontSize={9} dominantBaseline="middle" fill="var(--text-strong)">{c.text}</text>
          </>
        ));
      }
      if (m.events.length) lane("Events", 30, (top) => m.events.map((e, i) => (
        <g key={i}>
          <line x1={x(e.t)} x2={x(e.t)} y1={top + 2} y2={top + 28} stroke="var(--text-strong)" />
          <text x={x(e.t) + (x(e.t) > W - PAD_R - 70 ? -4 : 4)} y={top + (i % 2 ? 22 : 10)} fontSize={9}
            textAnchor={x(e.t) > W - PAD_R - 70 ? "end" : "start"} dominantBaseline="middle" fill="var(--text)">{e.text}</text>
        </g>
      )));
    }

    // x axis
    const steps = m.hours ? STEPS_H : STEPS_S;
    const count = Math.max(2, Math.floor(plotW / 64));
    const step = steps.find((s) => T / s <= count) ?? steps[steps.length - 1];
    const ticks = Array.from({ length: Math.floor(T / step + 1e-9) + 1 }, (_, i) => i * step);
    out.push(
      <g key={`${k}x`}>
        <line x1={LABEL_W} x2={W - PAD_R} y1={y} y2={y} stroke="var(--border)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={y} y2={y + 4} stroke="var(--border)" />
            <text x={x(t)} y={y + 15} fontSize={10} textAnchor="middle" fill="var(--text)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {m.hours ? `${t}h` : fmtTime(t)}
            </text>
          </g>
        ))}
      </g>,
    );
    y += 22;
  });

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {empty ? <p className="muted">Add times to see the timeline.</p> : (
        <svg viewBox={`0 0 ${W} ${y}`} width="100%" role="img" aria-label="Brew timeline" style={{ display: "block", overflow: "visible", fontFamily: "var(--mono)" }}>
          {out}
        </svg>
      )}
    </div>
  );
}
