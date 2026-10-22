// Pure helpers for the brew form: the draft shape, prefill, ratio assists and the saved record.
import {
  cleanAxes, cleanLayers, daysOffRoast, dialToClicks, fromSerial, estimateMicrons, finalRatio, iceSplit, num, pressTimes, profile, round,
  solveRatio, toSerial, type AxisDef, type Dial, type Flavour, type Num,
} from "./calc.ts";
import { frozenOn, newPhase, TABS, type Gear, type MethodDef, type MethodField, type Phase, type Rec, type Recipe } from "./schema.ts";
import type { Db } from "./store.ts";

/** A phase with a stable React key. The key is dropped on save. */
export type DPhase = Phase & { k: string };
export type RatioKey = "dose" | "liquid" | "ratio";

export interface Draft {
  method: string;
  /** datetime-local value. */
  date: string;
  /** Brew columns and Methods-tab fields, keyed by column name. */
  f: Rec;
  pours: DPhase[];
  presses: DPhase[];
  /** null = blank radar on the current template. */
  flavour: Flavour | null;
  /** Assist inputs, not saved to the sheet. */
  x: { order: RatioKey[]; pattern: string; interval: Num; ice_pct: Num };
  /** User edited something since the last prefill or reset. */
  touched: boolean;
  /** Values came from an earlier brew. */
  prefilled: boolean;
  /** yyyy-mm-dd of the brew loaded with Brew again. */
  from?: string;
  /** The user picked the brew date; otherwise it follows today. */
  dateSet?: boolean;
}
export type Up = (fn: (d: Draft) => Draft) => void;

export const DRAFT_KEY = "et.draft";
export const str = (v: unknown) => (v == null ? "" : String(v));
export const withF = (patch: Rec) => (d: Draft): Draft => ({ ...d, f: { ...d.f, ...patch } });
export const kp = (p: Phase): DPhase => ({ ...p, brew_id: undefined, k: crypto.randomUUID() });
export const liquidKey = (m: MethodDef) => (m.liquid === "yield" ? "yield_g" : "water_g");
export const toDial = (g: Gear): Dial => ({ ...g, dial_type: g.dial_type ?? "clicks" });
export const ICE_CHILLS = ["Ice drip", "Shaken"];

export function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export const emptyDraft = (method: string): Draft => ({
  method,
  date: nowLocal(),
  f: {},
  pours: [],
  presses: [kp(newPhase("press", 1))],
  flavour: null,
  x: { order: ["dose", "ratio", "liquid"], pattern: "", interval: null, ice_pct: null },
  touched: false,
  prefilled: false,
});

/** Local storage draft, if it looks like one. An untouched draft restarts at now. */
export function restoreDraft(): Draft | null {
  try {
    const o = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (!o || typeof o.method !== "string" || !o.f || !Array.isArray(o.pours) || !Array.isArray(o.presses)) return null;
    const e = emptyDraft(o.method);
    return { ...e, ...o, x: { ...e.x, ...o.x }, date: o.dateSet && typeof o.date === "string" ? o.date : e.date };
  } catch {
    return null;
  }
}

export const fieldShown = (fld: MethodField, f: Rec) => {
  if (!fld.show_if) return true;
  const [k, v = ""] = fld.show_if.split("=");
  return str(f[k.trim()]) === v.trim();
};

// Never copied into a new brew: identity, date, derived values, tasting and verdict.
const SKIP = new Set(["id", "created", "brew_date", "grind_clicks", "days_off_roast", "tasting_notes", "flavour", "rating", "taste_balance", "taste_strength", "changed", "notes", "dialed_in"]);

/** Draft with the recipe and phases of an earlier brew. */
export function loadFrom(db: Db, b: Rec, d: Draft): Draft {
  const f: Rec = {};
  for (const [k, v] of Object.entries(b)) if (!SKIP.has(k) && !k.startsWith("f_")) f[k] = v;
  // grind_um is only kept when the user typed it, not when it was the estimate.
  const grinder = db.gear.find((g) => g.id === b.grinder_id);
  if (grinder) {
    const dial = toDial(grinder);
    const clicks = num(b.grind_clicks) ?? (dial.dial_type === "stepless" ? null : dialToClicks(str(b.grind_setting), dial));
    if (num(b.grind_um) === estimateMicrons(clicks, dial)) delete f.grind_um;
  }
  const ph = db.phases.filter((p) => p.brew_id === b.id).sort((a, c) => a.n - c.n).map(kp);
  const presses = ph.filter((p) => p.kind === "press");
  const water = num(b.water_g), ice = num(b.ice_g);
  return {
    ...d,
    method: str(b.method) || d.method,
    f,
    pours: ph.filter((p) => p.kind === "pour"),
    presses: presses.length ? presses : [kp(newPhase("press", 1))],
    flavour: null,
    x: { ...d.x, ice_pct: water && ice ? round((ice / (water + ice)) * 100, 0) : d.x.ice_pct },
    touched: false,
    prefilled: true,
    from: undefined,
  };
}

const latest = (rows: Rec[]) => rows.sort((a, b) => (num(b.brew_date) ?? 0) - (num(a.brew_date) ?? 0))[0];

/** Ice brew is always iced; cold brew is neither; otherwise the Hot / Iced switch (older brews: an iced serve or a chill). */
export function isIced(f: Rec, m: MethodDef): boolean {
  if (m.chill === "required") return true;
  if (m.id === "coldbrew") return false;
  if (f.iced != null && f.iced !== "") return f.iced === true || str(f.iced) === "true";
  return f.serve_iced === true || str(f.serve_iced) === "true" || !!str(f.chill_method);
}
/** Espresso-style drinks are served black or with milk. */
export const espressoStyle = (m: MethodDef) => m.id === "espresso" || m.id === "moka";
export const serveOf = (f: Rec): "black" | "milk" => (str(f.serve) === "milk" || (!str(f.serve) && str(f.milk_drink)) ? "milk" : "black");

// A recipe leaves out the coffee, the verdict and anything worked out from the coffee.
const NOT_RECIPE = new Set(["bean_id", "tasting_notes", "rating", "taste_balance", "taste_strength", "changed", "notes", "dialed_in", "flavour"]);

/** The form's recipe, ready to save under a name. */
export function toRecipe(d: Draft, name: string): Recipe {
  const strip = (p: DPhase): Phase => { const { k: _k, ...rest } = p; return rest; };
  return {
    name: name.trim().slice(0, 40),
    method: d.method,
    f: Object.fromEntries(Object.entries(d.f).filter(([k, v]) => !NOT_RECIPE.has(k) && v != null && v !== "")),
    pours: d.pours.map(strip),
    presses: d.presses.map(strip),
  };
}

/** A saved recipe into the form, keeping its coffee, date and verdict. */
export function applyRecipe(d: Draft, r: Recipe): Draft {
  const keep = Object.fromEntries(Object.entries(d.f).filter(([k]) => NOT_RECIPE.has(k)));
  return {
    ...d,
    method: r.method,
    f: { ...keep, ...r.f },
    pours: r.pours.map(kp),
    presses: r.presses.length ? r.presses.map(kp) : [kp(newPhase("press", 1))],
    touched: true,
    prefilled: false,
    from: undefined,
  };
}

/** A logged brew back in the form for editing: recipe, phases, date and verdict, all as saved. */
export function editDraft(db: Db, b: Rec, fallbackMethod: string): Draft {
  const d = loadFrom(db, b, emptyDraft(str(b.method) || fallbackMethod));
  const keep = ["tasting_notes", "rating", "taste_balance", "taste_strength", "changed", "notes", "dialed_in"];
  const at = num(b.brew_date);
  const local = at == null ? null : fromSerial(at);
  const date = local ? new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : d.date;
  return { ...d, date, dateSet: true, f: { ...d.f, ...Object.fromEntries(keep.map((k) => [k, b[k] ?? null])) }, prefilled: false, touched: false };
}

/** Distinct values typed into `key` across brews, most recent brew first. */
export function pastValues(db: Db, key: string): string[] {
  const rows = [...db.brews].sort((a, b) => (num(b.brew_date) ?? 0) - (num(a.brew_date) ?? 0));
  return [...new Set(rows.map((b) => str(b[key]).trim()).filter(Boolean))];
}

/** This coffee's grinder: the one its last brew used, else the first of the user's grinders. */
export function defaultGrinder(db: Db, beanId: unknown): string | null {
  const used = latest(db.brews.filter((b) => b.bean_id === beanId && b.grinder_id));
  return used ? str(used.grinder_id) : db.settings.my_grinders[0] ?? null;
}

/**
 * Switch the form to a coffee: its last recipe (any method), keeping the brew date. A coffee with no
 * brews yet starts blank on the current method, with its grinder chosen.
 */
export function beanRecipe(db: Db, d: Draft, beanId: string): Draft {
  const last = latest(db.brews.filter((b) => b.bean_id === beanId));
  const base: Draft = last
    ? loadFrom(db, last, { ...d })
    : { ...emptyDraft(d.method), date: d.date, dateSet: d.dateSet, f: { bean_id: beanId } };
  const f: Rec = { ...base.f, bean_id: beanId };
  if (!f.grinder_id) f.grinder_id = defaultGrinder(db, beanId);
  return { ...base, f, touched: false };
}

/** If the form is untouched, load the latest brew of this bean and method. */
export function prefill(db: Db, d: Draft): Draft {
  if (d.touched || !d.f.bean_id) return d;
  const last = db.brews
    .filter((b) => b.bean_id === d.f.bean_id && b.method === d.method)
    .sort((a, b) => (num(b.brew_date) ?? 0) - (num(a.brew_date) ?? 0))[0];
  if (last) return loadFrom(db, last, d);
  if (!d.f.grinder_id) d = { ...d, f: { ...d.f, grinder_id: defaultGrinder(db, d.f.bean_id) } };
  // Switched away from a loaded brew to a pair with no history: start clean.
  return d.prefilled ? { ...emptyDraft(d.method), date: d.date, f: { bean_id: d.f.bean_id } } : d;
}

/** Ratio solver: set one of dose / liquid / ratio, recompute the least recently edited other. */
export function solve(d: Draft, m: MethodDef, k: RatioKey, v: Num): Draft {
  const key = { dose: "dose_g", liquid: liquidKey(m), ratio: "ratio" };
  const order = [k, ...d.x.order.filter((o) => o !== k)];
  const f: Rec = { ...d.f, [key[k]]: v };
  const t = order[2];
  const got = solveRatio({ dose: num(f.dose_g), liquid: num(f[key.liquid]), ratio: num(f.ratio) }, t);
  if (got != null) f[key[t]] = got;
  return { ...d, f, x: { ...d.x, order } };
}

/** Ice brew: final ratio and ice share -> hot water and ice grams. */
export function iceTarget(d: Draft) {
  const dose = num(d.f.dose_g), fr = num(d.f.final_ratio), pct = d.x.ice_pct;
  return dose && fr && pct != null ? iceSplit(dose, fr, pct) : null;
}
export function iceAssist(d: Draft): Draft {
  const t = iceTarget(d);
  return t && !d.f.ice_max ? withF({ ice_g: t.ice })(d) : d;
}

/** Water the pour splitter divides. */
export function pourTotal(d: Draft, m: MethodDef): Num {
  if (m.ice) return iceTarget(d)?.hot ?? null;
  const dose = num(d.f.dose_g), r = num(d.f.ratio);
  return dose && r ? Math.round(dose * r) : null;
}

export const sumWater = (ps: Phase[]): Num =>
  ps.some((p) => p.water_g != null) ? round(ps.reduce((a, p) => a + (p.water_g ?? 0), 0), 1) : null;

const strip = (p: DPhase): Phase => {
  const o: Partial<DPhase> = { ...p };
  delete o.k;
  delete o.brew_id;
  return o as Phase;
};

/** Every Brews column plus this method's fields. id and created are added on save. */
export function buildRecord(d: Draft, db: Db, m: MethodDef, template: AxisDef[]): { rec: Rec; phases: Phase[] } {
  const f = d.f;
  const n = (k: string) => num(f[k]);
  const s = (k: string) => str(f[k]).trim() || null;
  const rec: Rec = Object.fromEntries(TABS.Brews.map((c) => [c, null]));

  const grinder = db.gear.find((g) => g.id === f.grinder_id);
  const dial = grinder ? toDial(grinder) : null;
  const setting = str(f.grind_setting).trim();
  const clicks = dial && dial.dial_type !== "stepless" ? dialToClicks(setting, dial) : null;

  const pours = m.pours ? d.pours : [];
  const presses = m.presses ? d.presses : [];
  const water = m.pours ? sumWater(pours) : m.liquid === "water" ? n("water_g") : null;
  const liquid = m.liquid === "yield" ? n("yield_g") : water;
  const dose = n("dose_g");

  const dripper = m.dripper ? db.gear.find((g) => g.id === f.dripper_id) : undefined;
  const style = dripper?.style ?? null;
  const lastClosed = pours[pours.length - 1]?.valve === "closed";
  const drains = style === "immersion" || (style === "hybrid" && lastClosed);

  const cold = isIced(f, m);
  // Chilling only applies to iced drinks.
  const chill = m.chill && cold ? s("chill_method") : null;
  const iced = !!chill && ICE_CHILLS.includes(chill);
  const iceMax = iced && !!f.ice_max;
  const ice = iced && !iceMax ? n("ice_g") : null;

  const brewDate = new Date(d.date);
  const serial = toSerial(Number.isNaN(brewDate.getTime()) ? new Date() : brewDate);
  const bean = db.beans.find((b) => b.id === f.bean_id);
  // The editor can hold half-typed axes: sanitise before anything reaches the sheet.
  const raw = d.flavour ?? { axes: template, layers: [] };
  const axes = cleanAxes(raw.axes);
  const fl = { axes, layers: cleanLayers(raw.layers, axes) };

  Object.assign(rec, {
    brew_date: serial,
    method: m.id,
    bean_id: s("bean_id"),
    grinder_id: s("grinder_id"),
    grind_setting: setting || null,
    grind_clicks: clicks,
    grind_um: n("grind_um") ?? (dial ? estimateMicrons(clicks, dial) : null),
    dose_g: dose,
    water_g: water,
    yield_g: m.liquid === "yield" ? n("yield_g") : null,
    // Pour methods: measured ratio, else the target (none for ice brew, whose target is the final ratio).
    ratio: dose && liquid ? round(liquid / dose, 2) : m.ice ? null : n("ratio"),
    temp_c: n("temp_c"),
    total_s: m.time === "derived"
      ? pressTimes(presses.map((p) => ({ start: p.start_s, duration: p.duration_s }))).total
      : m.time === "none" ? null : n("total_s"),
    water_type: s("water_type"),
    iced: m.id === "coldbrew" ? null : cold,
    serve: espressoStyle(m) ? serveOf(f) : null,
    serve_iced: espressoStyle(m) ? cold : null,
    serve_water_g: espressoStyle(m) && serveOf(f) === "black" ? n("serve_water_g") : null,
    milk_drink: espressoStyle(m) && serveOf(f) === "milk" ? s("milk_drink") : null,
    milk_g: espressoStyle(m) && serveOf(f) === "milk" ? n("milk_g") : null,
    // A frozen coffee stops resting on the day it went in the freezer.
    days_off_roast: daysOffRoast(num(bean?.roast_date), Math.min(serial ?? Infinity, frozenOn(bean) ?? Infinity)),
    dripper_id: dripper ? dripper.id : null,
    paper: m.dripper ? s("paper") : null,
    drain_at_s: drains ? n("drain_at_s") : null,
    chill_method: chill,
    ice_g: ice,
    ice_max: iceMax,
    chill_start: chill ? s("chill_start") : null,
    chill_stop: chill ? s("chill_stop") : null,
    final_ratio: iced ? finalRatio(dose, liquid, ice, iceMax) : null,
    tasting_notes: s("tasting_notes"),
    // No layers = not tasted yet: leave the profile empty rather than charting zeros.
    flavour: fl.layers.length ? JSON.stringify({ axes: fl.axes, layers: fl.layers }) : null,
    taste_balance: s("taste_balance"),
    taste_strength: s("taste_strength"),
    rating: n("rating"),
    changed: s("changed"),
    notes: s("notes"),
    dialed_in: !!f.dialed_in,
  });
  if (fl.layers.length) {
    const p = profile(fl.layers, fl.axes);
    for (const a of fl.axes) rec[`f_${a.key}`] = p[a.key];
  }
  for (const fld of db.fields) {
    if (fld.method === m.id && !(fld.key in rec)) rec[fld.key] = fieldShown(fld, f) ? (f[fld.key] ?? null) : null;
  }

  const phases = [
    ...pours.map((p, i) => ({ ...strip(p), kind: "pour" as const, n: i + 1, valve: style === "hybrid" ? p.valve : ("" as const) })),
    ...presses.map((p, i) => ({ ...strip(p), kind: "press" as const, n: i + 1 })),
  ];
  return { rec, phases };
}
