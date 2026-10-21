import { DEFAULT_AXES, OLD_DEFAULT_COLOURS, cleanAxes, cleanLayers, num, profile, toSerial, type AxisDef } from "./calc.ts";
import {
  DEFAULT_FIELDS, DEFAULT_GEAR, DEFAULT_SETTINGS,
  type Gear, type MethodField, type Phase, type Rec, type Settings,
} from "./schema.ts";
import * as sh from "./sheets.ts";

export interface Db {
  id: string;
  headers: sh.Headers;
  beans: Rec[];
  gear: Gear[];
  fields: MethodField[];
  brews: Rec[];
  phases: Phase[];
  settings: Settings;
}

const str = (v: unknown) => (v == null ? "" : String(v));

const toGear = (r: Rec): Gear => ({
  id: str(r.id),
  type: (str(r.type) || "grinder") as Gear["type"],
  brand: str(r.brand),
  name: str(r.name),
  style: (str(r.style) || null) as Gear["style"],
  dial_type: (str(r.dial_type) || "clicks") as Gear["dial_type"],
  clicks_per_number: num(r.clicks_per_number),
  numbers_per_rotation: num(r.numbers_per_rotation),
  um_per_step: num(r.um_per_step),
  zero_um: num(r.zero_um),
});

const toField = (r: Rec): MethodField => ({
  method: str(r.method).trim(),
  key: str(r.key).trim(),
  label: str(r.label) || str(r.key),
  type: (["number", "text", "select", "bool", "time"].includes(str(r.type)) ? str(r.type) : "text") as MethodField["type"],
  unit: str(r.unit),
  options: str(r.options),
  show_if: str(r.show_if),
  order: num(r.order) ?? 0,
});

const toPhase = (r: Rec): Phase => ({
  brew_id: str(r.brew_id),
  kind: r.kind === "press" ? "press" : "pour",
  n: num(r.n) ?? 0,
  start_s: num(r.start_s),
  water_g: num(r.water_g),
  temp_c: num(r.temp_c),
  duration_s: num(r.duration_s),
  agitation: str(r.agitation) || "None",
  agitation_timing: str(r.agitation_timing) || "after",
  agitation_at_s: num(r.agitation_at_s),
  agitation_count: num(r.agitation_count),
  valve: r.valve === "open" || r.valve === "closed" ? r.valve : "",
  note: str(r.note),
});

/** Only known keys, and only when the stored value has the default's shape. */
function parseSettings(rows: Rec[]): Settings {
  const s: Settings = structuredClone(DEFAULT_SETTINGS);
  const target = s as unknown as Record<string, unknown>;
  for (const r of rows) {
    const k = str(r.key);
    if (!(k in s)) continue;
    try {
      const v = JSON.parse(str(r.value));
      const d = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
      if (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d) target[k] = v;
    } catch { /* hand-edited cell: keep default */ }
  }
  s.presets = s.presets.filter((p) => p && typeof p.name === "string" && typeof p.pattern === "string");
  s.axes = cleanAxes(s.axes);
  // Untouched old default template: follow the current default colours.
  const sig = s.axes.map((a) => `${a.key}${a.color.toUpperCase()}`).join();
  const isOld = OLD_DEFAULT_COLOURS.some((c) => DEFAULT_AXES.map((a, i) => `${a.key}${c[i]}`).join() === sig);
  if (isOld) s.axes = DEFAULT_AXES;
  if (!["claude", "openai", "gemini"].includes(s.ai_provider)) s.ai_provider = DEFAULT_SETTINGS.ai_provider;
  if (!["per_pour", "target"].includes(s.pour_style)) s.pour_style = DEFAULT_SETTINGS.pour_style;
  if (!["setting", "microns"].includes(s.grind_first)) s.grind_first = DEFAULT_SETTINGS.grind_first;
  if (!s.layout || typeof s.layout !== "object" || Array.isArray(s.layout)) s.layout = {};
  return s;
}

const SEED = {
  Gear: DEFAULT_GEAR as unknown as Rec[],
  Methods: DEFAULT_FIELDS as unknown as Rec[],
  Settings: Object.entries(DEFAULT_SETTINGS).map(([key, v]) => ({ key, value: JSON.stringify(v) })),
};

export async function loadDb(): Promise<Db> {
  const id = await sh.findOrCreate(SEED);
  const { headers, rows } = await sh.loadAll(id);
  return {
    id,
    headers,
    beans: rows.Beans.filter((b) => b.id),
    gear: rows.Gear.filter((g) => g.id).map(toGear),
    fields: rows.Methods.map(toField).filter((f) => f.method && f.key).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    brews: rows.Brews.filter((b) => b.id),
    phases: rows.Phases.map(toPhase).filter((p) => p.brew_id),
    settings: parseSettings(rows.Settings),
  };
}

export const newId = () => crypto.randomUUID().slice(0, 8);

export async function addBrew(db: Db, brew: Rec, phases: Phase[]): Promise<Db> {
  // Phases first: if the brew append then fails, a retry leaves harmless orphan phases, not a duplicate brew.
  const linked = phases.map((p) => ({ ...p, brew_id: String(brew.id) }));
  await sh.append(db.id, db.headers, "Phases", linked as unknown as Rec[]);
  await sh.append(db.id, db.headers, "Brews", [brew]);
  return { ...db, brews: [...db.brews, brew], phases: [...db.phases, ...linked] };
}

export async function patchBrew(db: Db, patch: Rec): Promise<Db> {
  await sh.upsert(db.id, db.headers, "Brews", patch);
  return { ...db, brews: db.brews.map((b) => (b.id === patch.id ? { ...b, ...patch } : b)) };
}

export async function saveBean(db: Db, bean: Rec): Promise<Db> {
  await sh.upsert(db.id, db.headers, "Beans", bean);
  const exists = db.beans.some((b) => b.id === bean.id);
  return { ...db, beans: exists ? db.beans.map((b) => (b.id === bean.id ? { ...b, ...bean } : b)) : [...db.beans, bean] };
}

export async function saveGear(db: Db, g: Gear): Promise<Db> {
  await sh.upsert(db.id, db.headers, "Gear", g as unknown as Rec);
  const exists = db.gear.some((x) => x.id === g.id);
  return { ...db, gear: exists ? db.gear.map((x) => (x.id === g.id ? g : x)) : [...db.gear, g] };
}

// ---------- Import ----------
// Shape: { beans: [{ ref, name, roastery, ... }], brews: [{ import_key, bean_ref, brew_date, method, ..., phases: [...] , flavour: { axes?, layers } }] }
// Beans match existing ones by name + roastery; brews with an import_key already in the sheet are skipped,
// so running the same import twice adds nothing.

const KEY = /^[a-z][a-z0-9_]{0,40}$/;
const low = (v: unknown) => str(v).trim().toLowerCase();

function cells(o: Record<string, unknown>, skip: string[]): Rec {
  const r: Rec = {};
  for (const [k, v] of Object.entries(o)) {
    if (skip.includes(k) || !KEY.test(k)) continue;
    if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") r[k] = typeof v === "string" ? v.slice(0, 2000) : v;
  }
  return r;
}
const serial = (v: unknown, fallback: number) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? toSerial(d) : fallback;
};
function flavourCells(raw: unknown, template: AxisDef[]): Rec {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as { axes?: unknown; layers?: unknown };
  const axes = o.axes ? cleanAxes(o.axes) : template;
  const layers = cleanLayers(Array.isArray(o.layers) ? o.layers : [], axes);
  if (!layers.length) return {};
  const prof = profile(layers, axes);
  return { flavour: JSON.stringify({ axes, layers }), ...Object.fromEntries(axes.map((a) => [`f_${a.key}`, prof[a.key]])) };
}

export interface ImportResult { db: Db; beans: number; brews: number; skipped: number }

export async function importData(db: Db, raw: unknown): Promise<ImportResult> {
  if (!raw || typeof raw !== "object") throw new Error("Import must be a JSON object with beans and brews.");
  const { beans = [], brews = [] } = raw as { beans?: unknown[]; brews?: unknown[] };
  if (!Array.isArray(beans) || !Array.isArray(brews)) throw new Error("beans and brews must be lists.");
  if (beans.length > 500 || brews.length > 2000) throw new Error("Import is too large.");
  const now = toSerial(new Date());

  const refs = new Map<string, string>();
  const newBeans: Rec[] = [];
  for (const b of beans as Record<string, unknown>[]) {
    if (!b || typeof b !== "object" || !str(b.name).trim()) continue;
    const found = [...db.beans, ...newBeans].find((x) => low(x.name) === low(b.name) && low(x.roastery) === low(b.roastery));
    const id = found ? str(found.id) : newId();
    if (b.ref != null) refs.set(str(b.ref), id);
    if (found) continue;
    newBeans.push({
      ...cells(b, ["ref", "id", "created", "roast_date", "flavour"]),
      id, created: now,
      ...(b.roast_date ? { roast_date: serial(b.roast_date, now) } : {}),
      ...flavourCells(b.flavour, db.settings.axes),
    });
  }

  const done = new Set(db.brews.map((x) => str(x.import_key)).filter(Boolean));
  const newBrews: Rec[] = [];
  const newPhases: Phase[] = [];
  let skipped = 0;
  for (const b of brews as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") continue;
    const key = str(b.import_key);
    if (key && done.has(key)) { skipped++; continue; }
    if (key) done.add(key);
    const id = newId();
    const beanId = b.bean_ref != null ? refs.get(str(b.bean_ref)) : str(b.bean_id) || undefined;
    newBrews.push({
      ...cells(b, ["id", "created", "brew_date", "bean_ref", "bean_id", "phases", "flavour"]),
      id, created: now, brew_date: serial(b.brew_date, now), bean_id: beanId ?? null,
      ...flavourCells(b.flavour, db.settings.axes),
    });
    const ph = Array.isArray(b.phases) ? (b.phases as Record<string, unknown>[]) : [];
    ph.forEach((p, i) => newPhases.push({ ...toPhase({ ...cells(p ?? {}, []), n: num(p?.n) ?? i + 1 }), brew_id: id }));
  }

  if (newBeans.length) await sh.append(db.id, db.headers, "Beans", newBeans);
  if (newPhases.length) await sh.append(db.id, db.headers, "Phases", newPhases as unknown as Rec[]);
  if (newBrews.length) await sh.append(db.id, db.headers, "Brews", newBrews);
  return {
    db: { ...db, beans: [...db.beans, ...newBeans], brews: [...db.brews, ...newBrews], phases: [...db.phases, ...newPhases] },
    beans: newBeans.length, brews: newBrews.length, skipped,
  };
}

export async function saveSettings(db: Db, next: Settings): Promise<Db> {
  const prev = db.settings as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(prev[key])) {
      await sh.upsert(db.id, db.headers, "Settings", { key, value: JSON.stringify(value) }, "key");
    }
  }
  return { ...db, settings: next };
}
