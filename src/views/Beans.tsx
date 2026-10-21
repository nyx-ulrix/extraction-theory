import { useEffect, useId, useState } from "react";
import { ArrowLeft, FloppyDisk, Plus } from "@phosphor-icons/react";
import { cleanAxes, cleanLayers, daysOffRoast, fromSerial, num, parseFlavour, profile, toSerial, type Flavour } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { PROCESSES, ROAST_LEVELS, type Cell, type Rec } from "../schema.ts";
import { newId, saveBean } from "../store.ts";
import { Button, Field, IconButton, Msg, NumField, SelectField, TextField } from "../ui.tsx";
import FlavourEditor from "../components/FlavourEditor.tsx";

const str = (v: unknown) => (v == null ? "" : String(v));
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (v: unknown) => {
  const n = num(v);
  if (n == null) return "";
  const d = fromSerial(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Only the columns this form edits are written, so other values typed into the sheet stay.
const KEYS = [
  "name", "product", "roastery", "origin", "farm", "altitude_low_m", "altitude_high_m",
  "variety", "process", "roast_level", "roast_date", "roaster_notes",
];

export default function Beans() {
  const { db, arg, go } = useApp();
  // arg "new" (first run, from the brew form) opens a blank bean and returns to Brew once it is saved.
  const [toBrew, setToBrew] = useState(arg === "new");
  const [editing, setEditing] = useState<Rec | null>(() =>
    arg === "new" ? {} : arg ? db.beans.find((b) => b.id === arg) ?? null : null);
  const open = (b: Rec | null) => {
    setToBrew(false);
    setEditing(b);
    window.scrollTo(0, 0);
  };

  if (editing) return <BeanForm bean={editing} onDone={() => open(null)} onSaved={() => (toBrew ? go("brew") : open(null))} />;

  const today = toSerial(new Date());
  const beans = [...db.beans].sort((a, b) => (num(b.created) ?? 0) - (num(a.created) ?? 0));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Beans</h1>
        {beans.length > 0 && <IconButton icon={Plus} label="Add a bean" onClick={() => open({})} />}
      </div>
      {beans.length ? (
        <div className="list">
          {beans.map((b) => {
            const days = daysOffRoast(num(b.roast_date), today);
            const brews = db.brews.filter((x) => x.bean_id === b.id).length;
            return (
              <div className="item" key={str(b.id)}>
                <button type="button" className="item-main" onClick={() => open(b)}>
                  <span className="item-title">
                    {str(b.name) || "Unnamed"}
                    <span className="muted">{str(b.roastery) || "-"}</span>
                  </span>
                  <span className="meta num">
                    <span>{str(b.origin) || "-"}</span>
                    <span>{str(b.process) || "-"}</span>
                    <span>Roasted {ymd(b.roast_date) || "-"}</span>
                    <span>{days == null ? "-" : `${days} d off roast`}</span>
                    <span>{brews} {brews === 1 ? "brew" : "brews"}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <p>No beans yet. Add the bag you are brewing from.</p>
          <div><Button icon={Plus} onClick={() => open({})}>Add a bean</Button></div>
        </>
      )}
    </div>
  );
}

function BeanForm({ bean, onDone, onSaved }: { bean: Rec; onDone: () => void; onSaved: () => void }) {
  const { db, update, busy, setDirty } = useApp();
  const [f, setF] = useState<Rec>(bean);
  const [flav0] = useState<Flavour>(() => parseFlavour(bean.flavour, db.settings.axes));
  const [flav, setFlav] = useState<Flavour>(flav0);
  const [err, setErr] = useState("");
  const dateId = useId();
  const set = (k: string) => (v: Cell) => setF((p) => ({ ...p, [k]: v }));
  const dirty = KEYS.some((k) => str(f[k]) !== str(bean[k])) || JSON.stringify(flav) !== JSON.stringify(flav0);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const back = () => {
    if (dirty && !window.confirm("Discard changes to this bean?")) return;
    onDone();
  };

  const save = async () => {
    const name = str(f.name).trim();
    if (!name) return setErr("Add a bean name.");
    setErr("");
    const axes = cleanAxes(flav.axes);
    const layers = cleanLayers(flav.layers, axes);
    const prof = profile(layers, axes);
    const rec: Rec = {
      ...Object.fromEntries(KEYS.map((k) => [k, f[k] ?? null])),
      id: str(bean.id) || newId(),
      created: bean.created ?? toSerial(new Date()),
      name,
      flavour: JSON.stringify({ axes, layers }),
      ...Object.fromEntries(axes.map((a) => [`f_${a.key}`, prof[a.key] ?? 0])),
    };
    if (!(await update((d) => saveBean(d, rec), "Bean saved"))) return;
    setDirty(false);
    onSaved();
  };

  return (
    <div className="page">
      <div className="row">
        <IconButton icon={ArrowLeft} label="Back to beans" onClick={back} />
        <h1>{bean.id ? str(bean.name) || "Edit bean" : "New bean"}</h1>
      </div>
      <div className="stack">
        <div className="grid-2">
          <TextField label="Bean name" value={str(f.name)} onChange={set("name")} hint="Usually the farm or producer" />
          <TextField label="Roaster's name for it" value={str(f.product)} onChange={set("product")} hint="For example Halo or Nano" />
        </div>
        <div className="grid-2">
          <TextField label="Roastery" value={str(f.roastery)} onChange={set("roastery")} />
          <TextField label="Origin" value={str(f.origin)} onChange={set("origin")} />
        </div>
        <div className="grid-2">
          <TextField label="Farm / producer" value={str(f.farm)} onChange={set("farm")} />
          <TextField label="Variety" value={str(f.variety)} onChange={set("variety")} />
        </div>
        <div className="grid-2">
          <NumField label="Altitude low" unit="m" min={0} value={num(f.altitude_low_m)} onChange={set("altitude_low_m")} />
          <NumField label="Altitude high" unit="m" min={0} value={num(f.altitude_high_m)} onChange={set("altitude_high_m")} />
        </div>
        <div className="grid-2">
          <SelectField label="Process" value={str(f.process)} options={PROCESSES} other onChange={set("process")} />
          <SelectField label="Roast level" value={str(f.roast_level)} options={ROAST_LEVELS} onChange={set("roast_level")} />
        </div>
        <Field label="Roast date" id={dateId}>
          <input
            id={dateId} className="input num" type="date" value={ymd(f.roast_date)}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split("-").map(Number);
              set("roast_date")(e.target.value ? toSerial(new Date(y, m - 1, d)) : null);
            }}
          />
        </Field>
        <FlavourEditor
          label="Roaster tasting notes" notes={str(f.roaster_notes)} onNotes={set("roaster_notes")}
          value={flav} onChange={setFlav} template={db.settings.axes}
        />
        <p className="meta">Brews of this bean start from its radar axes.</p>
      </div>
      {err && <Msg kind="error">{err}</Msg>}
      <div className="savebar">
        <span>{dirty ? "Unsaved changes." : ""}</span>
        <Button icon={FloppyDisk} onClick={save} disabled={busy}>Save bean</Button>
      </div>
    </div>
  );
}
