// Tasting notes text plus the editable radar: one layer per note, optional per-coffee axes.
// The user sets every value by dragging. AI only picks palette colours for the notes.
import { useEffect, useRef, useState } from "react";
import { Palette, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { cleanLayers, splitNotes, type AxisDef, type Flavour, type Layer, type Values } from "../calc.ts";
import { getKey, pickColours } from "../ai.ts";
import { noteColour } from "../palette.ts";
import { useApp } from "../ctx.ts";
import { IconButton } from "../ui.tsx";
import AxesEditor from "./AxesEditor.tsx";
import ColourPicker from "./ColourPicker.tsx";
import Radar from "./Radar.tsx";

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const low = (s: string) => s.trim().toLowerCase();

/** Starter layer: 5 on an axis whose label matches the note, 2 elsewhere; no match = 3 everywhere. */
function starter(note: string, axes: AxisDef[], first?: Layer): Layer {
  const nw = words(note);
  const hit = axes.find((a) => words(a.label).some((w) => nw.some((x) => x.includes(w) || w.includes(x))));
  const v: Values = {};
  for (const a of axes) v[a.key] = hit ? (a === hit ? 5 : 2) : 3;
  // Shared (cup-wide) axes start where the other notes already are.
  if (first) for (const a of axes) if (a.shared) v[a.key] = first.v[a.key] ?? v[a.key];
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
  // Notes are kept as layers; the plain-text notes column is derived from them.
  const commit = (next: Layer[]) => {
    onNotes(next.map((l) => l.note.trim()).filter(Boolean).join(", "));
    onChange({ axes, layers: next });
  };

  // Older records stored notes as text only: turn them into layers once.
  useEffect(() => {
    if (!layers.length && notes.trim()) onChange({ axes, layers: syncLayers(notes, [], axes) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState("");
  const addDraft = () => {
    const have = new Set(layers.map((l) => low(l.note)));
    const fresh = splitNotes(draft).filter((n) => !have.has(low(n)) && have.add(low(n)));
    setDraft("");
    if (!fresh.length) return;
    const next = [...layers, ...fresh.map((n) => starter(n, axes, layers[0]))].slice(0, 12);
    if (layers.length + fresh.length > 12) notify("Up to 12 notes per coffee.", "info");
    commit(next);
    setSel(next.length - 1);
  };
  const rename = (at: number, text: string) => {
    if (settled.current.has(low(layers[at].note))) settled.current.add(low(text));
    commit(layers.map((l, i) => (i === at ? { ...l, note: text.slice(0, 40) } : l)));
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
    commit(layers.filter((_, i) => i !== at));
    setSel(null);
  };
  const hasKey = !!getKey(provider);

  return (
    <div className="stack">
      <div className="field">
        <span className="label">{label}</span>
        <div className="note-rows">
          {layers.map((l, i) => (
            <div key={i} className={`note-row${sel === i ? " on" : ""}`}>
              <ColourPicker value={l.color} label={`${l.note || "Note"} colour`} onChange={(c) => setColour(i, c)} />
              <input
                className="input" value={l.note} maxLength={40} aria-label={`Note ${i + 1}`}
                onFocus={() => setSel(i)} onChange={(e) => rename(i, e.target.value)}
                onBlur={(e) => { if (!e.target.value.trim()) remove(i); }}
              />
              <IconButton icon={Trash} label={`Remove ${l.note || "note"}`} tipAlign="end" onClick={() => remove(i)} />
            </div>
          ))}
          <div className="note-row">
            <span className="note-new" aria-hidden />
            <input
              className="input" value={draft} aria-label="New note"
              placeholder={layers.length ? "Add another note" : "Add a note, for example blueberry"}
              onChange={(e) => setDraft(e.target.value)} onBlur={addDraft}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }}
            />
            <IconButton icon={Plus} label="Add note" tipAlign="end" disabled={!draft.trim()} onClick={addDraft} />
          </div>
        </div>
        <span className="hint">{hasKey ? "One note per field. Each becomes a layer, coloured automatically." : "One note per field. Each becomes a layer."}</span>
      </div>
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
      <p className="muted" aria-live="polite" style={{ fontSize: 12, textAlign: "center" }}>
        {!layers.length ? "Add notes to draw layers." : cur ? `Drag the points to shape ${cur.note || "this note"}.` : "Tap a note to shape it."}
      </p>
    </div>
  );
}
