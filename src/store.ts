import { cleanAxes, num } from "./calc.ts";
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

export async function saveSettings(db: Db, next: Settings): Promise<Db> {
  const prev = db.settings as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(prev[key])) {
      await sh.upsert(db.id, db.headers, "Settings", { key, value: JSON.stringify(value) }, "key");
    }
  }
  return { ...db, settings: next };
}
