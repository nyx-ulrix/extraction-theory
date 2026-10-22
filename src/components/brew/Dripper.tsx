import { useState } from "react";
import { PAPER_NAMES } from "../../papers.ts";
import { FloppyDisk } from "@phosphor-icons/react";
import { num } from "../../calc.ts";
import { useApp } from "../../ctx.ts";
import { str, withF, type Draft, type Up } from "../../brew.ts";
import type { DripperStyle, Gear } from "../../schema.ts";
import { newId, saveGear, type Db } from "../../store.ts";
import { Dialog, IconButton, Section, SelectField, TextField, TimeField } from "../../ui.tsx";
import Readout from "./Readout.tsx";

const STYLES: [DripperStyle, string][] = [["immersion", "Immersion"], ["hybrid", "Hybrid"], ["percolation", "Percolation"]];
export const styleLabel = (s?: DripperStyle | null) => STYLES.find(([v]) => v === s)?.[1] ?? "-";

export default function Dripper({ d, up }: { d: Draft; up: Up }) {
  const { db } = useApp();
  const [adding, setAdding] = useState(false);
  const drippers = db.gear.filter((g) => g.type === "dripper");
  const dr = drippers.find((g) => g.id === d.f.dripper_id);
  const lastClosed = d.pours[d.pours.length - 1]?.valve === "closed";
  const drains = dr?.style === "immersion" || (dr?.style === "hybrid" && lastClosed);
  return (
    <Section title="Dripper and paper">
      <div className="grid-2">
        <SelectField
          label="Dripper" value={str(d.f.dripper_id)} other onOther={() => setAdding(true)}
          options={drippers.map((g) => [g.id, g.name])} onChange={(v) => up(withF({ dripper_id: v || null }))}
        />
        <Readout label="Style">{dr ? styleLabel(dr.style) : null}</Readout>
        <SelectField
          label="Filter paper" value={str(d.f.paper)} other placeholder="None"
          options={papers(db)} onChange={(v) => up(withF({ paper: v }))}
        />
        {drains && <TimeField label="Drain at" value={num(d.f.drain_at_s)} onChange={(v) => up(withF({ drain_at_s: v }))} />}
      </div>
      <DripperDialog open={adding} onClose={() => setAdding(false)} onSaved={(g) => up(withF({ dripper_id: g.id }))} />
    </Section>
  );
}

/** Papers you've used (newest first, so a new one rises to the top), then your papers, then everything else. */
function papers(db: Db): string[] {
  const used = [...db.brews].sort((a, b) => (Number(b.brew_date) || 0) - (Number(a.brew_date) || 0)).map((b) => str(b.paper).trim()).filter(Boolean);
  const saved = db.gear.filter((g) => g.type === "paper").map((g) => g.name);
  const seen = new Set<string>();
  return [...used, ...db.settings.my_papers, ...PAPER_NAMES, ...saved].filter((n) => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()));
}

/** Add-dripper dialog. Closes itself after a save. */
export function DripperDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (g: Gear) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add dripper">
      <DripperForm onSaved={(g) => { onSaved?.(g); onClose(); }} />
    </Dialog>
  );
}

function DripperForm({ onSaved }: { onSaved: (g: Gear) => void }) {
  const { update, busy } = useApp();
  const [name, setName] = useState("");
  // Style starts unset: the range shows the middle stop but nothing is chosen until it is touched.
  const [stop, setStop] = useState<number | null>(null);
  const style = stop == null ? null : STYLES[stop][0];
  const pick = (v: string) => setStop(Number(v));

  async function save() {
    if (!style) return;
    const g: Gear = { id: `d-${newId()}`, type: "dripper", name: name.trim(), style };
    if (await update((db) => saveGear(db, g), "Dripper added")) onSaved(g);
  }
  return (
    <>
      <TextField label="Name" value={name} onChange={setName} />
      <div className="field">
        <label className="label" htmlFor="dripper-style">Style</label>
        <input
          id="dripper-style" type="range" min={0} max={2} step={1} value={stop ?? 1}
          aria-valuetext={style ? styleLabel(style) : "Choose a style to save"}
          onChange={(e) => pick(e.target.value)} onPointerUp={(e) => pick(e.currentTarget.value)}
        />
        <div className="row" style={{ justifyContent: "space-between" }} aria-hidden>
          {STYLES.map(([v, l]) => <span key={v} className="label" style={style === v ? { color: "var(--text-strong)" } : undefined}>{l}</span>)}
        </div>
        <span className={stop == null ? "error" : "hint"}>{style ? styleLabel(style) : "Choose a style to save"}</span>
      </div>
      <div className="row">
        <span className="spacer" />
        <IconButton icon={FloppyDisk} label="Save dripper" variant="solid" disabled={!name.trim() || !style || busy} onClick={save} />
      </div>
    </>
  );
}
