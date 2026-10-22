import { useEffect, useId, useState } from "react";
import { ArrowLeft, Camera, Coffee, Export, FloppyDisk, MagicWand, PencilSimple, Plus, Target, Trash, X } from "@phosphor-icons/react";
import { dialedMethods } from "../group.ts";
import Radar from "../components/Radar.tsx";
import Fingerprint from "../components/Fingerprint.tsx";
import Shelf from "../components/Shelf.tsx";
import ExportChart from "../components/ExportChart.tsx";
import { BagToggle, BrewList } from "./History.tsx";
import { cleanAxes, cleanLayers, fromSerial, num, parseFlavour, profile, toSerial, type Flavour } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { PROCESSES, ROAST_LEVELS, frozenOn, methodDefs, type Cell, type Rec } from "../schema.ts";
import { deleteBean, newId, saveBean, saveSettings } from "../store.ts";
import { Button, Dialog, Field, IconButton, Msg, NumField, Segmented, SelectField, TextField, Toggle } from "../ui.tsx";
import { DateField } from "../components/DateField.tsx";
import FlavourEditor, { syncLayers } from "../components/FlavourEditor.tsx";
import { MAX_BAG_PHOTOS, getKey, photo, readBag, type BagInfo, type Img } from "../ai.ts";
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
  "variety", "process", "roast_level", "roast_date", "frozen", "frozen_date", "roaster_notes",
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
  // Auto-fill only fills empty fields, so nothing already typed is overwritten.
  // Functional updates: whatever was typed while the photos were being read is kept.
  const fill = (info: BagInfo) => {
    const { tasting_notes: notes, roast_date: date, roast_level: level, ...rest } = info;
    const text = notes?.join(", ") ?? "";
    setF((p) => {
      const next: Rec = { ...p };
      const empty = (k: string) => next[k] == null || next[k] === "";
      for (const [k, v] of Object.entries(rest)) if (KEYS.includes(k) && empty(k)) next[k] = v as Cell;
      const lv = ROAST_LEVELS.find((r) => r.toLowerCase() === String(level ?? "").trim().toLowerCase());
      if (lv && empty("roast_level")) next.roast_level = lv;
      const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
      if (d && empty("roast_date")) next.roast_date = toSerial(new Date(+d[1], +d[2] - 1, +d[3]));
      if (text && !str(next.roaster_notes).trim()) next.roaster_notes = text;
      return next;
    });
    // Notes become layers only when the coffee has none yet.
    if (text) setFlav((p) => (p.layers.length ? p : { axes: p.axes, layers: syncLayers(text, [], p.axes) }));
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
        <BagFill onFill={fill} />
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
        {/* Frozen beans stop ageing: days off roast counts only up to the freeze date. */}
        <div className="grid-2">
          <Toggle label="Frozen" checked={f.frozen === true || str(f.frozen) === "true"}
            onChange={(v) => setF((p) => ({ ...p, frozen: v, frozen_date: v ? (p.frozen_date ?? toSerial(new Date(new Date().setHours(0, 0, 0, 0)))) : p.frozen_date }))} />
          {(f.frozen === true || str(f.frozen) === "true") && (
            <DateField label="Frozen on" value={num(f.frozen_date)} onChange={(v) => setF((p) => ({ ...p, frozen_date: v }))} />
          )}
        </div>
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

/** Up to two photos of the bag (front and back), read with the user's own AI key to fill the form. */
function BagFill({ onFill }: { onFill: (info: BagInfo) => void }) {
  const { db, notify, go } = useApp();
  const { ai_provider: provider, ai_model: model } = db.settings;
  const [shots, setShots] = useState<(Img & { url: string })[]>([]);
  const [reading, setReading] = useState(false);
  const inputId = useId();
  if (!getKey(provider)) {
    return (
      <p className="meta">
        Add an AI key in <button type="button" className="linkish" onClick={() => go("settings", "ai")}>Settings, AI</button> to fill this form from photos of the bag.
      </p>
    );
  }
  const add = async (files: FileList | null) => {
    const room = MAX_BAG_PHOTOS - shots.length;
    const picked = [...(files ?? [])].slice(0, room); // some Android pickers give no MIME type: let decoding decide
    try {
      const imgs = await Promise.all(picked.map(photo));
      setShots((s) => [...s, ...imgs.map((i) => ({ ...i, url: `data:${i.type};base64,${i.data}` }))].slice(0, MAX_BAG_PHOTOS));
    } catch {
      notify("Could not read that photo.", "error");
    }
  };
  const run = async () => {
    setReading(true);
    try {
      const info = await readBag(shots, provider, model);
      if (!Object.keys(info).length) return notify("Nothing readable on that label. Try a closer, sharper photo.", "info");
      onFill(info);
      notify("Filled from the bag. Check the details before saving.", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setReading(false);
    }
  };
  return (
    <section className="bagfill">
      <span className="label">Auto-fill from the bag</span>
      <div className="row">
        {shots.map((s, i) => (
          <span key={i} className="bag-thumb">
            <img src={s.url} alt={`Bag photo ${i + 1}`} />
            <IconButton icon={X} label={`Remove photo ${i + 1}`} onClick={() => setShots(shots.filter((_, j) => j !== i))} />
          </span>
        ))}
        {shots.length < MAX_BAG_PHOTOS && (
          <label className="btn ghost" htmlFor={inputId}>
            <Camera size={18} aria-hidden />{shots.length ? "Add back of bag" : "Add photo"}
            <input
              id={inputId} type="file" accept="image/*" multiple className="sr-only"
              onChange={(e) => { add(e.target.files); e.target.value = ""; }}
            />
          </label>
        )}
        <Button icon={MagicWand} onClick={run} disabled={!shots.length || reading}>{reading ? "Reading..." : "Fill details"}</Button>
      </div>
      <span className="meta">Up to {MAX_BAG_PHOTOS} photos, for example the front and back. Only empty fields are filled.</span>
    </section>
  );
}

/** One coffee: its facts, roaster's radar, bag status and full brew history. */
function CoffeePage({ bean, onEdit }: { bean: Rec; onEdit: () => void }) {
  const { db, back, update, busy, go } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const brewCount = db.brews.filter((b) => b.bean_id === bean.id).length;
  const fl = parseFlavour(bean.flavour, db.settings.axes);
  const facts: [string, string][] = ([
    ["Roastery", str(bean.roastery)], ["Roaster's name", str(bean.product)], ["Origin", str(bean.origin)],
    ["Farm", str(bean.farm)], ["Variety", str(bean.variety)], ["Process", str(bean.process)],
    ["Roast level", str(bean.roast_level)], ["Roasted", ymd(bean.roast_date)],
    ["Frozen on", frozenOn(bean) != null ? ymd(frozenOn(bean)) : ""],
    ["Altitude", [bean.altitude_low_m, bean.altitude_high_m].map(str).filter(Boolean).join(" to ") ? `${[bean.altitude_low_m, bean.altitude_high_m].map(str).filter(Boolean).join(" to ")} m` : ""],
    ["Roaster's notes", str(bean.roaster_notes)],
  ] as [string, string][]).filter(([, v]) => v);
  return (
    <div className="page stack-lg">
      <div className="page-head">
        <IconButton icon={ArrowLeft} label="Back" onClick={back} />
        <h1 style={{ flex: 1, minWidth: 0 }}>{str(bean.name) || "Unnamed"}</h1>
        {fl.layers.length > 0 && <IconButton icon={Export} label="Export chart" onClick={() => setExporting(true)} />}
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
      {exporting && <ExportChart bean={bean} fl={fl} open onClose={() => setExporting(false)} />}
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
      {/* New brew of this coffee, starting from its last recipe. */}
      <button type="button" className="fab" aria-label="New brew" data-tip="New brew" onClick={() => go("brew", `bean:${str(bean.id)}`)}>
        <Coffee size={28} aria-hidden />
      </button>
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
            <Fingerprint axes={fl.axes} layers={fl.layers} size={280} dense />
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            {fl.layers.map((l, i) => <span key={i} className="chip" style={{ cursor: "default" }}><span className="swatch" style={{ background: ink(l.color) }} />{l.note}</span>)}
          </div>
        </>
      ) : <Radar axes={fl.axes} layers={fl.layers} size={360} title={title} rounded={s.page_shape === "rounded"} grid={s.page_grid} pitch={2.3} />}
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
