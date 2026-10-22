import { DEFAULT_AXES, type AxisDef, type DialType } from "./calc.ts";

export const SHEET_TITLE = "Extraction Theory";

export type Cell = string | number | boolean | null;
export type Rec = Record<string, Cell | undefined>;

// `flavour` holds JSON {axes, layers} (see calc.Flavour). `f_<axis key>` holds the overall
// profile per axis so the sheet can be charted; custom axes add their own f_ columns.
const F_COLS = [...DEFAULT_AXES.map((a) => `f_${a.key}`), "flavour"];

// Column order for a new sheet. Existing sheets are matched by header name.
export const TABS = {
  Beans: [
    "id", "created", "name", "product", "roastery", "origin", "farm", "altitude_low_m", "altitude_high_m",
    "variety", "process", "roast_level", "roast_date", "frozen", "frozen_date", "roaster_notes", "finished", "dialed", ...F_COLS,
  ],
  Gear: ["id", "type", "brand", "name", "style", "dial_type", "clicks_per_number", "numbers_per_rotation", "um_per_step", "zero_um"],
  Methods: ["method", "key", "label", "type", "unit", "options", "show_if", "order"],
  Brews: [
    "id", "created", "brew_date", "method", "bean_id", "grinder_id", "grind_setting", "grind_clicks", "grind_um",
    "dose_g", "water_g", "yield_g", "ratio", "temp_c", "total_s", "water_type", "water_gh_ppm", "water_kh_ppm", "water_tds_ppm", "days_off_roast",
    "tds_pct", "beverage_g", "ey_pct", "rdt", "grinder_rpm",
    "dripper_id", "paper", "drain_at_s",
    "iced", "chill_method", "ice_g", "ice_max", "chill_start", "chill_stop", "final_ratio", "serve", "serve_iced", "serve_water_g", "milk_drink", "milk_g",
    "tasting_notes", ...F_COLS, "taste_balance", "taste_strength", "astringency", "rating", "changed", "notes", "dialed_in",
  ],
  Phases: ["brew_id", "kind", "n", "start_s", "water_g", "temp_c", "duration_s", "agitation", "agitation_timing", "agitation_at_s", "agitation_count", "valve", "note"],
  Settings: ["key", "value"],
} as const;
export type Tab = keyof typeof TABS;
export const TAB_NAMES = Object.keys(TABS) as Tab[];

/** Columns written as Sheets date serials. */
export const DATE_COLS: Partial<Record<Tab, Record<string, string>>> = {
  Beans: { created: "yyyy-mm-dd hh:mm", roast_date: "yyyy-mm-dd", frozen_date: "yyyy-mm-dd" },
  Brews: { created: "yyyy-mm-dd hh:mm", brew_date: "yyyy-mm-dd hh:mm" },
};

export type DripperStyle = "immersion" | "hybrid" | "percolation";
export interface Gear {
  id: string;
  type: "grinder" | "dripper" | "paper";
  brand?: string;
  name: string;
  style?: DripperStyle | null;
  dial_type?: DialType | null;
  clicks_per_number?: number | null;
  numbers_per_rotation?: number | null;
  um_per_step?: number | null;
  zero_um?: number | null;
}

export type FieldType = "number" | "text" | "select" | "bool" | "time";
export interface MethodField {
  method: string;
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string; // pipe separated
  show_if?: string; // key=value
  order?: number;
}

export interface MethodDef {
  id: string;
  label: string;
  liquid: "yield" | "water";
  pours?: boolean;
  presses?: boolean;
  dripper?: boolean;
  chill?: "optional" | "required";
  ice?: boolean;
  tempLabel: string;
  time: "total" | "shot" | "none" | "derived";
}

export const BUILTIN_METHODS: MethodDef[] = [
  { id: "espresso", label: "Espresso", liquid: "yield", chill: "optional", tempLabel: "Water temp", time: "shot" },
  { id: "filter", label: "Filter", liquid: "water", pours: true, dripper: true, chill: "optional", tempLabel: "Water temp", time: "total" },
  { id: "ice", label: "Ice brew", liquid: "water", pours: true, dripper: true, chill: "required", ice: true, tempLabel: "Water temp", time: "total" },
  { id: "coldbrew", label: "Cold brew", liquid: "water", tempLabel: "Starting steep temp", time: "none" },
  { id: "moka", label: "Moka Pot", liquid: "water", tempLabel: "Water temp", time: "total" },
  { id: "aeropress", label: "Aeropress", liquid: "water", pours: true, presses: true, tempLabel: "Water temp", time: "derived" },
];

/** Methods tab rows not in BUILTIN_METHODS become custom modes with a plain water ratio. */
export function methodDefs(fields: MethodField[]): MethodDef[] {
  const known = new Set(BUILTIN_METHODS.map((m) => m.id));
  const custom = [...new Set(fields.map((f) => f.method))]
    .filter((m) => m && !known.has(m))
    .map((m): MethodDef => ({ id: m, label: m, liquid: "water", tempLabel: "Water temp", time: "total" }));
  return [...BUILTIN_METHODS, ...custom];
}

const mf = (method: string, rows: [string, string, FieldType, string?, string?, string?][]): MethodField[] =>
  rows.map(([key, label, type, unit, options, show_if], i) => ({ method, key, label, type, unit, options, show_if, order: i }));

export const DEFAULT_FIELDS: MethodField[] = [
  ...mf("espresso", [
    ["presoak_s", "Pre-soak", "number", "s"],
    ["hold_s", "Hold", "number", "s"],
    ["pressure", "Pressure / profile", "text", "bar"],
    ["basket", "Basket", "text"],
    ["puck_prep", "Puck prep", "text"],
    ["first_drop_s", "First drops", "time"],
    ["preinfusion_bar", "Pre-infusion pressure", "number", "bar"],
    ["peak_bar", "Peak pressure", "number", "bar"],
    ["tamp", "Tamp", "select", "", "Manual|Levelling|Calibrated"],
    ["puck_screen", "Puck screen", "bool"],
    ["wdt", "WDT", "bool"],
  ]),
  ...mf("coldbrew", [
    ["cb_method", "Method", "select", "", "Immersion|Slow drip"],
    ["steep_location", "Steep location", "select", "", "Fridge|Room"],
    ["steep_h", "Steep time", "number", "h"],
    ["drip_rate", "Drip rate", "number", "drops / 10 s", "", "cb_method=Slow drip"],
    ["cb_filter", "Filter", "text"],
    ["dilution", "Dilution (concentrate : water)", "text"],
  ]),
  ...mf("moka", [
    ["pot_size", "Pot size", "number", "cups"],
    ["starting_water", "Starting water", "select", "", "Preheated|Cold"],
    ["heat_level", "Heat level", "text"],
    ["first_flow_s", "Time to first flow", "time"],
    ["off_heat", "Taken off heat", "select", "", "At first sputter|Before sputter"],
    ["base_cooled", "Base cooled after brewing", "bool"],
  ]),
  ...mf("aeropress", [
    ["orientation", "Orientation", "select", "", "Standard|Inverted"],
    ["ap_filter", "Filter", "select", "", "Paper x1|Paper x2|Metal"],
    ["accessory", "Cap accessory", "text"],
    ["bypass_g", "Bypass water", "number", "g"],
  ]),
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const grinder = (brand: string, name: string, dial_type: DialType, um: number | null, cpn: number | null = null, npr: number | null = null): Gear => ({
  id: `g-${slug(brand + " " + name)}`, type: "grinder", brand, name, dial_type,
  // Every seeded dial counts from burrs touching, so setting 0 is 0 microns.
  clicks_per_number: cpn, numbers_per_rotation: npr, um_per_step: um, zero_um: dial_type === "stepless" ? null : 0,
});
const dripper = (name: string, style: DripperStyle): Gear => ({ id: `d-${slug(name)}`, type: "dripper", name, style });
const paper = (name: string): Gear => ({ id: `p-${slug(name)}`, type: "paper", name });

// um per step: 1Zpresso from its official grind-setting table; Comandante from widely quoted
// retailer figures. Timemore left blank: only unsourced or conflicting third-party numbers exist.
export const DEFAULT_GEAR: Gear[] = [
  grinder("Comandante", "C40 MK4", "clicks", 30),
  grinder("Comandante", "C40 MK3", "clicks", 30),
  grinder("Comandante", "C40 + Red Clix", "clicks", 15),
  grinder("1Zpresso", "J-Ultra", "rotation", 8, 10, 10),
  grinder("1Zpresso", "J-Max", "rotation", 8.8, 10, 9),
  grinder("1Zpresso", "JX-Pro", "rotation", 12.5, 4, 10),
  grinder("1Zpresso", "JX", "rotation", 25, 3, 10),
  grinder("1Zpresso", "K-Ultra", "rotation", 20, 10, 10),
  grinder("1Zpresso", "K-Max", "rotation", 22, 10, 9),
  grinder("1Zpresso", "K-Plus", "rotation", 22, 10, 9),
  grinder("1Zpresso", "K-Pro", "rotation", 22, 10, 9),
  grinder("1Zpresso", "ZP6 Special", "rotation", 22, 10, 9),
  grinder("1Zpresso", "X-Ultra", "rotation", 12.5, 10, 6),
  grinder("1Zpresso", "X-Pro", "rotation", 12.5, 10, 6),
  grinder("1Zpresso", "Q2", "rotation", 25, 3, 10),
  grinder("1Zpresso", "Q Air", "rotation", 25, 3, 10),
  grinder("Timemore", "Chestnut C2", "clicks", null),
  grinder("Timemore", "Chestnut C3", "clicks", null),
  grinder("Timemore", "Chestnut C3S", "clicks", null),
  grinder("Timemore", "Chestnut C3 ESP Pro", "clicks", null),
  grinder("Timemore", "Chestnut S3", "clicks", null),
  grinder("Timemore", "Sculptor 064", "stepless", null),
  grinder("Timemore", "Sculptor 078", "stepless", null),
  ...["Hario V60", "Kalita Wave", "Origami", "Chemex", "April", "Orea", "Melitta", "Kono"].map((n) => dripper(n, "percolation")),
  ...["Hario Switch", "NextLevel Pulsar", "Orea Switch"].map((n) => dripper(n, "hybrid")),
  dripper("Clever Dripper", "immersion"),
  ...["Hario V60 tabbed", "Cafec Abaca", "Sibarist FAST", "Kalita Wave 185", "Chemex bonded", "Origami cone"].map(paper),
];

export interface Preset { name: string; pattern: string }
export interface Settings {
  pour_style: "per_pour" | "target";
  grind_first: "setting" | "microns";
  presets: Preset[];
  ai_provider: "claude" | "openai" | "gemini";
  ai_model: string;
  /** Radar axis template for new beans and brews. Each bean or brew can override it. */
  axes: AxisDef[];
  /** Per method: ordered list of visible section / field keys. Missing method = defaultLayout(). */
  layout: Record<string, string[]>;
  /** Spider chart style on brews and editors: sharp polygons, or rounded shapes like the cup fingerprint art. */
  radar_shape: "sharp" | "rounded";
  /** Show the rings and spokes behind the spider chart on brews and editors. */
  radar_grid: boolean;
  /** Same two choices for the Home and Library cards, and for a coffee's own page. */
  card_shape: "sharp" | "rounded";
  card_grid: boolean;
  page_shape: "sharp" | "rounded";
  page_grid: boolean;
  /** Grinder ids the user owns: the brew form lists only these, and the first is the default. Empty = all. */
  my_grinders: string[];
  /** Filter papers the user has: listed first in the brew form, after papers they've actually used. */
  my_papers: string[];
  /** Optional sections and method fields switched off everywhere (Settings, Brew form). Required ones always show. */
  hidden: string[];
  /** Basic shows the essentials for each method; advanced shows what is ticked in Settings, Brew form. */
  brew_mode: "basic" | "advanced" | "pretentious";
  /** When stepped down from Pretentious (ms since epoch), it stays locked for 24 hours after. */
  pretentious_lock: number;
  /** Saved recipes: a method and its recipe (no coffee, date or verdict), loaded into the brew form by name. */
  recipes: Recipe[];
  /** Art on Home and Library cards: the spider chart, or the blob (fingerprint shapes only). */
  card_art: "radar" | "blob";
  /** Chart on a coffee's own page, chosen apart from the card art. */
  page_art: "radar" | "blob";
}
export const DEFAULT_SETTINGS: Settings = {
  pour_style: "per_pour",
  grind_first: "setting",
  presets: [
    { name: "4:6 Kasuya", pattern: "2:2:2:2:2" },
    { name: "1:2:3:3", pattern: "1:2:3:3" },
    { name: "Even thirds", pattern: "1:1:1" },
  ],
  ai_provider: "claude",
  ai_model: "",
  axes: DEFAULT_AXES,
  layout: {},
  radar_shape: "sharp",
  radar_grid: true,
  card_shape: "sharp",
  card_grid: true,
  page_shape: "sharp",
  page_grid: true,
  card_art: "radar",
  page_art: "radar",
  my_grinders: [],
  my_papers: [],
  hidden: [],
  brew_mode: "basic",
  pretentious_lock: 0,
  recipes: [],
};

/**
 * Brew form sections. Method-specific fields from the Methods tab are laid out by
 * their own `key` alongside these.
 */
export const SECTIONS: Record<string, string> = {
  bean: "Bean and date",
  grind: "Grind",
  recipe: "Recipe",
  water_type: "Water used",
  milk: "Black or milk (espresso and moka)",
  dripper: "Dripper and paper",
  pours: "Pour phases",
  presses: "Press phases",
  chill: "Chilling",
  taste: "Tasting notes",
  rating: "Rating and what changed",
  notes: "What changed (shown with rating)",
};

/** Sections a method can show at all, in default order, with its Methods-tab fields after recipe. */
export function availableKeys(m: MethodDef, fields: MethodField[]): string[] {
  const own = fields.filter((f) => f.method === m.id).map((f) => f.key);
  return [
    "bean", "grind", "recipe", ...own, "water_type", "milk",
    ...(m.dripper ? ["dripper"] : []),
    ...(m.pours ? ["pours"] : []),
    ...(m.presses ? ["presses"] : []),
    ...(m.chill ? ["chill"] : []),
    "taste", "rating", "notes",
  ];
}

/**
 * Basic mode: the few things that move a cup. Filter: grind, dose and ratio, temperature, pours, dripper and paper.
 * Espresso: grind, temperature and ratio. Every method keeps the bean and the verdict (rating and what changed).
 */
const BASIC: Record<string, string[]> = {
  espresso: ["bean", "grind", "recipe", "rating"],
  moka: ["bean", "grind", "recipe", "rating"],
  filter: ["bean", "grind", "recipe", "dripper", "pours", "rating"],
  ice: ["bean", "grind", "recipe", "dripper", "pours", "chill", "rating"],
  coldbrew: ["bean", "grind", "recipe", "rating"],
  aeropress: ["bean", "grind", "recipe", "presses", "rating"],
};
const BASIC_OTHER = ["bean", "grind", "recipe", "rating"];

/** Saved layout filtered to what the method can show; required sections are always kept. */
export function layoutFor(m: MethodDef, fields: MethodField[], s: Settings): string[] {
  const avail = availableKeys(m, fields);
  // Preinfusion became pre-soak and hold: a saved layout keeps its place for them.
  const saved = s.layout[m.id]?.flatMap((k) => (k === "preinfusion_s" ? ["presoak_s", "hold_s"] : [k])).filter((k) => avail.includes(k));
  const required = ["bean", "recipe", ...(m.chill === "required" ? ["chill"] : [])];
  if (s.brew_mode === "basic") return (BASIC[m.id] ?? BASIC_OTHER).filter((k) => avail.includes(k));
  // Pretentious: everything, in the saved order, whatever was switched off.
  if (s.brew_mode === "pretentious") return [...(saved?.length ? saved : []), ...avail.filter((k) => !saved?.includes(k))];
  const keys = (saved?.length ? saved : avail).filter((k) => required.includes(k) || !s.hidden.includes(k));
  return [...required.filter((k) => !keys.includes(k)), ...keys];
}

export interface Recipe { name: string; method: string; f: Rec; pours: Phase[]; presses: Phase[] }

/** Sections that can be switched off for every method (the rest are the core of a brew). */
export const OPTIONAL_SECTIONS: [string, string][] = [
  ["grind", "Grind"], ["total_s", "Brew time"], ["water_type", "Water used"], ["milk", "Black or milk"], ["dripper", "Dripper and paper"],
  ["pours", "Pour phases"], ["pour_time", "Pour durations"], ["presses", "Press phases"], ["chill", "Chilling (iced drinks)"],
  ["extraction", "TDS and extraction yield"], ["rdt", "RDT and grinder RPM"], ["taste", "Tasting notes"], ["rating", "Rating and what changed"],
  ["astringency", "Astringency"],
];

/** Whether an optional variable shows: never for normal humans, always when pretentious, as ticked for snobs. */
export const shows = (s: Settings, key: string) =>
  s.brew_mode === "pretentious" || (s.brew_mode === "advanced" && !s.hidden.includes(key));

/** Starting numbers, shown as placeholders on a first brew. */
export const STARTS: Record<string, { dose?: number; liquid?: number; ratio?: number; temp?: number }> = {
  espresso: { dose: 18, liquid: 36, ratio: 2, temp: 93 },
  filter: { dose: 15, ratio: 16, temp: 93 },
  ice: { dose: 20, ratio: 16, temp: 93 },
  aeropress: { dose: 15, liquid: 225, ratio: 15, temp: 90 },
  coldbrew: { dose: 50, liquid: 400, ratio: 8, temp: 20 },
  moka: { dose: 15, temp: 70 },
};

export const AGITATIONS = ["None", "Swirl", "Stir", "Rao spin", "Tap"];
export const AGITATION_TIMING = [
  ["before", "Before pour"],
  ["during", "During pour"],
  ["after", "After pour"],
  ["at", "At time"],
] as const;
// "Dirty" = espresso over cold milk, no ice.
export const MILK_DRINKS = ["Dirty", "Cold milk", "Cold milk with ice", "Flat white", "Latte", "Cappuccino"];
export const MILK_DEFAULT_G: Record<string, number> = { Dirty: 75 };
/** Body of the cup, stored in the taste_strength column. Older brews said weak / balanced / strong. */
export const BODY_LEVELS: [string, string][] = [["low", "Low"], ["medium_low", "Medium low"], ["mid", "Mid"], ["medium_high", "Medium high"], ["high", "High"]];
const OLD_BODY: Record<string, string> = { weak: "low", balanced: "mid", strong: "high" };
export const bodyLevel = (v: unknown) => OLD_BODY[String(v ?? "")] ?? String(v ?? "");
export const bodyLabel = (v: unknown) => BODY_LEVELS.find(([k]) => k === bodyLevel(v))?.[1] ?? "";
/** Freeze date of a frozen coffee, if set: its rest stops counting on that day. */
export const frozenOn = (bean: Rec | undefined): number | null => {
  if (!bean || !(bean.frozen === true || String(bean.frozen).toLowerCase() === "true")) return null;
  const n = typeof bean.frozen_date === "number" ? bean.frozen_date : Number(bean.frozen_date);
  return Number.isFinite(n) && bean.frozen_date !== "" && bean.frozen_date != null ? n : null;
};
export const CHILL_METHODS =["Ice drip", "Hyperchiller", "Shaken"];
export const PROCESSES = ["Washed", "Natural", "Honey", "Anaerobic", "Carbonic maceration", "Wet hulled"];
export const ROAST_LEVELS = ["Super light", "Light", "Medium light", "Medium", "Medium dark", "Dark"];

export interface Phase {
  brew_id?: string;
  kind: "pour" | "press";
  n: number;
  start_s: number | null;
  water_g: number | null;
  temp_c: number | null;
  duration_s: number | null;
  agitation: string;
  agitation_timing: string;
  agitation_at_s: number | null;
  agitation_count: number | null;
  valve: "open" | "closed" | "";
  note: string;
}
export const newPhase = (kind: Phase["kind"], n: number): Phase => ({
  kind, n, start_s: null, water_g: null, temp_c: null, duration_s: null,
  agitation: "None", agitation_timing: "after", agitation_at_s: null, agitation_count: null, valve: "", note: "",
});
