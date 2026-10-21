import { useEffect, useId, useState } from "react";
import { ArrowLeft, FloppyDisk, PencilSimple, Plus, Target, Trash } from "@phosphor-icons/react";
import { dialedMethods } from "../group.ts";
import Radar from "../components/Radar.tsx";
import Fingerprint from "../components/Fingerprint.tsx";
import Shelf from "../components/Shelf.tsx";
import { BagToggle, BrewList } from "./History.tsx";
import { cleanAxes, cleanLayers, fromSerial, num, parseFlavour, profile, toSerial, type Flavour } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { PROCESSES, ROAST_LEVELS, methodDefs, type Cell, type Rec } from "../schema.ts";
import { deleteBean, newId, saveBean, saveSettings } from "../store.ts";
import { Button, Dialog, Field, IconButton, Msg, NumField, Segmented, SelectField, TextField } from "../ui.tsx";
import FlavourEditor from "../components/FlavourEditor.tsx";
import { ink } from "../palette.ts";

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
  const { db, arg, back } = useApp();
  // arg: "new" = blank form; "edit:<id>" = form; "<id>" = that coffee's page with its brew history.
  const [editing, setEditing] = useState<Rec | null>(() =>
    arg === "new" ? {} : arg?.startsWith("edit:") ? db.beans.find((b) => b.id === arg.slice(5)) ?? null : null);
  const viewing = arg && !editing && arg !== "new" && !arg.startsWith("edit:") ? db.beans.find((b) => b.id === arg) : undefined;
  const open = (b: Rec | null) => {
    setEditing(b);
    window.scrollTo(0, 0);
  };

  if (editing) {
    // Existing coffee: close the form back onto its page. New one: return to wherever "Add bean" was pressed.
    const done = () => (editing.id || arg !== "new" ? open(null) : back());
    return <BeanForm bean={editing} onDone={done} onSaved={done} />;
  }
  if (viewing) return <CoffeePage bean={viewing} onEdit={() => open(viewing)} />;

  // Library: every coffee, finished bags included.
  return (
    <div className="page stack-lg">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Library</h1>
        <Button icon={Plus} onClick={() => open({})}>Add bean</Button>
      </div>
      <Shelf beans={db.beans} storageKey="library" empty="No coffees yet. Add the bag you are brewing from." />
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

/** One coffee: its facts, roaster's radar, bag status and full brew history. */
function CoffeePage({ bean, onEdit }: { bean: Rec; onEdit: () => void }) {
  const { db, back, update, busy } = useApp();
  const [confirm, setConfirm] = useState(false);
  const brewCount = db.brews.filter((b) => b.bean_id === bean.id).length;
  const fl = parseFlavour(bean.flavour, db.settings.axes);
  const facts: [string, string][] = ([
    ["Roastery", str(bean.roastery)], ["Roaster's name", str(bean.product)], ["Origin", str(bean.origin)],
    ["Farm", str(bean.farm)], ["Variety", str(bean.variety)], ["Process", str(bean.process)],
    ["Roast level", str(bean.roast_level)], ["Roasted", ymd(bean.roast_date)],
    ["Altitude", [bean.altitude_low_m, bean.altitude_high_m].map(str).filter(Boolean).join(" to ") ? `${[bean.altitude_low_m, bean.altitude_high_m].map(str).filter(Boolean).join(" to ")} m` : ""],
    ["Roaster's notes", str(bean.roaster_notes)],
  ] as [string, string][]).filter(([, v]) => v);
  return (
    <div className="page stack-lg">
      <div className="page-head">
        <IconButton icon={ArrowLeft} label="Back" onClick={back} />
        <h1 style={{ flex: 1, minWidth: 0 }}>{str(bean.name) || "Unnamed"}</h1>
        <IconButton icon={PencilSimple} label="Edit coffee" onClick={onEdit} />
        <IconButton icon={Trash} label="Delete coffee" variant="danger" tipAlign="end" disabled={busy} onClick={() => setConfirm(true)} />
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${str(bean.name) || "this coffee"}?`}>
        <p>
          This removes the coffee{brewCount ? ` and its ${brewCount} ${brewCount === 1 ? "brew" : "brews"}` : ""} from your Google Sheet.
          It cannot be undone here (the sheet's version history still has it).
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button ghost onClick={() => setConfirm(false)}>Keep</Button>
          <Button icon={Trash} danger disabled={busy} onClick={async () => {
            const ok = await update((d) => deleteBean(d, str(bean.id)), `${str(bean.name) || "Coffee"} deleted`);
            if (ok) { setConfirm(false); back(); }
          }}>Delete</Button>
        </div>
      </Dialog>
      {fl.layers.length > 0 && <PageArt fl={fl} title={`${str(bean.name)} roaster notes`} />}
      {facts.length > 0 && (
        <dl className="kv">
          {facts.map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      <BagToggle bean={bean} />
      <DialedIn bean={bean} />
      <section className="section">
        <header><h2>Brew history</h2></header>
        <BrewList beanId={str(bean.id)} />
      </section>
    </div>
  );
}

/** The coffee's chart as a spider chart or blob, switchable here (saved as the coffee page setting, apart from card art). */
function PageArt({ fl, title }: { fl: Flavour; title: string }) {
  const { db, update, busy } = useApp();
  const s = db.settings;
  const art = s.page_art;
  const set = (p: Partial<typeof s>) => { if (!busy) update((d) => saveSettings(d, { ...d.settings, ...p })); };
  return (
    <div className="stack">
      <div className="grid-3">
        <Segmented full disabled={busy} label="Chart view" value={art} options={[["radar", "Spider"], ["blob", "Blob"]]} onChange={(page_art) => set({ page_art })} />
        {art === "radar" && <>
          <Segmented full disabled={busy} label="Shape" value={s.page_shape} options={[["sharp", "Sharp"], ["rounded", "Rounded"]]} onChange={(page_shape) => set({ page_shape })} />
          <Segmented full disabled={busy} label="Chart lines" value={s.page_grid ? "show" : "hide"} options={[["show", "Show"], ["hide", "Hide"]]} onChange={(v) => set({ page_grid: v === "show" })} />
        </>}
      </div>
      {art === "blob" ? (
        <>
          <div style={{ display: "grid", placeItems: "center" }} role="img" aria-label={title}>
            <Fingerprint axes={fl.axes} layers={fl.layers} size={280} />
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            {fl.layers.map((l, i) => <span key={i} className="chip" style={{ cursor: "default" }}><span className="swatch" style={{ background: ink(l.color) }} />{l.note}</span>)}
          </div>
        </>
      ) : <Radar axes={fl.axes} layers={fl.layers} size={360} title={title} rounded={s.page_shape === "rounded"} grid={s.page_grid} />}
    </div>
  );
}

/** Which brewing methods this coffee is dialed in for (stored on the bean as a comma list of method ids). */
function DialedIn({ bean }: { bean: Rec }) {
  const { db, update, busy } = useApp();
  const on = dialedMethods(bean);
  const toggle = (id: string) => {
    const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
    update((d) => saveBean(d, { id: bean.id, dialed: next.join(",") }));
  };
  return (
    <div className="field">
      <span className="label">Dialed in for</span>
      <div className="row" role="group" aria-label="Dialed in for">
        {methodDefs(db.fields).map((m) => (
          <button key={m.id} type="button" className="chip" aria-pressed={on.includes(m.id)} disabled={busy} onClick={() => toggle(m.id)}>
            {on.includes(m.id) && <Target size={16} weight="fill" aria-hidden />}
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
