// Tasting notes text plus the editable radar: one layer per note, optional per-coffee axes.
// The user sets every value by dragging. An AI bag fill (Beans) may hand in a starting chart and colours.
import { useEffect, useRef, useState } from "react";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { cleanLayers, splitNotes, type AxisDef, type Flavour, type Layer, type Values } from "../calc.ts";
import { noteColour } from "../palette.ts";
import { useApp } from "../ctx.ts";
import { IconButton } from "../ui.tsx";
import AxesEditor from "./AxesEditor.tsx";
import ColourPicker from "./ColourPicker.tsx";
import NoteChips from "./NoteChips.tsx";
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
export function syncLayers(text: string, layers: Layer[], axes: AxisDef[]): Layer[] {
  const have = new Map(layers.map((l) => [low(l.note), l]));
  return splitNotes(text).reduce<Layer[]>((acc, n) => [...acc, have.get(low(n)) ?? starter(n, axes, acc[0] ?? layers[0])], []);
}

export default function FlavourEditor({ notes, onNotes, value, onChange, template, label = "Tasting notes", start }: {
  notes: string; onNotes: (s: string) => void;
  value: Flavour; onChange: (f: Flavour) => void;
  template: AxisDef[];
  label?: string;
  /** Opened from the coffee page's chart: "add" opens a new note ready to type, "edit" picks the first note. */
  start?: "add" | "edit";
}) {
  const { notify } = useApp();
  const [editAxes, setEditAxes] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const { axes, layers } = value;
  const cur = sel != null ? layers[sel] : undefined;

  // The first layer to appear is selected, so its drag handles show straight away.
  const hadLayers = useRef(layers.length > 0);
  useEffect(() => {
    if (!hadLayers.current && layers.length) setSel(0);
    hadLayers.current = layers.length > 0;
  }, [layers.length]);

  const setLayers = (next: Layer[]) => onChange({ axes, layers: next });
  const setAxes = (next: AxisDef[]) => {
    // An axis just linked takes the first note's value on every note, so the layers agree.
    const linked = next.filter((a) => a.shared && !axes.find((b) => b.key === a.key)?.shared).map((a) => a.key);
    const base = cleanLayers(layers, next);
    if (!linked.length || !base.length) return onChange({ axes: next, layers: base });
    onChange({ axes: next, layers: base.map((l) => ({ ...l, v: { ...l.v, ...Object.fromEntries(linked.map((k) => [k, base[0].v[k]])) } })) });
  };
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

  const root = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(start === "add");
  useEffect(() => {
    if (!start) return;
    root.current?.scrollIntoView({ block: "start" });
    if (start === "edit" && layers.length) setSel(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draft, setDraft] = useState("");
  // Enter adds the note and keeps the field open and focused for the next one; leaving it closes it.
  const addDraft = (keepOpen = false) => {
    const have = new Set(layers.map((l) => low(l.note)));
    const fresh = splitNotes(draft).filter((n) => !have.has(low(n)) && have.add(low(n)));
    setDraft("");
    if (!keepOpen) setAdding(false);
    if (!fresh.length) return;
    const next = fresh.reduce((acc, n) => [...acc, starter(n, axes, acc[0])], layers).slice(0, 12);
    if (layers.length + fresh.length > 12) notify("Up to 12 notes per coffee.", "info");
    commit(next);
    setSel(next.length - 1);
  };
  const rename = (at: number, text: string) => {
    commit(layers.map((l, i) => (i === at ? { ...l, note: text.slice(0, 40) } : l)));
  };

  const setColour = (at: number, color: string) => {
    setLayers(layers.map((l, i) => (i === at ? { ...l, color } : l)));
  };
  const remove = (at: number) => {
    commit(layers.filter((_, i) => i !== at));
    setSel(null);
  };

  return (
    <div className="stack" ref={root}>
      <span className="label">{label}</span>
      <Radar axes={axes} layers={layers} onChange={setLayers} selected={cur ? sel : null} onSelect={setSel} title={`${label} radar`} legend={false} emptyText="" />
      <NoteChips layers={layers} active={cur ? sel : null} onTap={setSel} end={<>
        {adding ? (
          <input
            className="input note-draft" value={draft} aria-label="New note" autoFocus maxLength={200}
            placeholder={layers.length ? "Another note" : "For example blueberry"}
            onChange={(e) => setDraft(e.target.value)} onBlur={() => addDraft()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addDraft(true); }
              if (e.key === "Escape") { setDraft(""); setAdding(false); }
            }}
          />
        ) : (
          <IconButton icon={Plus} label="Add flavour" disabled={layers.length >= 12} onClick={() => { setAdding(true); setSel(null); }} />
        )}
        <IconButton icon={PencilSimple} label="Edit axes" tipAlign="end" pressed={editAxes} onClick={() => setEditAxes(!editAxes)} />
      </>} />
      {cur && sel != null && (
        <div className="note-row">
          <ColourPicker value={cur.color} label={`${cur.note || "Note"} colour`} onChange={(c) => setColour(sel, c)} />
          <input
            className="input" value={cur.note} maxLength={40} aria-label="Note name"
            onChange={(e) => rename(sel, e.target.value)}
            onBlur={(e) => { if (!e.target.value.trim()) remove(sel); }}
          />
          <IconButton icon={Trash} label={`Remove ${cur.note || "note"}`} tipAlign="end" onClick={() => remove(sel)} />
        </div>
      )}
      {/* The note being shaped shows alone; tapping its chip again brings the rest back. */}
      <p className="muted" aria-live="polite" style={{ fontSize: 12, textAlign: "center" }}>
        {!layers.length ? "Tap + to add a note; each becomes a layer on the chart."
          : cur ? `Drag the points to shape ${cur.note || "this note"}, or rename it and change its colour above. ` : "Tap a note to shape, rename or recolour it."}
        {cur && layers.length > 1 && <button type="button" className="linkish" onClick={() => setSel(null)}>Show all notes</button>}
      </p>
      {editAxes && <AxesEditor axes={axes} onChange={setAxes} template={template} />}
    </div>
  );
}
