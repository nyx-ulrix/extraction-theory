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
    "variety", "process", "roast_level", "roast_date", "roaster_notes", "finished", "dialed", ...F_COLS,
  ],
  Gear: ["id", "type", "brand", "name", "style", "dial_type", "clicks_per_number", "numbers_per_rotation", "um_per_step", "zero_um"],
  Methods: ["method", "key", "label", "type", "unit", "options", "show_if", "order"],
  Brews: [
    "id", "created", "brew_date", "method", "bean_id", "grinder_id", "grind_setting", "grind_clicks", "grind_um",
    "dose_g", "water_g", "yield_g", "ratio", "temp_c", "total_s", "water_type", "days_off_roast",
    "dripper_id", "paper", "drain_at_s",
    "chill_method", "ice_g", "ice_max", "chill_start", "chill_stop", "final_ratio", "serve", "serve_iced", "serve_water_g", "milk_drink", "milk_g",
    "tasting_notes", ...F_COLS, "taste_balance", "taste_strength", "rating", "changed", "notes", "dialed_in",
  ],
  Phases: ["brew_id", "kind", "n", "start_s", "water_g", "temp_c", "duration_s", "agitation", "agitation_timing", "agitation_at_s", "agitation_count", "valve", "note"],
  Settings: ["key", "value"],
} as const;
export type Tab = keyof typeof TABS;
export const TAB_NAMES = Object.keys(TABS) as Tab[];

/** Columns written as Sheets date serials. */
export const DATE_COLS: Partial<Record<Tab, Record<string, string>>> = {
  Beans: { created: "yyyy-mm-dd hh:mm", roast_date: "yyyy-mm-dd" },
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
    ["preinfusion_s", "Preinfusion", "number", "s"],
    ["pressure", "Pressure / profile", "text", "bar"],
    ["basket", "Basket", "text"],
    ["puck_prep", "Puck prep", "text"],
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
  /** Spider chart style: sharp polygons, or rounded shapes like the cup fingerprint art. */
  radar_shape: "sharp" | "rounded";
  /** Show the rings and spokes behind the spider chart. */
  radar_grid: boolean;
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
  card_art: "radar",
  page_art: "radar",
};

/**
 * Brew form sections. Method-specific fields from the Methods tab are laid out by
 * their own `key` alongside these.
 */
export const SECTIONS: Record<string, string> = {
  bean: "Bean and date",
  grind: "Grind",
  recipe: "Dose, ratio, temp, time",
  water_type: "Water used",
  milk: "Serve (espresso, black or milk)",
  dripper: "Dripper and paper",
  pours: "Pour phases",
  presses: "Press phases",
  chill: "Chilling",
  taste: "Tasting notes and radar",
  rating: "Rating and taste direction",
  notes: "What changed and notes",
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

/** Saved layout filtered to what the method can show; required sections are always kept. */
export function layoutFor(m: MethodDef, fields: MethodField[], s: Settings): string[] {
  const avail = availableKeys(m, fields);
  const saved = s.layout[m.id]?.filter((k) => avail.includes(k));
  const keys = saved?.length ? saved : avail;
  const required = ["bean", "recipe", ...(m.chill === "required" ? ["chill"] : [])];
  return [...required.filter((k) => !keys.includes(k)), ...keys];
}

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
