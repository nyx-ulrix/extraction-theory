import { useState } from "react";
import { FloppyDisk } from "@phosphor-icons/react";
import { dialToClicks, estimateMicrons, num, type DialType, type Num } from "../../calc.ts";
import { useApp } from "../../ctx.ts";
import { str, toDial, withF, type Draft, type Up } from "../../brew.ts";
import { shows, type Gear } from "../../schema.ts";
import { newId, saveGear } from "../../store.ts";
import { Dialog, IconButton, NumField, Section, Segmented, SelectField, TextField, Toggle } from "../../ui.tsx";

export default function Grind({ d, up }: { d: Draft; up: Up }) {
  const { db } = useApp();
  const [adding, setAdding] = useState(false);
  const all = db.gear.filter((g) => g.type === "grinder");
  // The user's own grinders (Settings, Gear), plus whatever this brew already uses.
  const mine = db.settings.my_grinders;
  const grinders = mine.length ? all.filter((g) => mine.includes(g.id) || g.id === d.f.grinder_id) : all;
  const g = all.find((x) => x.id === d.f.grinder_id);
  const dial = g ? toDial(g) : null;
  const setting = str(d.f.grind_setting);
  const clicks = dial && dial.dial_type !== "stepless" ? dialToClicks(setting, dial) : null;
  const est = dial ? estimateMicrons(clicks, dial) : null;
  const basic = db.settings.brew_mode === "basic";
  const how = dial?.dial_type === "rotation" ? "Turns.number.clicks, for example 2.4.1" : dial?.dial_type === "stepless" ? "Dial reading"
    : dial ? "Clicks from zero" : "The number or mark on your grinder's dial";
  const calc = [dial?.dial_type === "rotation" && clicks != null ? `${clicks} clicks` : "", est != null ? `about ${est} µm` : ""].filter(Boolean).join(", ");

  const settingField = (
    <TextField key="s" label="Grind setting" value={setting} hint={calc && !basic ? `${how}. ${calc}` : how} onChange={(v) => up(withF({ grind_setting: v }))} />
  );
  const umField = (
    <NumField
      key="u" label="Grind size" unit="µm" value={num(d.f.grind_um)} hint="Optional"
      placeholder={est != null ? String(est) : undefined} onChange={(v) => up(withF({ grind_um: v }))}
    />
  );
  return (
    <Section title="Grind">
      <SelectField
        label="Grinder" value={str(d.f.grinder_id)} other onOther={() => setAdding(true)}
        options={grinders.map((x) => [x.id, [x.brand, x.name].filter(Boolean).join(" ")])}
        onChange={(v) => up(withF({ grinder_id: v || null }))} hint={basic ? "Not listed? Choose Other to add yours." : undefined}
      />
      {/* Pretentious mode: the burr gap in microns, nothing else. */}
      {db.settings.brew_mode === "pretentious"
        ? <NumField label="Grind size" unit="µm" min={0} value={num(d.f.grind_um)} placeholder={est != null ? String(est) : undefined}
            hint="Microns only. Clicks are for people with a life." onChange={(v) => up(withF({ grind_um: v }))} />
        : basic ? settingField
        : <div className="grid-2">{db.settings.grind_first === "microns" ? [umField, settingField] : [settingField, umField]}</div>}
      {shows(db.settings, "rdt") && (
        <div className="grid-2">
          <Toggle label="RDT (spritzed)" checked={d.f.rdt === true} onChange={(v) => up(withF({ rdt: v }))} />
          <NumField label="Grinder RPM" min={0} step={1} value={num(d.f.grinder_rpm)} hint="Variable-speed grinders" onChange={(v) => up(withF({ grinder_rpm: v }))} />
        </div>
      )}
      <GrinderDialog open={adding} onClose={() => setAdding(false)} onSaved={(g) => up(withF({ grinder_id: g.id }))} />
    </Section>
  );
}

/** Add-grinder dialog. Closes itself after a save. */
export function GrinderDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (g: Gear) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add grinder">
      <GrinderForm onSaved={(g) => { onSaved?.(g); onClose(); }} />
    </Dialog>
  );
}

function GrinderForm({ onSaved }: { onSaved: (g: Gear) => void }) {
  const { update, busy } = useApp();
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [dialType, setDialType] = useState<DialType>("clicks");
  const [cpn, setCpn] = useState<Num>(null);
  const [npr, setNpr] = useState<Num>(null);
  const [um, setUm] = useState<Num>(null);
  const rotation = dialType === "rotation";
  const ok = name.trim() && (!rotation || (cpn && npr));

  async function save() {
    const g: Gear = {
      id: `g-${newId()}`, type: "grinder", brand: brand.trim(), name: name.trim(), dial_type: dialType,
      clicks_per_number: rotation ? cpn : null, numbers_per_rotation: rotation ? npr : null,
      um_per_step: dialType === "stepless" ? null : um, zero_um: null,
    };
    if (await update((db) => saveGear(db, g), "Grinder added")) onSaved(g);
  }
  return (
    <>
      <div className="grid-2">
        <TextField label="Brand" value={brand} onChange={setBrand} />
        <TextField label="Model" value={name} onChange={setName} />
      </div>
      <Segmented label="Dial type" value={dialType} onChange={setDialType} full
        options={[["clicks", "Clicks"], ["rotation", "Rotation"], ["stepless", "Stepless"]]} />
      {rotation && (
        <div className="grid-2">
          <NumField label="Clicks per number" value={cpn} onChange={setCpn} min={1} step={1} />
          <NumField label="Numbers per rotation" value={npr} onChange={setNpr} min={1} step={1} />
        </div>
      )}
      {dialType !== "stepless" && <NumField label="Microns per step" unit="µm" value={um} onChange={setUm} hint="Optional, for the size estimate" />}
      <div className="row">
        <span className="spacer" />
        <IconButton icon={FloppyDisk} label="Save grinder" variant="solid" disabled={!ok || busy} onClick={save} />
      </div>
    </>
  );
}
