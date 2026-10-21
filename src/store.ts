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
  const seen = new Set<string>();
  for (const r of rows) {
    const k = str(r.key);
    if (!(k in s)) continue;
    seen.add(k);
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
  if (!["sharp", "rounded"].includes(s.radar_shape)) s.radar_shape = DEFAULT_SETTINGS.radar_shape;
  // Per-page chart styles start from the one style older sheets had.
  for (const p of ["card", "page"] as const) {
    if (!seen.has(`${p}_shape`) || !["sharp", "rounded"].includes(s[`${p}_shape`])) s[`${p}_shape`] = s.radar_shape;
    if (!seen.has(`${p}_grid`)) s[`${p}_grid`] = s.radar_grid;
  }
  if (!["radar", "blob"].includes(s.card_art)) s.card_art = DEFAULT_SETTINGS.card_art;
  if (!["radar", "blob"].includes(s.page_art)) s.page_art = DEFAULT_SETTINGS.page_art;
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
  const settings = parseSettings(rows.Settings);
  // Per-page chart styles inherited from an older sheet are written once, so they stop following radar_shape.
  const have = new Set(rows.Settings.map((r) => str(r.key)));
  for (const key of ["card_shape", "card_grid", "page_shape", "page_grid"] as const) {
    if (!have.has(key)) await sh.upsert(id, headers, "Settings", { key, value: JSON.stringify(settings[key]) }, "key");
  }
  return {
    id,
    headers,
    beans: rows.Beans.filter((b) => b.id),
    gear: rows.Gear.filter((g) => g.id).map(toGear),
    fields: rows.Methods.map(toField).filter((f) => f.method && f.key).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    brews: rows.Brews.filter((b) => b.id),
    phases: rows.Phases.map(toPhase).filter((p) => p.brew_id),
    settings,
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

/** Delete a coffee with its brews and their phases. Bean last, so a failure part way leaves it visible to retry. */
export async function deleteBean(db: Db, beanId: string): Promise<Db> {
  const brewIds = db.brews.filter((b) => b.bean_id === beanId).map((b) => String(b.id));
  await sh.deleteRows(db.id, db.headers, "Phases", "brew_id", brewIds);
  await sh.deleteRows(db.id, db.headers, "Brews", "id", brewIds);
  await sh.deleteRows(db.id, db.headers, "Beans", "id", [beanId]);
  const gone = new Set(brewIds);
  return {
    ...db,
    beans: db.beans.filter((b) => b.id !== beanId),
    brews: db.brews.filter((b) => !gone.has(String(b.id))),
    phases: db.phases.filter((p) => !gone.has(String(p.brew_id))),
  };
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
  const updated: Rec[] = [];
  for (const b of beans as Record<string, unknown>[]) {
    if (!b || typeof b !== "object" || !str(b.name).trim()) continue;
    // `match: {name, roastery}` updates an existing bean in place (e.g. renaming it to the farm).
    const m = (b.match && typeof b.match === "object" ? b.match : b) as Record<string, unknown>;
    const found = [...db.beans, ...newBeans].find((x) => low(x.name) === low(m.name) && low(x.roastery) === low(m.roastery));
    const id = found ? str(found.id) : newId();
    if (b.ref != null) refs.set(str(b.ref), id);
    if (found && b.match) {
      const patch: Rec = {
        ...cells(b, ["ref", "id", "created", "roast_date", "flavour", "match"]), id,
        ...(b.roast_date ? { roast_date: serial(b.roast_date, now) } : {}),
        ...flavourCells(b.flavour, db.settings.axes),
      };
      await sh.upsert(db.id, db.headers, "Beans", patch);
      updated.push(patch);
      continue;
    }
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
  const patchedBrews: Rec[] = [];
  let skipped = 0;
  for (const b of brews as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") continue;
    const key = str(b.import_key);
    // `update: true` patches an already imported brew (found by import_key) instead of skipping it.
    if (key && done.has(key) && b.update) {
      const cur = [...db.brews, ...newBrews].find((x) => str(x.import_key) === key);
      if (cur) {
        const beanId = b.bean_ref != null ? refs.get(str(b.bean_ref)) : undefined;
        const patch: Rec = {
          ...cells(b, ["id", "created", "bean_ref", "bean_id", "phases", "flavour", "update", "import_key"]), id: cur.id,
          ...(beanId ? { bean_id: beanId } : {}), ...flavourCells(b.flavour, db.settings.axes),
        };
        await sh.upsert(db.id, db.headers, "Brews", patch);
        patchedBrews.push(patch);
      }
      continue;
    }
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
  const merged = db.beans.map((x) => ({ ...x, ...updated.find((u) => u.id === x.id) }));
  return {
    db: {
      ...db,
      beans: [...merged, ...newBeans],
      brews: [...db.brews.map((x) => ({ ...x, ...patchedBrews.find((p) => p.id === x.id) })), ...newBrews],
      phases: [...db.phases, ...newPhases],
    },
    beans: newBeans.length + updated.length, brews: newBrews.length + patchedBrews.length, skipped,
  };
}

export async function saveSettings(db: Db, next: Settings): Promise<Db> {
  const prev = db.settings as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(prev[key])) {
      await sh.upsert(db.id, db.headers, "Settings", { key, value: JSON.stringify(value) }, "key");
    }
  }
  // Linking or unlinking an axis in the template also applies to every bean and brew with its own copy of that axis.
  const was = new Map(db.settings.axes.map((a) => [a.key, !!a.shared]));
  const flips = new Map(next.axes.filter((a) => was.has(a.key) && was.get(a.key) !== !!a.shared).map((a) => [a.key, !!a.shared]));
  if (!flips.size) return { ...db, settings: next };
  const beans = relink(db.beans, flips, next.axes);
  const brews = relink(db.brews, flips, next.axes);
  await sh.upsertMany(db.id, db.headers, "Beans", beans);
  await sh.upsertMany(db.id, db.headers, "Brews", brews);
  const merge = (all: Rec[], ps: Rec[]) => all.map((r) => ({ ...r, ...ps.find((p) => p.id === r.id) }));
  return { ...db, settings: next, beans: merge(db.beans, beans), brews: merge(db.brews, brews) };
}

/** Flavour cells for records whose own axes need the new link state; a newly linked axis takes the first note's value. */
function relink(recs: Rec[], flips: Map<string, boolean>, template: AxisDef[]): Rec[] {
  const out: Rec[] = [];
  for (const r of recs) {
    let o: { axes?: unknown; layers?: unknown };
    try { o = JSON.parse(str(r.flavour)); } catch { continue; }
    if (!o?.axes) continue; // no own axes: already follows the template
    const own = cleanAxes(o.axes);
    if (!own.some((a) => flips.has(a.key) && flips.get(a.key) !== !!a.shared)) continue;
    const axes = own.map((a) => (flips.has(a.key) ? { ...a, shared: flips.get(a.key) } : a));
    const layers = cleanLayers(o.layers ?? [], axes);
    const on = [...flips].filter(([k, s]) => s && axes.some((a) => a.key === k)).map(([k]) => k);
    const v0 = layers[0]?.v ?? {};
    const cells = flavourCells({ axes, layers: layers.map((l) => ({ ...l, v: { ...l.v, ...Object.fromEntries(on.map((k) => [k, v0[k] ?? l.v[k]])) } })) }, template);
    if (cells.flavour) out.push({ id: r.id, ...cells });
  }
  return out;
}
