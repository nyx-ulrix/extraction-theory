// AI does one small job with the user's own key: reading a bean bag's label from photos to fill the
// bean form, flavour chart included (each note scored on the chart's axes and given a palette colour),
// the same way a coffee is filled in by hand. Defaults are each provider's cheapest model.
import type { AxisDef } from "./calc.ts";
import { PALETTE_NAMES } from "./palette.ts";

export type Provider = "claude" | "openai" | "gemini";
export const PROVIDERS: { id: Provider; label: string; model: string; keyUrl: string }[] = [
  { id: "claude", label: "Claude", model: "claude-haiku-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", model: "gpt-5-nano", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini", model: "gemini-2.5-flash-lite", keyUrl: "https://aistudio.google.com/apikey" },
];

// Keys stay in this page's memory unless the user ticks "Remember on this device", which keeps them in this
// browser's storage (never in the sheet or the repo) until cleared. Keys saved by older versions under
// `et.key.*` are wiped from storage on load.
const keys = new Map<Provider, string>();
const stored = (p: Provider) => `et.apikey.${p}`;
for (const p of PROVIDERS) try {
  localStorage.removeItem(`et.key.${p.id}`);
  const k = localStorage.getItem(stored(p.id));
  if (k) keys.set(p.id, k);
} catch { /* storage blocked */ }
export const getKey = (p: Provider) => keys.get(p) ?? "";
export const isRemembered = (p: Provider) => { try { return !!localStorage.getItem(stored(p)); } catch { return false; } };
/** Sets the key for this page; `remember` also keeps it in this browser's storage (false removes it from there). */
export function setKey(p: Provider, key: string, remember = false) {
  const k = key.trim();
  if (k) keys.set(p, k);
  else keys.delete(p);
  try {
    if (remember && k) localStorage.setItem(stored(p), k);
    else localStorage.removeItem(stored(p));
  } catch { /* storage blocked: memory only */ }
}

export interface Img { type: string; data: string } // base64, no data: prefix
interface Req { system: string; schema: object; name: string; text: string; images?: Img[] }
type Call = (model: string, key: string, req: Req) => Promise<string>;

const claude: Call = async (model, key, { system, schema, text: input, images = [] }) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const haiku5 = /haiku-5/.test(model);
  const params = {
    model,
    max_tokens: haiku5 ? 4096 : 16000, // thinking counts against this where it cannot be turned off
    system,
    messages: [{ role: "user", content: [
      ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } })),
      { type: "text", text: input },
    ] }],
    // Haiku 5.5: thinking off (allowed at effort high or below) keeps the call as cheap as possible.
    ...(haiku5 ? { thinking: { type: "disabled" } } : {}),
    output_config: {
      ...(/opus-4-[5-9]|opus-5|sonnet-4-6|sonnet-5|haiku-5|fable|mythos/.test(model) ? { effort: "low" } : {}),
      format: { type: "json_schema", schema },
    },
    // Server-side refusal fallback exists only on these models.
    ...(/^claude-(fable-5-1|opus-5|sonnet-5-5)/.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  };
  try {
    const res = await client.beta.messages.create(params as unknown as Parameters<typeof client.beta.messages.create>[0]);
    if (!("content" in res)) throw new Error("Unexpected streaming reply");
    if (res.stop_reason === "refusal") throw new Error("Claude declined this request.");
    if (res.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off. Try again.");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Claude returned no text");
    return text.text;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Claude rejected the API key. Check it in Settings.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Claude rate limit reached. Try again shortly.");
    if (e instanceof Anthropic.NotFoundError) throw new Error(`Claude model "${model}" was not found.`);
    if (e instanceof Anthropic.APIError) throw new Error(`Claude error: ${e.message}`);
    throw e;
  }
};

const openai: Call = async (model, key, { system, schema, name, text: input, images = [] }) => {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: [
        ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.type};base64,${i.data}` } })),
        { type: "text", text: input },
      ] }],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI error: ${j.error?.message ?? r.status}`);
  const c = j.choices?.[0];
  if (c?.message?.refusal) throw new Error(`OpenAI declined: ${c.message.refusal}`);
  if (c?.finish_reason === "length") throw new Error("OpenAI's reply was cut off. Try again.");
  return c?.message?.content ?? "";
};

const gemini: Call = async (model, key, { system, schema, text: input, images = [] }) => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [...images.map((i) => ({ inline_data: { mime_type: i.type, data: i.data } })), { text: input }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini error: ${j.error?.message ?? r.status}`);
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
};

async function ask<T>(provider: Provider, model: string, key: string, req: Req): Promise<T> {
  const m = model || PROVIDERS.find((p) => p.id === provider)!.model;
  const text = await { claude, openai, gemini }[provider](m, key, req);
  try {
    return JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()) as T;
  } catch {
    throw new Error("The model reply was not valid JSON. Try again.");
  }
}

const BAG = `Read the coffee bag label in these photos and fill in the bean's details. Use only what is printed;
use null for anything not shown, never guess. name: the farm, lot or coffee name. product: the roaster's full name
for the coffee as printed. roastery: the roaster's name. origin: country, then region. farm: farm or producer.
variety and process as printed, in sentence case. roast_level only if printed. roast_date as YYYY-MM-DD (labels
often print YY.M.D). altitude in metres. notes: each printed tasting note, a short phrase in sentence
case with spelling mistakes fixed.

Then chart each tasting note, as a coffee taster filling in a flavour radar:
- Descriptors such as "smooth", "juicy" or "long finish" are notes too.
- If the label prints its own flavour chart or wheel with axes, set printed_axes to its axis labels in order (clockwise
  from the top) and score each note on those axes so that, across the notes, the highest value on each axis matches the
  printed one. Otherwise set printed_axes to null and score each note on the axes you are given.
- values: one number per axis, in order: the printed axes when printed_axes is set, otherwise the axes you are given; from 0 to 10 in steps of 0.5. Score what the note brings: a citrus
  note scores high on acidity and low on body; a chocolate note high on sweetness and body; "long finish" high on finish.
- Axes marked cup-wide (such as body or bitterness) describe the whole cup: give every note the same value on them.
- colour: the palette colour that looks most like the note itself (blueberry: Plum 500, orange: Copper 300,
  passionfruit: Gold 300, cherry: Ember 500, jasmine: Plum 200, chocolate: Dark Roast). Avoid giving two notes the same
  colour.`;

export const MAX_BAG_PHOTOS = 2;
const opt = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const BAG_FIELDS = {
  name: opt("string"), product: opt("string"), roastery: opt("string"), origin: opt("string"), farm: opt("string"),
  variety: opt("string"), process: opt("string"), roast_level: opt("string"), roast_date: opt("string"),
  altitude_low_m: opt("number"), altitude_high_m: opt("number"),
  printed_axes: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
  notes: {
    type: "array",
    items: {
      type: "object",
      properties: { note: { type: "string" }, colour: { type: "string", enum: PALETTE_NAMES }, values: { type: "array", items: { type: "number" } } },
      required: ["note", "colour", "values"], additionalProperties: false,
    },
  },
};
const BAG_SCHEMA = { type: "object", properties: BAG_FIELDS, required: Object.keys(BAG_FIELDS), additionalProperties: false };

export interface ChartNote { note: string; colour: string; values: number[] }
export type BagInfo = Partial<Record<Exclude<keyof typeof BAG_FIELDS, "notes" | "printed_axes">, string | number>> & {
  tasting_notes?: string[];
  /** The roaster's own chart axes when the bag prints one (3 or more), else the notes are scored on the given axes. */
  printed_axes?: string[];
  chart?: ChartNote[];
};

/** Bean details read from up to two photos of the bag, notes charted on `axes`. Fields not printed come back missing. */
export async function readBag(images: Img[], provider: Provider, model: string, axes: AxisDef[]): Promise<BagInfo> {
  const key = getKey(provider);
  if (!key) throw new Error("Add an API key in Settings first.");
  const sent = images.filter((i) => i.data).slice(0, MAX_BAG_PHOTOS);
  if (!sent.length) throw new Error("Could not read that photo. Remove it and add it again.");
  const list = axes.map((a) => `${a.label}${a.shared ? " (cup-wide)" : ""}`).join(", ");
  const raw = await ask<Record<string, unknown>>(provider, model, key, {
    system: BAG, schema: BAG_SCHEMA, name: "bean_label", images: sent,
    text: `Fill in the bean from this label. The flavour chart's axes, in order: ${list}.`,
  });
  const out: BagInfo = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (k === "notes") {
      if (!Array.isArray(v)) continue;
      const notes = v.filter((n) => n && typeof n === "object").slice(0, 12).map((n) => ({
        note: String(n.note ?? "").trim().slice(0, 40),
        colour: String(n.colour ?? ""),
        values: Array.isArray(n.values) ? n.values.slice(0, 12).map((x: unknown) => { const v = Number(x); return Number.isFinite(v) ? v : 0; }) : [],
      })).filter((n) => n.note);
      if (notes.length) { out.chart = notes; out.tasting_notes = notes.map((n) => n.note); }
    } else if (k === "printed_axes") {
      if (Array.isArray(v)) {
        const labels = v.map((x) => String(x).trim().slice(0, 24)).filter(Boolean).slice(0, 12);
        if (labels.length >= 3) out.printed_axes = labels;
      }
    } else if (k in BAG_FIELDS && (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v))) {
      (out as Record<string, unknown>)[k] = typeof v === "string" ? v.trim().slice(0, 200) : v;
    }
  }
  return out;
}

/** A photo shrunk to at most `max` px on its long side as JPEG, so the call stays small and cheap. */
export async function photo(file: File, max = 1568): Promise<Img> {
  const { src, done } = await decode(file);
  try {
    // Mobile browsers can fail to draw or encode a canvas without throwing (an empty "data:," result,
    // e.g. when memory is short), which the API rejects as an empty image: check it, and retry smaller.
    for (const side of [max, 1024, 768]) {
      const s = Math.min(1, side / Math.max(src.width, src.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(src.width * s));
      c.height = Math.max(1, Math.round(src.height * s));
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(src, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
      c.width = c.height = 0; // free the canvas memory straight away
      if (data.length > 100) return { type: "image/jpeg", data };
    }
  } finally {
    done();
  }
  throw new Error("Could not read that photo.");
}

/** The photo decoded, upright, and how to free it; falls back to an <img> where createImageBitmap cannot read the file. */
async function decode(file: File): Promise<{ src: ImageBitmap | HTMLImageElement; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (bmp.width && bmp.height) return { src: bmp, done: () => bmp.close() };
    bmp.close();
  } catch { /* try an <img> below */ }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch { /* checked below */ }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error("Could not read that photo.");
  }
  return { src: img, done: () => URL.revokeObjectURL(url) };
}
