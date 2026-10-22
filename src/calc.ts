// Pure brew maths. No imports so `node src/calc.check.ts` can run it directly.

export type Num = number | null;

/** A radar axis. The template lives in Settings; any bean or brew can carry its own list. */
export interface AxisDef {
  key: string;
  label: string;
  color: string;
  /** Cup-wide attribute (e.g. body, bitterness): every note layer shares one value, moving together. */
  shared?: boolean;
}
const SHARED_BY_DEFAULT = new Set(["bitterness", "body"]);
// Default template, clockwise from the top.
export const DEFAULT_AXES: AxisDef[] = [
  // All from the 64-colour palette.
  { key: "sweetness", label: "Sweetness", color: "#E5A396" }, // Ember 200
  { key: "aroma", label: "Aroma", color: "#CBAAC3" }, // Plum 200
  { key: "bitterness", label: "Bitterness", color: "#7A4025", shared: true }, // Copper 600
  { key: "body", label: "Body", color: "#0A0A0A", shared: true }, // Ink
  { key: "acidity", label: "Acidity", color: "#FBE8A6" }, // Gold 100
  { key: "finish", label: "Finish", color: "#3F6E8C" }, // Info
];
/** Earlier default templates; a saved template still equal to one of these follows the current default. */
export const OLD_DEFAULT_COLOURS = [
  ["#F0AE8E", "#D2B9CA", "#0A0A0A", "#E03A4E", "#E4F28C", "#2E3A87"],
  ["#FF99FF", "#D2B9CA", "#7F3F00", "#0A0A0A", "#E4F28C", "#2E3A87"],
  ["#E5A396", "#D2B9CA", "#7F3F00", "#0A0A0A", "#E4F28C", "#2E3A87"],
];
export type Values = Record<string, number>;
/** One tasting note drawn as its own radar layer. */
export interface Layer {
  note: string;
  color: string;
  v: Values;
}
export const MIN_AXES = 3;
export const MAX_AXES = 12;
const HEX = /^#[0-9a-f]{6}$/i;

export const axisKey = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 30);

/** Keep valid, uniquely keyed axes; fall back to the default template if fewer than 3 survive. */
export function cleanAxes(raw: unknown): AxisDef[] {
  if (!Array.isArray(raw)) return DEFAULT_AXES;
  const seen = new Set<string>();
  const out: AxisDef[] = [];
  for (const a of raw) {
    const label = String((a as AxisDef)?.label ?? "").trim().slice(0, 24);
    const key = axisKey(String((a as AxisDef)?.key || label));
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    const color = HEX.test(String((a as AxisDef).color)) ? String((a as AxisDef).color) : "#7A766E";
    const s = (a as AxisDef).shared;
    out.push({ key, label, color, shared: typeof s === "boolean" ? s : SHARED_BY_DEFAULT.has(key) });
  }
  return out.length >= MIN_AXES ? out.slice(0, MAX_AXES) : DEFAULT_AXES;
}

export const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Imported text that looks like a spreadsheet formula gets a leading ' so it stays text in a CSV export
 * or after a hand edit in Sheets (writes are RAW, so the app itself never runs it).
 * ponytail: after + - @ it needs a DDE pipe or a function call right after the sign, so notes like
 * "-1 step (finer)" or "- Bright (lemon)" keep their text; widen if a real payload slips through.
 */
export const defuse = (s: string) =>
  (/^[=\t\r]/.test(s) && /[(|!]/.test(s)) || (/^[+\-@]/.test(s) && /\||^.\s*[A-Za-z_.]+\(/.test(s)) ? `'${s}` : s;

export function num(v: unknown): Num {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "1:45", "0:45", "45" or "1:02:30" -> seconds. */
export function parseTime(s: string): Num {
  const t = s.trim();
  if (!t) return null;
  // Typed without a colon: the last two digits are seconds, so 230 is 2:30 and 45 is 0:45.
  if (/^\d{3,}$/.test(t)) return Number(t.slice(-2)) < 60 ? Number(t.slice(0, -2)) * 60 + Number(t.slice(-2)) : null;
  const parts = t.split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (const [i, p] of parts.entries()) {
    if (!/^\d+(\.\d+)?$/.test(p)) return null;
    if (i > 0 && Number(p) >= 60) return null;
    total = total * 60 + Number(p);
  }
  return total;
}

export function fmtTime(sec: Num): string {
  if (sec == null) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Fill in one of dose / liquid / ratio (liquid = water, or yield for espresso). */
export function solveRatio(
  v: { dose: Num; liquid: Num; ratio: Num },
  target: "dose" | "liquid" | "ratio",
): Num {
  const { dose, liquid, ratio } = v;
  if (target === "liquid" && dose && ratio) return round(dose * ratio, 1);
  if (target === "dose" && liquid && ratio) return round(liquid / ratio, 1);
  if (target === "ratio" && dose && liquid) return round(liquid / dose, 2);
  return null;
}

/** "1:2:3:3" -> [1,2,3,3]. Rejects empty, zero or negative parts. */
export function parsePattern(s: string): number[] | null {
  const parts = s.split(":").map((p) => p.trim());
  if (!parts.length || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  return n.some((x) => x <= 0) ? null : n;
}

/** Split total water by weights, whole grams, rounding leftover on the last pour so the sum is exact. */
export function splitWater(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.round((total * w) / sum));
  const used = out.slice(0, -1).reduce((a, b) => a + b, 0);
  out[out.length - 1] = Math.max(0, round(total - used, 1));
  return out;
}

/** Pour plan: the pattern's first part is the bloom; optional interval sets start times. */
export function planPours(o: { total: number; pattern: number[]; interval?: Num }): { water: number; start: number | null }[] {
  return splitWater(o.total, o.pattern).map((water, i) => ({ water, start: o.interval ? i * o.interval : null }));
}

export const toTargets = (per: number[]) => {
  let run = 0;
  return per.map((g) => round((run += g), 1));
};
export const fromTargets = (targets: number[]) =>
  targets.map((t, i) => round(t - (i ? targets[i - 1] : 0), 1));

export type DialType = "clicks" | "rotation" | "stepless";
export interface Dial {
  dial_type: DialType;
  clicks_per_number?: Num;
  numbers_per_rotation?: Num;
  um_per_step?: Num;
  zero_um?: Num;
}

/**
 * Grind setting text -> total clicks. Rotation dials (1Zpresso) accept
 * "r.n.c" or "r.n"; a single number is total clicks. Other dials take a decimal.
 */
export function dialToClicks(input: string, g: Dial): Num {
  const t = input.trim();
  if (!t) return null;
  if (g.dial_type === "rotation") {
    const parts = t.split(".");
    if (parts.length >= 2 && parts.length <= 3) {
      const [r, n, c = 0] = parts.map(Number);
      const cpn = g.clicks_per_number ?? 1;
      const npr = g.numbers_per_rotation;
      if (![r, n, c].every(Number.isInteger) || !npr) return null;
      if (n >= npr || c >= cpn) return null;
      return (r * npr + n) * cpn + c;
    }
  }
  return num(t);
}

/** Nominal burr travel estimate. Not particle size. */
export function estimateMicrons(clicks: Num, g: Dial): Num {
  if (clicks == null || g.dial_type === "stepless" || !g.um_per_step) return null;
  return Math.round((g.zero_um ?? 0) + clicks * g.um_per_step);
}

export function iceSplit(dose: number, finalRatio: number, icePct: number) {
  const total = dose * finalRatio;
  const ice = Math.round((total * icePct) / 100);
  return { hot: Math.round(total - ice), ice };
}

export function finalRatio(dose: Num, hot: Num, ice: Num, iceMax: boolean): Num {
  if (iceMax || !dose || hot == null) return null;
  return round((hot + (ice ?? 0)) / dose, 2);
}

// Sheets stores dates as serial days since 1899-12-30, wall-clock (no zone).
export function toSerial(d: Date): number {
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return ms / 86400000 + 25569;
}
export function fromSerial(s: number): Date {
  const u = new Date(Math.round((s - 25569) * 86400000));
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}
export function daysOffRoast(roastSerial: Num, brewSerial: Num): Num {
  if (roastSerial == null || brewSerial == null) return null;
  return Math.floor(brewSerial) - Math.floor(roastSerial);
}

/**
 * Chill stage -> seconds on the brew timeline.
 * Stages: start | end | after | phase:N | t:SECONDS | y:GRAMS (espresso, linear flow after pre-soak and hold).
 */
export function stageToTime(
  stage: string,
  ctx: { total: number; phaseStarts?: number[]; pre?: Num; yieldG?: Num },
): { t: number; approx: boolean } | null {
  const i = stage.indexOf(":");
  const kind = i < 0 ? stage : stage.slice(0, i);
  const raw = i < 0 ? "" : stage.slice(i + 1);
  const v = kind === "t" ? (/^\d+(\.\d+)?$/.test(raw) ? Number(raw) : parseTime(raw)) : num(raw);
  switch (kind) {
    case "start":
      return { t: 0, approx: false };
    case "end":
    case "after":
      return { t: ctx.total, approx: false };
    case "phase": {
      const t = v != null ? ctx.phaseStarts?.[v - 1] : undefined;
      return t == null ? null : { t, approx: false };
    }
    case "t":
      return v == null ? null : { t: v, approx: false };
    case "y": {
      if (v == null || !ctx.yieldG) return null;
      const pre = ctx.pre ?? 0;
      return { t: pre + (Math.min(v, ctx.yieldG) / ctx.yieldG) * (ctx.total - pre), approx: true };
    }
  }
  return null;
}

export const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n * 2) / 2));

/** Axis this layer leans to most. */
export function strongestAxis(v: Values, axes: AxisDef[]): AxisDef {
  return axes.reduce((best, a) => ((v[a.key] ?? 0) > (v[best.key] ?? 0) ? a : best), axes[0]);
}

/**
 * One layer from loose input (AI reply, stored JSON). Accepts values flat on the
 * object or under `v`. Only the given axes, 0..10 in half steps; colour must be #rrggbb.
 */
export function cleanLayer(raw: unknown, axes: AxisDef[]): Layer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const src = (o.v && typeof o.v === "object" ? o.v : o) as Record<string, unknown>;
  const note = String(o.note ?? "").trim().slice(0, 40);
  if (!note) return null;
  const v: Values = {};
  for (const a of axes) v[a.key] = clamp10(num(src[a.key]) ?? 0);
  const color = HEX.test(String(o.color)) ? String(o.color) : strongestAxis(v, axes).color;
  return { note, color, v };
}

/** Validate an AI reply or a stored JSON cell: at most 12 layers. */
export function cleanLayers(raw: unknown, axes: AxisDef[]): Layer[] {
  const list = Array.isArray(raw) ? raw : (raw as { notes?: unknown })?.notes;
  if (!Array.isArray(list)) throw new Error("Reply had no notes list");
  return list.map((l) => cleanLayer(l, axes)).filter((l): l is Layer => l != null).slice(0, 12);
}

/** Notes typed as "blueberry, jasmine; cane sugar" -> individual notes. */
export const splitNotes = (s: string) =>
  s.split(/[,;\n]+/).map((n) => n.trim()).filter(Boolean).slice(0, 12);

/** Overall profile for the sheet: the strongest value on each axis across layers. */
export function profile(layers: Layer[], axes: AxisDef[]): Values {
  const v: Values = {};
  for (const a of axes) v[a.key] = layers.length ? Math.max(...layers.map((l) => l.v[a.key] ?? 0)) : 0;
  return v;
}

/** Stored radar cell: the axes used plus every note layer. */
export interface Flavour { axes: AxisDef[]; layers: Layer[] }
export function parseFlavour(cell: unknown, fallback: AxisDef[]): Flavour {
  try {
    const o = JSON.parse(String(cell ?? ""));
    const axes = o?.axes ? cleanAxes(o.axes) : fallback;
    return { axes, layers: cleanLayers(o?.layers ?? [], axes) };
  } catch {
    return { axes: fallback, layers: [] };
  }
}

/** Aeropress: steep ends when the first press starts; brew ends after the last press. */
export function pressTimes(presses: { start: Num; duration: Num }[]) {
  const first = presses[0]?.start ?? null;
  const last = presses[presses.length - 1];
  const end = last?.start != null ? last.start + (last.duration ?? 0) : null;
  return { steep: first, total: end };
}
