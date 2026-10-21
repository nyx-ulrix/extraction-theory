// Free-text values typed different ways ("Sweet blossom", "sweet  Blossom") grouped as one.

export const norm = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
/** Origins group by country: "Colombia, Risaralda" and "colombia" are the same. */
export const originKey = (v: unknown) => norm(String(v ?? "").split(",")[0]);

/** Distinct groups as [key, label], label = the most used spelling. Empty values are skipped. */
export function groups(values: unknown[], key: (v: unknown) => string = norm): [string, string][] {
  const seen = new Map<string, Map<string, number>>();
  for (const v of values) {
    const k = key(v);
    if (!k) continue;
    const label = key === originKey ? String(v).split(",")[0].trim() : String(v).trim().replace(/\s+/g, " ");
    const spellings = seen.get(k) ?? new Map<string, number>();
    spellings.set(label, (spellings.get(label) ?? 0) + 1);
    seen.set(k, spellings);
  }
  return [...seen].map(([k, s]): [string, string] => [k, [...s].sort((a, b) => b[1] - a[1])[0][0]])
    .sort((a, b) => a[1].localeCompare(b[1]));
}

/** Method ids a coffee is dialed in for. */
export const dialedMethods = (bean: { dialed?: unknown } | undefined) =>
  String(bean?.dialed ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const isFinished =(v: unknown) => v === true || norm(v) === "true";
