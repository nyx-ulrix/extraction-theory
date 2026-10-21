import { api } from "./google.ts";
import { DATE_COLS, SHEET_TITLE, TABS, TAB_NAMES, type Cell, type Rec, type Tab } from "./schema.ts";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const ID_KEY = "et.sheetId";

export type Headers = Record<Tab, string[]>;
export interface Loaded { id: string; headers: Headers; rows: Record<Tab, Rec[]> }

const col = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};
const range = (tab: Tab, a1 = "") => encodeURIComponent(a1 ? `${tab}!${a1}` : tab);
const toCell = (v: Cell | undefined): Cell => (v == null ? "" : v);

function remember(id: string) {
  try { localStorage.setItem(ID_KEY, id); } catch { /* storage blocked */ }
}

/** Find the app's sheet (drive.file only sees files this app made), or create it with seed rows. */
export async function findOrCreate(seed: Partial<Record<Tab, Rec[]>>): Promise<string> {
  let cached: string | null = null;
  try { cached = localStorage.getItem(ID_KEY); } catch { /* storage blocked */ }
  if (cached) {
    try {
      const f = await api<{ trashed?: boolean }>(`${DRIVE}/${cached}?fields=id,trashed`);
      if (!f.trashed) return cached;
    } catch { /* gone or no longer ours: look it up again */ }
  }
  const q = `name='${SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const found = await api<{ files: { id: string }[] }>(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime`);
  if (found.files.length) {
    remember(found.files[0].id);
    return found.files[0].id;
  }

  const created = await api<{ spreadsheetId: string; sheets: { properties: { sheetId: number; title: Tab } }[] }>(SHEETS, {
    method: "POST",
    body: JSON.stringify({
      properties: { title: SHEET_TITLE },
      // Default grids are 26 columns wide; Brews alone has 40.
      sheets: TAB_NAMES.map((title) => ({
        properties: { title, gridProperties: { frozenRowCount: 1, columnCount: TABS[title].length + 10 } },
      })),
    }),
  });
  const id = created.spreadsheetId;
  await api(`${SHEETS}/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: TAB_NAMES.map((tab) => {
        const header = [...TABS[tab]] as string[];
        return { range: `${tab}!A1`, values: [header, ...(seed[tab] ?? []).map((r) => header.map((h) => toCell(r[h])))] };
      }),
    }),
  });
  const requests = created.sheets.flatMap(({ properties: { sheetId, title } }) => {
    const header = TABS[title] as readonly string[];
    const bold = {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    };
    const dates = Object.entries(DATE_COLS[title] ?? {}).map(([key, pattern]) => {
      const c = header.indexOf(key);
      return {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern } } },
          fields: "userEnteredFormat.numberFormat",
        },
      };
    });
    return [bold, ...dates];
  });
  await api(`${SHEETS}/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
  remember(id);
  return id;
}

export async function loadAll(id: string): Promise<Loaded> {
  const qs = TAB_NAMES.map((t) => `ranges=${range(t)}`).join("&");
  const r = await api<{ valueRanges: { values?: Cell[][] }[] }>(
    `${SHEETS}/${id}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  );
  const headers = {} as Headers;
  const rows = {} as Record<Tab, Rec[]>;
  TAB_NAMES.forEach((tab, i) => {
    const [head = [], ...body] = r.valueRanges[i]?.values ?? [];
    headers[tab] = head.map(String);
    rows[tab] = body
      .map((v) => Object.fromEntries(headers[tab].map((h, j) => [h, v[j] === "" ? null : (v[j] ?? null)])) as Rec)
      .filter((rec) => Object.values(rec).some((x) => x != null && x !== ""));
  });
  return { id, headers, rows };
}

/**
 * Re-read the live header row (another device or a hand edit may have changed it),
 * append any missing columns, widen the grid if needed. Mutates and returns headers[tab].
 */
async function ensureColumns(id: string, headers: Headers, tab: Tab, keys: string[]) {
  const live = await api<{ values?: Cell[][] }>(`${SHEETS}/${id}/values/${range(tab, "1:1")}`);
  const header = headers[tab];
  header.splice(0, header.length, ...(live.values?.[0] ?? []).map(String));
  const missing = [...new Set(keys)].filter((k) => !header.includes(k));
  if (!missing.length) return header;
  const meta = await api<{ sheets: { properties: { sheetId: number; title: string; gridProperties: { columnCount: number } } }[] }>(
    `${SHEETS}/${id}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`,
  );
  const p = meta.sheets.find((s) => s.properties.title === tab)?.properties;
  const need = header.length + missing.length - (p?.gridProperties.columnCount ?? 0);
  if (p && need > 0) {
    await api(`${SHEETS}/${id}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ appendDimension: { sheetId: p.sheetId, dimension: "COLUMNS", length: need + 5 } }] }),
    });
  }
  header.push(...missing);
  await api(`${SHEETS}/${id}/values/${range(tab, "1:1")}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [header] }),
  });
  return header;
}

export async function append(id: string, headers: Headers, tab: Tab, recs: Rec[]) {
  if (!recs.length) return;
  const header = await ensureColumns(id, headers, tab, recs.flatMap(Object.keys));
  await api(`${SHEETS}/${id}/values/${range(tab, "A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: recs.map((r) => header.map((h) => toCell(r[h]))) }),
  });
}

/**
 * Update the row whose `idKey` matches, or append it. Only columns present in `rec`
 * are written, so values typed into other columns of the sheet are kept.
 */
export async function upsert(id: string, headers: Headers, tab: Tab, rec: Rec, idKey = "id") {
  if (rec[idKey] == null || rec[idKey] === "") throw new Error(`${tab} record has no ${idKey}`);
  const header = await ensureColumns(id, headers, tab, Object.keys(rec));
  const c = header.indexOf(idKey);
  const ids = await api<{ values?: Cell[][] }>(
    `${SHEETS}/${id}/values/${range(tab, `${col(c)}:${col(c)}`)}?valueRenderOption=UNFORMATTED_VALUE`,
  );
  const row = (ids.values ?? []).findIndex((v, i) => i > 0 && String(v[0] ?? "") === String(rec[idKey]));
  if (row < 0) return append(id, headers, tab, [rec]);
  const data = Object.keys(rec).map((k) => {
    const a1 = `${col(header.indexOf(k))}${row + 1}`;
    return { range: `${tab}!${a1}`, values: [[toCell(rec[k])]] };
  });
  await api(`${SHEETS}/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}

/** Delete every row whose `idKey` cell is one of `ids`. Rows are found fresh, so hand edits can't shift the target. */
export async function deleteRows(id: string, _headers: Headers, tab: Tab, idKey: string, ids: string[]) {
  if (!ids.length) return;
  const head = await api<{ values?: Cell[][] }>(`${SHEETS}/${id}/values/${range(tab, "1:1")}`);
  const c = (head.values?.[0] ?? []).map(String).indexOf(idKey);
  if (c < 0) return;
  const colVals = await api<{ values?: Cell[][] }>(
    `${SHEETS}/${id}/values/${range(tab, `${col(c)}:${col(c)}`)}?valueRenderOption=UNFORMATTED_VALUE`,
  );
  const want = new Set(ids);
  const rows = (colVals.values ?? []).map((v, i) => (i > 0 && want.has(String(v[0] ?? "")) ? i : -1)).filter((i) => i > 0);
  if (!rows.length) return;
  const meta = await api<{ sheets: { properties: { sheetId: number; title: string } }[] }>(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title)`);
  const sheetId = meta.sheets.find((s) => s.properties.title === tab)?.properties.sheetId;
  if (sheetId == null) return;
  // Bottom up, so earlier deletions don't move the rows still to delete.
  const requests = rows.sort((a, b) => b - a).map((i) => ({
    deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 } },
  }));
  await api(`${SHEETS}/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
}

export const sheetUrl =(id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
