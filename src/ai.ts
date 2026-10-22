// AI does one small job with the user's own key: reading a bean bag's label from photos to fill the
// bean form. Radar values and note colours are always the user's. Defaults are each provider's cheapest model.

export type Provider = "claude" | "openai" | "gemini";
export const PROVIDERS: { id: Provider; label: string; model: string; keyUrl: string }[] = [
  { id: "claude", label: "Claude", model: "claude-haiku-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI", model: "gpt-5-nano", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini", model: "gemini-2.5-flash-lite", keyUrl: "https://aistudio.google.com/apikey" },
];

// Keys live only in this browser's local storage. Never in the sheet or the repo.
const keyName = (p: Provider) => `et.key.${p}`;
export function getKey(p: Provider): string {
  try { return localStorage.getItem(keyName(p)) ?? ""; } catch { return ""; }
}
export function setKey(p: Provider, key: string) {
  try {
    if (key) localStorage.setItem(keyName(p), key.trim());
    else localStorage.removeItem(keyName(p));
  } catch { /* storage blocked: key lasts this session only */ }
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
    max_tokens: haiku5 ? 1024 : 16000, // thinking counts against this where it cannot be turned off
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
often print YY.M.D). altitude in metres. tasting_notes: the printed tasting notes, each a short phrase in sentence
case with spelling mistakes fixed.`;

export const MAX_BAG_PHOTOS = 2;
const opt = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const BAG_FIELDS = {
  name: opt("string"), product: opt("string"), roastery: opt("string"), origin: opt("string"), farm: opt("string"),
  variety: opt("string"), process: opt("string"), roast_level: opt("string"), roast_date: opt("string"),
  altitude_low_m: opt("number"), altitude_high_m: opt("number"), tasting_notes: { type: "array", items: { type: "string" } },
};
const BAG_SCHEMA = { type: "object", properties: BAG_FIELDS, required: Object.keys(BAG_FIELDS), additionalProperties: false };

export type BagInfo = Partial<Record<Exclude<keyof typeof BAG_FIELDS, "tasting_notes">, string | number>> & { tasting_notes?: string[] };

/** Bean details read from up to two photos of the bag. Fields not printed come back missing. */
export async function readBag(images: Img[], provider: Provider, model: string): Promise<BagInfo> {
  const key = getKey(provider);
  if (!key) throw new Error("Add an API key in Settings first.");
  const raw = await ask<Record<string, unknown>>(provider, model, key, {
    system: BAG, schema: BAG_SCHEMA, name: "bean_label", text: "Fill in the bean from this label.",
    images: images.slice(0, MAX_BAG_PHOTOS),
  });
  const out: BagInfo = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (k === "tasting_notes") {
      if (Array.isArray(v)) out.tasting_notes = v.map((n) => String(n).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    } else if (k in BAG_FIELDS && (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v))) {
      (out as Record<string, unknown>)[k] = typeof v === "string" ? v.trim().slice(0, 200) : v;
    }
  }
  return out;
}

/** A photo shrunk to at most `max` px on its long side as JPEG, so the call stays small and cheap. */
export async function photo(file: File, max = 1568): Promise<Img> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return { type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
}
