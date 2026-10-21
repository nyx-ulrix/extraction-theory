// The 64-colour palette from the Caffalyst brief. Tasting-note layers are coloured from it,
// either by the AI colour picker or, without AI, by a stable hash of the note name.

export const PALETTE: [name: string, hex: string][] = [
  ["Paper White", "#FFFFFF"], ["Warm Off-White", "#FAFAF8"], ["Bone", "#F3F2EF"], ["Fog", "#E8E6E1"],
  ["Stone 200", "#D4D1CA"], ["Stone 300", "#B8B4AB"], ["Stone 400", "#9A968D"], ["Stone 500", "#7A766E"],
  ["Stone 600", "#5C5953"], ["Stone 700", "#444240"], ["Stone 800", "#33312F"], ["Graphite", "#262523"],
  ["Charcoal", "#1B1A19"], ["Carbon", "#131312"], ["Ink", "#0A0A0A"], ["Black", "#000000"],
  ["Ember 50", "#FBEAE6"], ["Ember 100", "#F2C9BF"], ["Ember 200", "#E5A396"], ["Ember 300", "#D17B6B"],
  ["Ember 400", "#B85543"], ["Ember 500", "#8F3326"], ["Ember 600", "#6E261C"], ["Ember 700", "#4B1A13"],
  ["Gold 50", "#FFF6DC"], ["Gold 100", "#FBE8A6"], ["Gold 200", "#F2D275"], ["Gold 300", "#E0B85A"],
  ["Gold 400", "#C99A3C"], ["Gold 500", "#A67C28"], ["Gold 600", "#7F5E1C"], ["Gold 700", "#5A4213"],
  ["Copper 50", "#FCEBDD"], ["Copper 100", "#F5CFAF"], ["Copper 200", "#E9AE80"], ["Copper 300", "#D98C5A"],
  ["Copper 400", "#C27040"], ["Copper 500", "#9E5530"], ["Copper 600", "#7A4025"], ["Copper 700", "#552B19"],
  ["Plum 50", "#F4ECF2"], ["Plum 100", "#E3D0DE"], ["Plum 200", "#CBAAC3"], ["Plum 300", "#B088A8"],
  ["Plum 400", "#8E6A8C"], ["Plum 500", "#6F5070"], ["Plum 600", "#54395A"], ["Plum 700", "#3A2640"],
  ["Crema", "#F5EDE4"], ["Latte", "#E4D3C0"], ["Flat White", "#CDB397"], ["Mocha", "#B09274"],
  ["Cortado", "#8C7056"], ["Espresso 500", "#6B5340"], ["Dark Roast", "#4A382B"], ["Bean", "#2E211A"],
  ["Success", "#4F7F52"], ["Success Tint", "#DCEBDD"], ["Warning", "#D99A1E"], ["Warning Tint", "#FBEBC8"],
  ["Error", "#C0392B"], ["Error Tint", "#F7D9D5"], ["Info", "#3F6E8C"], ["Info Tint", "#D6E6F0"],
];

export const PALETTE_NAMES = PALETTE.map(([n]) => n);
const byName = new Map(PALETTE.map(([n, h]) => [n.toLowerCase(), h]));
export const paletteHex = (name: string) => byName.get(name.trim().toLowerCase()) ?? null;

// Mid-tone, saturated entries read best as see-through layers on light and dark backgrounds.
const DEFAULTS = [
  "Ember 400", "Gold 300", "Copper 300", "Plum 400", "Info", "Success", "Warning", "Error",
  "Ember 300", "Gold 400", "Copper 400", "Plum 300", "Mocha", "Cortado",
].map((n) => paletteHex(n)!);

/** Stable palette colour for a note when no AI colour has been picked. */
export function noteColour(note: string): string {
  let h = 0;
  for (const ch of note.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEFAULTS[h % DEFAULTS.length];
}
