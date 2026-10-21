// AI is used for one thing only: picking a palette colour for each tasting note.
// Radar values are always set by the user. Defaults are each provider's cheapest model.
import { PALETTE, PALETTE_NAMES, paletteHex } from "./palette.ts";

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

const SYSTEM = `For each coffee tasting note, pick the ONE colour from this palette that people most associate with that flavour.
Palette (name: hex): ${PALETTE.map(([n, h]) => `${n}: ${h}`).join("; ")}.
Prefer mid-tone colours that stay visible on white and on near-black. Reply with JSON only, using the palette names exactly.`;

const SCHEMA = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        properties: { note: { type: "string" }, colour: { type: "string", enum: PALETTE_NAMES } },
        required: ["note", "colour"],
        additionalProperties: false,
      },
    },
  },
  required: ["notes"],
  additionalProperties: false,
};

type Call = (model: string, key: string, input: string) => Promise<string>;

const claude: Call = async (model, key, input) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const haiku5 = /haiku-5/.test(model);
  const params = {
    model,
    max_tokens: haiku5 ? 1024 : 16000, // thinking counts against this where it cannot be turned off
    system: SYSTEM,
    messages: [{ role: "user", content: input }],
    // Haiku 5.5: thinking off (allowed at effort high or below) keeps the call as cheap as possible.
    ...(haiku5 ? { thinking: { type: "disabled" } } : {}),
    output_config: {
      ...(/opus-4-[5-9]|opus-5|sonnet-4-6|sonnet-5|haiku-5|fable|mythos/.test(model) ? { effort: "low" } : {}),
      format: { type: "json_schema", schema: SCHEMA },
    },
    // Server-side refusal fallback exists only on these models.
    ...(/^claude-(fable-5-1|opus-5|sonnet-5-5)/.test(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  };
  try {
    const res = await client.beta.messages.create(params as unknown as Parameters<typeof client.beta.messages.create>[0]);
    if (!("content" in res)) throw new Error("Unexpected streaming reply");
    if (res.stop_reason === "refusal") throw new Error("Claude declined to pick colours for these notes.");
    if (res.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off. Try fewer notes.");
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

const openai: Call = async (model, key, input) => {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: input }],
      response_format: { type: "json_schema", json_schema: { name: "note_colours", strict: true, schema: SCHEMA } },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI error: ${j.error?.message ?? r.status}`);
  return j.choices?.[0]?.message?.content ?? "";
};

const gemini: Call = async (model, key, input) => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini error: ${j.error?.message ?? r.status}`);
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
};

/** Notes -> palette hex per note (keyed by lowercase note). Unknown names are dropped. */
export async function pickColours(notes: string[], provider: Provider, model: string): Promise<Map<string, string>> {
  const key = getKey(provider);
  if (!key) throw new Error("Add an API key in Settings first.");
  const list = notes.map((n) => n.trim()).filter(Boolean).slice(0, 12);
  if (!list.length) return new Map();
  const m = model || PROVIDERS.find((p) => p.id === provider)!.model;
  const text = await { claude, openai, gemini }[provider](m, key, list.map((n) => n.slice(0, 40)).join("\n"));
  let parsed: { notes?: { note?: unknown; colour?: unknown }[] };
  try {
    parsed = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    throw new Error("The model reply was not valid JSON. Try again.");
  }
  const out = new Map<string, string>();
  for (const it of parsed.notes ?? []) {
    const hex = paletteHex(String(it.colour ?? ""));
    if (hex) out.set(String(it.note ?? "").trim().toLowerCase(), hex);
  }
  if (!out.size) throw new Error("No colours came back. Try again.");
  return out;
}
