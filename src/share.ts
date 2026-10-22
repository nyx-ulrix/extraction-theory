// Share a coffee and a recommended recipe as a link (and so a QR code). Everything rides in the URL's
// #fragment, which browsers never send to a server: deflated JSON in base64url. Nothing is stored online.
import { cleanAxes, cleanLayers, defuse, num, profile, toSerial } from "./calc.ts";
import { str, toRecipe, editDraft } from "./brew.ts";
import { methodDefs, newPhase, TABS, type Phase, type Rec, type Recipe } from "./schema.ts";
import type { Db } from "./store.ts";

/** Bean columns a share carries. Personal ones (finished, dialed, frozen) stay home. */
const BEAN_KEYS = [
  "name", "product", "roastery", "origin", "farm", "altitude_low_m", "altitude_high_m",
  "variety", "process", "roast_level", "roast_date", "roaster_notes", "flavour",
];
const PHASE_KEYS = ["kind", "n", "start_s", "water_g", "temp_c", "duration_s", "agitation", "agitation_timing", "agitation_at_s", "agitation_count", "valve", "note"];
// Never in a shared recipe: identity, the coffee, and anything about one cup.
const NOT_SHARED = new Set(["id", "created", "brew_date", "bean_id", "grinder_id", "dripper_id", "days_off_roast", "grind_clicks", "import_key"]);

export interface Shared {
  bean: Rec;
  recipe: (Recipe & { grinder?: string; dripper?: string }) | null;
}

const gearName = (db: Db, id: unknown) => {
  const g = db.gear.find((x) => x.id === id);
  return g ? [g.brand, g.name].filter(Boolean).join(" ") : undefined;
};

/** A recommended recipe from a logged brew, with gear by name so it means something on another account. */
export function recipeFromBrew(db: Db, brew: Rec, name: string): Shared["recipe"] {
  const r = toRecipe(editDraft(db, brew, str(brew.method)), name);
  return { ...r, grinder: gearName(db, brew.grinder_id), dripper: gearName(db, brew.dripper_id) };
}
export function recipeFromSaved(db: Db, r: Recipe): Shared["recipe"] {
  return { ...r, grinder: gearName(db, r.f.grinder_id), dripper: gearName(db, r.f.dripper_id) };
}

/** What goes in the link: the bean's facts, optionally without its roast date or flavour chart. */
export function makeShare(bean: Rec, recipe: Shared["recipe"], o: { roast: boolean; flavour: boolean }): Shared {
  const b: Rec = {};
  for (const k of BEAN_KEYS) {
    if ((k === "roast_date" && !o.roast) || (k === "flavour" && !o.flavour)) continue;
    const v = k === "roaster_notes" && typeof bean[k] === "string" ? (bean[k] as string).slice(0, 300) : bean[k];
    if (v != null && v !== "") b[k] = v;
  }
  if (!recipe) return { bean: b, recipe: null };
  const f = Object.fromEntries(Object.entries(recipe.f).filter(([k, v]) => !NOT_SHARED.has(k) && v != null && v !== "" && v !== false));
  const phase = (p: Phase) => Object.fromEntries(PHASE_KEYS.map((k) => [k, p[k as keyof Phase]]).filter(([, v]) => v != null && v !== "")) as unknown as Phase;
  return { bean: b, recipe: { ...recipe, f, pours: recipe.pours.map(phase), presses: recipe.presses.map(phase) } };
}

const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(t)).arrayBuffer());
}

// Wire format: short keys, pours as tuples and the chart as arrays, so the code (and the QR) stays small.
const SHORT: Record<string, string> = {
  name: "n", product: "p", roastery: "r", origin: "o", farm: "fa", altitude_low_m: "al", altitude_high_m: "ah", variety: "va",
  process: "pr", roast_level: "rl", roast_date: "rd", roaster_notes: "no", dose_g: "d", water_g: "w", yield_g: "y", ratio: "ra",
  temp_c: "t", total_s: "s", grind_setting: "gs", grind_um: "gu", water_type: "wt", paper: "pa", final_ratio: "fr", ice_g: "ig",
};
const LONG = Object.fromEntries(Object.entries(SHORT).map(([k, v]) => [v, k]));
const rename = (o: unknown, map: Record<string, string>) =>
  o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [map[k] ?? k, v])) : {};
const TUPLE = ["start_s", "water_g", "temp_c", "duration_s", "agitation", "agitation_timing", "agitation_at_s", "agitation_count", "valve"];
const toTuple = (p: Phase) => {
  const t = TUPLE.map((k) => { const v = p[k as keyof Phase]; return v === "" || v === "None" || (k === "agitation_timing" && v === "after") ? null : v ?? null; });
  while (t.length && t[t.length - 1] == null) t.pop();
  return t;
};
const fromTuple = (t: unknown) => (Array.isArray(t) ? Object.fromEntries(TUPLE.map((k, i) => [k, t[i] ?? null])) : {});
type Chart = { axes: { key: string; label: string; color: string; shared?: boolean }[]; layers: { note: string; color: string; v: Record<string, number> }[] };
function packFlavour(cell: unknown): unknown {
  try {
    const o = JSON.parse(str(cell)) as Chart;
    const c = (h: string) => h.replace(/^#/, "");
    return [o.axes.map((a) => [a.key, a.label, c(a.color), a.shared ? 1 : 0]), o.layers.map((l) => [l.note, c(l.color), o.axes.map((a) => Math.round((l.v[a.key] ?? 0) * 10) / 10)])];
  } catch { return undefined; }
}
function unpackFlavour(x: unknown): string | undefined {
  if (!Array.isArray(x) || !Array.isArray(x[0]) || !Array.isArray(x[1])) return undefined;
  const c = (h: unknown) => `#${str(h).replace(/^#/, "")}`;
  const axes = (x[0] as unknown[][]).slice(0, 12).filter(Array.isArray)
    .map((a) => ({ key: str(a[0]).slice(0, 30), label: str(a[1]).slice(0, 24), color: c(a[2]).slice(0, 7), shared: a[3] === 1 }));
  const layers = (x[1] as unknown[][]).slice(0, 24).filter(Array.isArray).map((l) => ({
    note: str(l[0]).slice(0, 40), color: c(l[1]).slice(0, 7),
    v: Object.fromEntries(axes.map((a, i) => [a.key, Number((Array.isArray(l[2]) ? l[2] : [])[i]) || 0])),
  }));
  return JSON.stringify({ axes, layers });
}

const layerNotes = (flavour: unknown) => {
  try { return (JSON.parse(str(flavour)).layers as { note: string }[]).map((l) => l.note).join(", "); } catch { return ""; }
};

export async function encodeShare(s: Shared): Promise<string> {
  const { flavour, ...bean } = s.bean;
  if (str(bean.product) === str(bean.name)) delete bean.product;
  if (flavour && str(bean.roaster_notes).toLowerCase() === layerNotes(flavour).toLowerCase()) delete bean.roaster_notes;
  const r = s.recipe;
  const wire = {
    v: 2,
    b: rename(bean, SHORT),
    ...(flavour ? { fl: packFlavour(flavour) } : {}),
    ...(r ? {
      m: r.method, f: rename(r.f, SHORT), p: r.pours.map(toTuple),
      ...(r.presses.some((x) => x.start_s != null || x.duration_s != null) ? { x: r.presses.map(toTuple) } : {}),
      ...(r.grinder ? { g: r.grinder } : {}), ...(r.dripper ? { dr: r.dripper } : {}),
    } : {}),
  };
  return toB64(await pipe(new TextEncoder().encode(JSON.stringify(wire)), new CompressionStream("deflate-raw")));
}
export const shareUrl = (code: string) => `${location.origin}/#s=${code}`;

// A shared code is someone else's data: keep only short plain values under known-looking keys.
const plain = (v: unknown, max = 300): string | number | boolean | null =>
  typeof v === "string" ? defuse(v.slice(0, max)) : typeof v === "number" && Number.isFinite(v) ? v : typeof v === "boolean" ? v : null;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
function clean(o: unknown, keys?: string[], max = 300): Rec {
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  const out: Rec = {};
  for (const [k, v] of Object.entries(o).slice(0, 80)) {
    if (!KEY.test(k) || (keys && !keys.includes(k))) continue;
    const c = plain(v, max);
    if (c != null) out[k] = c as Rec[string];
  }
  return out;
}

/** Decode and sanitise a code. Throws on anything that isn't an Extraction Theory share. */
export async function decodeShare(code: string, db: Db): Promise<Shared> {
  if (!/^[\w-]{8,4000}$/.test(code)) throw new Error("bad code");
  const o = JSON.parse(new TextDecoder().decode(await pipe(fromB64(code), new DecompressionStream("deflate-raw"))));
  if (o?.v !== 2 || !o.b) throw new Error("bad code");
  const bean = clean(rename(o.b, LONG), BEAN_KEYS, 1000);
  const flavour = unpackFlavour(o.fl);
  if (flavour) bean.flavour = flavour;
  if (flavour && !str(bean.roaster_notes)) bean.roaster_notes = defuse(layerNotes(flavour).slice(0, 1000)) || null;
  if (!str(bean.name).trim()) throw new Error("bad code");
  let recipe: Shared["recipe"] = null;
  if (typeof o.m === "string" && methodDefs(db.fields).some((m) => m.id === o.m)) {
    const allowed = [...TABS.Brews, ...db.fields.filter((x) => x.method === o.m).map((x) => x.key)];
    const f = clean(rename(o.f, LONG), allowed);
    for (const k of NOT_SHARED) delete f[k];
    const phases = (a: unknown, kind: Phase["kind"]) => (Array.isArray(a) ? a.slice(0, 20) : [])
      .map((t, i) => ({ ...newPhase(kind, i + 1), ...clean(fromTuple(t), PHASE_KEYS), kind, n: i + 1 }) as Phase);
    const presses = phases(o.x, "press");
    recipe = {
      name: [bean.roastery, bean.name].map(str).filter(Boolean).join(" ").slice(0, 40), method: o.m, f,
      pours: phases(o.p, "pour"), presses: presses.length ? presses : [newPhase("press", 1)],
      grinder: typeof o.g === "string" ? o.g.slice(0, 80) : undefined,
      dripper: typeof o.dr === "string" ? o.dr.slice(0, 80) : undefined,
    };
  }
  return { bean, recipe };
}

/** A code from a pasted link, a scanned QR text, or the bare code. */
export function codeFrom(text: string): string | null {
  const m = text.trim().match(/[#&]s=([\w-]+)/);
  if (m) return m[1];
  return /^[\w-]{8,4000}$/.test(text.trim()) ? text.trim() : null;
}

const norm = (s: unknown) => str(s).trim().toLowerCase();
/** The same coffee already in the library: same name and roastery. */
export const sameBean = (db: Db, b: Rec) =>
  db.beans.find((x) => norm(x.name) === norm(b.name) && norm(x.roastery) === norm(b.roastery));

/** The shared coffee as a new bean row, its chart sanitised and profile columns filled. */
export function beanRow(b: Rec, axesFallback: Parameters<typeof cleanAxes>[0], id: string): Rec {
  const row: Rec = { ...b, id, created: toSerial(new Date()) };
  try {
    const o = JSON.parse(str(b.flavour));
    const axes = cleanAxes(o?.axes ?? axesFallback);
    const layers = cleanLayers(o?.layers ?? [], axes);
    row.flavour = JSON.stringify({ axes, layers });
    for (const [k, v] of Object.entries(profile(layers, axes))) row[`f_${k}`] = v;
  } catch {
    delete row.flavour;
  }
  if (num(row.roast_date) == null) delete row.roast_date;
  return row;
}

/** The shared recipe as a saved recipe for this account: gear matched by name, tied to the bean. */
export function savedRecipe(db: Db, r: NonNullable<Shared["recipe"]>, beanId: string, name: string): Recipe {
  const byName = (type: string, n?: string) => n ? db.gear.find((g) => g.type === type && norm([g.brand, g.name].filter(Boolean).join(" ")) === norm(n))?.id : undefined;
  const f: Rec = { ...r.f };
  const grinder = byName("grinder", r.grinder), dripper = byName("dripper", r.dripper);
  if (grinder) f.grinder_id = grinder;
  if (dripper) f.dripper_id = dripper;
  return { name: name.slice(0, 40), method: r.method, f, pours: r.pours, presses: r.presses, bean: beanId };
}
