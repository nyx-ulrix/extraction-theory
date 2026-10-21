// Tasting notes text plus the editable radar: one layer per note, optional per-coffee axes.
// The user sets every value by dragging. AI only picks palette colours for the notes.
import { useEffect, useRef, useState } from "react";
import { Palette, PencilSimple, Trash } from "@phosphor-icons/react";
import { cleanLayers, splitNotes, type AxisDef, type Flavour, type Layer, type Values } from "../calc.ts";
import { getKey, pickColours } from "../ai.ts";
import { noteColour } from "../palette.ts";
import { useApp } from "../ctx.ts";
import { IconButton, TextField } from "../ui.tsx";
import AxesEditor from "./AxesEditor.tsx";
import Radar from "./Radar.tsx";

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const low = (s: string) => s.trim().toLowerCase();

/** Starter layer: 5 on an axis whose label matches the note, 2 elsewhere; no match = 3 everywhere. */
function starter(note: string, axes: AxisDef[]): Layer {
  const nw = words(note);
  const hit = axes.find((a) => words(a.label).some((w) => nw.some((x) => x.includes(w) || w.includes(x))));
  const v: Values = {};
  for (const a of axes) v[a.key] = hit ? (a === hit ? 5 : 2) : 3;
  return { note: note.slice(0, 40), color: noteColour(note), v };
}

/** One layer per note in the text, keeping the values and colour of notes that already had a layer. */
function syncLayers(text: string, layers: Layer[], axes: AxisDef[]): Layer[] {
  const have = new Map(layers.map((l) => [low(l.note), l]));
  return splitNotes(text).map((n) => have.get(low(n)) ?? starter(n, axes));
}

export default function FlavourEditor({ notes, onNotes, value, onChange, template, label = "Tasting notes" }: {
  notes: string; onNotes: (s: string) => void;
  value: Flavour; onChange: (f: Flavour) => void;
  template: AxisDef[];
  label?: string;
}) {
  const { db, notify } = useApp();
  const { ai_provider: provider, ai_model: model } = db.settings;
  const [busy, setBusy] = useState(false);
  const [editAxes, setEditAxes] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const { axes, layers } = value;
  const cur = sel != null ? layers[sel] : undefined;

  // Latest value for async colour replies; notes whose colour is settled (AI or by hand) are never auto-recoloured.
  const latest = useRef(value);
  latest.current = value;
  const settled = useRef(new Set(value.layers.map((l) => low(l.note))));

  // The first layer to appear is selected, so its drag handles show straight away.
  const hadLayers = useRef(layers.length > 0);
  useEffect(() => {
    if (!hadLayers.current && layers.length) setSel(0);
    hadLayers.current = layers.length > 0;
  }, [layers.length]);

  const setLayers = (next: Layer[]) => onChange({ axes, layers: next });
  const setAxes = (next: AxisDef[]) => onChange({ axes: next, layers: cleanLayers(layers, next) });
  const editNotes = (s: string) => {
    onNotes(s);
    onChange({ axes, layers: syncLayers(s, layers, axes) });
    setSel(null);
  };

  const recolour = async (targets: string[], manual: boolean) => {
    if (!targets.length) return;
    targets.forEach((n) => settled.current.add(low(n)));
    setBusy(true);
    try {
      const got = await pickColours(targets, provider, model);
      const v = latest.current;
      onChange({ axes: v.axes, layers: v.layers.map((l) => ({ ...l, color: got.get(low(l.note)) ?? l.color })) });
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
    if (manual) setSel(null);
  };

  // Auto colour: once typing pauses, ask for colours of new notes only (one small call).
  const noteKey = layers.map((l) => low(l.note)).join("|");
  useEffect(() => {
    if (!getKey(provider)) return;
    const pending = latest.current.layers.map((l) => l.note).filter((n) => !settled.current.has(low(n)));
    if (!pending.length) return;
    const t = setTimeout(() => recolour(pending, false), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey, provider]);

  const setColour = (at: number, color: string) => {
    settled.current.add(low(layers[at].note));
    setLayers(layers.map((l, i) => (i === at ? { ...l, color } : l)));
  };
  const remove = (at: number) => {
    const next = layers.filter((_, i) => i !== at);
    onNotes(next.map((l) => l.note).join(", "));
    setLayers(next);
    setSel(null);
  };
  const hasKey = !!getKey(provider);

  return (
    <div className="stack">
      <TextField
        label={label} value={notes} onChange={editNotes} multiline
        hint={hasKey ? "Separate notes with commas. Each note becomes a layer, coloured automatically." : "Separate notes with commas. Each note becomes a layer."}
      />
      <div className="row">
        {hasKey && (
          <IconButton
            icon={Palette} label={busy ? "Picking colours..." : "Pick colours with AI"} disabled={busy || !layers.length}
            onClick={() => recolour(layers.map((l) => l.note), true)}
          />
        )}
        <IconButton icon={PencilSimple} label="Edit axes" pressed={editAxes} onClick={() => setEditAxes(!editAxes)} />
        {busy && <span className="muted" role="status" style={{ fontSize: 12 }}>Picking colours...</span>}
      </div>
      {editAxes && <AxesEditor axes={axes} onChange={setAxes} template={template} />}

      <Radar axes={axes} layers={layers} onChange={setLayers} selected={cur ? sel : null} onSelect={setSel} title={`${label} radar`} legend={false} emptyText="" />
      {layers.length > 0 && (
        <div className="row" style={{ justifyContent: "center" }}>
          {layers.map((l, i) => (
            <div
              key={l.note} className="chip"
              style={{ padding: "0 0 0 6px", gap: 0, minHeight: 44, cursor: "default", ...(sel === i && { borderColor: "var(--border)", background: "var(--surface)" }) }}
            >
              <input
                type="color" value={l.color} aria-label={`${l.note} colour`} title={`${l.note} colour`}
                style={{ width: 32, height: 32, padding: 0, marginRight: 6, border: "1px solid var(--border-soft)", flex: "none" }}
                onChange={(e) => setColour(i, e.target.value)}
              />
              <button
                type="button" aria-pressed={sel === i} onClick={() => setSel(sel === i ? null : i)}
                style={{
                  minHeight: 44, padding: "0 8px", background: "none", border: 0, borderLeft: "1px solid var(--border-soft)",
                  color: "inherit", font: "inherit", cursor: "pointer",
                }}
              >
                {l.note}
              </button>
              <IconButton icon={Trash} label={`Remove ${l.note}`} variant="bare" size={16} onClick={() => remove(i)} />
            </div>
          ))}
        </div>
      )}
      <p className="muted" aria-live="polite" style={{ fontSize: 12, textAlign: "center" }}>
        {!layers.length ? "Type notes to draw layers." : cur ? "Drag the points along each axis." : "Tap a note to shape it."}
      </p>
    </div>
  );
}
