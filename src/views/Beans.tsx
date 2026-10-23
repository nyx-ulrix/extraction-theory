import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowLeft, Camera, Coffee, Export, FloppyDisk, MagicWand, PencilSimple, Plus, QrCode, Scan, Target, Trash, X } from "@phosphor-icons/react";
import { dialedMethods } from "../group.ts";
import Radar from "../components/Radar.tsx";
import Fingerprint from "../components/Fingerprint.tsx";
import Shelf from "../components/Shelf.tsx";
import ExportChart from "../components/ExportChart.tsx";
import { BagToggle, BrewList } from "./History.tsx";
import { DEFAULT_AXES, axisKey, clamp10, cleanAxes, cleanLayers, fromSerial, num, parseFlavour, profile, toSerial, type AxisDef, type Flavour } from "../calc.ts";
import { BEAN_FORM, keepForm, readForm, useApp } from "../ctx.ts";
import { PROCESSES, ROAST_LEVELS, frozenOn, methodDefs, type Cell, type Rec } from "../schema.ts";
import { deleteBean, newId, saveBean, saveSettings } from "../store.ts";
import { Button, Dialog, Field, IconButton, Msg, NumField, Segmented, SelectField, TextField, Toggle } from "../ui.tsx";
import { DateField } from "../components/DateField.tsx";
import FlavourEditor, { syncLayers } from "../components/FlavourEditor.tsx";
import { MAX_BAG_PHOTOS, getKey, photo, readBag, type BagInfo, type ChartNote, type Img } from "../ai.ts";
import { ink, noteColour, paletteHex } from "../palette.ts";

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
  const { db, arg, back, go } = useApp();
  // arg: "new" = blank form; "edit:<id>" = form; "<id>" = that coffee's page with its brew history.
  // Unsaved edits left by a reload or a trip to Google's sign-in page reopen their form.
  const [editing, setEditing] = useState<Rec | null>(() => {
    if (arg === "new") return {};
    if (arg?.startsWith("edit:")) return db.beans.find((b) => b.id === arg.slice(5)) ?? null;
    // Only where it was left: the library reopens a new-bean draft, a bean's page only its own draft.
    const kept = readForm<BeanDraft>(BEAN_FORM);
    if (!kept || arg !== (kept.id || undefined)) return null;
    if (!kept.id) return {};
    const b = db.beans.find((x) => x.id === kept.id);
    if (!b) keepForm(BEAN_FORM, null); // bean deleted elsewhere: nothing to reopen
    return b ?? null;
  });
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
  if (viewing) return <CoffeePage key={str(viewing.id)} bean={viewing} onEdit={() => open(viewing)} />;

  // Library: every coffee, finished bags included.
  return (
    <div className="page stack-lg">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Library</h1>
        <div className="row">
          <IconButton icon={Scan} label="Scan a coffee code" onClick={() => go("scan")} />
          <Button icon={Plus} onClick={() => open({})}>Add bean</Button>
        </div>
      </div>
      <Shelf beans={db.beans} storageKey="library" empty="No coffees yet. Add the bag you are brewing from." />
    </div>
  );
}

interface BeanDraft { id: string; f: Rec; flav: Flavour }

function BeanForm({ bean, onDone, onSaved }: { bean: Rec; onDone: () => void; onSaved: () => void }) {
  const { db, update, busy, setDirty, go, notify } = useApp();
  const [kept] = useState(() => {
    const k = readForm<BeanDraft>(BEAN_FORM);
    return k && k.id === str(bean.id) ? k : null;
  });
  const [f, setF] = useState<Rec>(kept?.f ?? bean);
  const [flav0] = useState<Flavour>(() => parseFlavour(bean.flavour, db.settings.axes));
  const [flav, setFlav] = useState<Flavour>(kept?.flav ?? flav0);
  const [err, setErr] = useState("");
  const dateId = useId();
  const set = (k: string) => (v: Cell) => setF((p) => ({ ...p, [k]: v }));
  // Values from your other coffees, so repeats are a pick rather than retyping.
  const used = (k: string) => [...new Set(db.beans.map((b) => str(b[k]).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const dirty = KEYS.some((k) => str(f[k]) !== str(bean[k])) || JSON.stringify(flav) !== JSON.stringify(flav0);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  useEffect(() => { keepForm(BEAN_FORM, dirty ? { id: str(bean.id), f, flav } satisfies BeanDraft : null); }, [dirty, f, flav, bean.id]);
  useEffect(() => {
    if (kept) notify("Restored your unsaved edits to this bean.", "info");
    return () => keepForm(BEAN_FORM, null); // form closed: saved or discarded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const back = () => {
    if (dirty && !window.confirm("Discard changes to this bean?")) return;
    onDone();
  };
  // Auto-fill only fills empty fields, so nothing already typed is overwritten.
  // Functional updates: whatever was typed while the photos were being read is kept.
  const fill = (info: BagInfo, sent: AxisDef[]) => {
    const { tasting_notes: notes, roast_date: date, roast_level: level, chart, printed_axes: printed, ...rest } = info;
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
    // The chart is filled only when the coffee has none yet: the roaster's printed axes if the bag has them,
    // each note scored and coloured by the model; without a chart, notes start from the usual starter shape.
    if (text) setFlav((p) => {
      if (p.layers.length) return p;
      const drawn = chart?.length ? chartFrom(chart, JSON.stringify(p.axes) === JSON.stringify(flav0.axes) ? printed : undefined, sent) : null;
      return drawn ?? { axes: p.axes, layers: syncLayers(text, [], p.axes) };
    });
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
        <BagFill onFill={fill} axes={flav.axes} />
        <div className="grid-2">
          <TextField label="Bean name" value={str(f.name)} onChange={set("name")} hint="What's on the front of the bag, for example Colombia Huila" />
          <TextField label="Roaster's name for it" value={str(f.product)} onChange={set("product")} hint="For example Halo or Nano" />
        </div>
        <div className="grid-2">
          <SelectField label="Roastery" value={str(f.roastery)} other placeholder="Choose" options={used("roastery")} onChange={set("roastery")} />
          <SelectField label="Origin" value={str(f.origin)} other placeholder="Choose" options={used("origin")} onChange={set("origin")} />
        </div>
        <div className="grid-2">
          <SelectField label="Farm / producer" value={str(f.farm)} other placeholder="Choose" options={used("farm")} onChange={set("farm")} />
          <SelectField label="Variety" value={str(f.variety)} other placeholder="Choose" options={used("variety")} onChange={set("variety")} />
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
        {!getKey(db.settings.ai_provider) && (
          <p className="meta">
            Optional: add an AI key in <button type="button" className="linkish" onClick={() => go("settings", "ai")}>Settings, AI</button> to fill this form from photos of the bag.
          </p>
        )}
      </div>
      {err && <Msg kind="error">{err}</Msg>}
      <div className="savebar">
        <span>{dirty ? "Unsaved changes." : ""}</span>
        <Button icon={FloppyDisk} onClick={save} disabled={busy}>Save bean</Button>
      </div>
    </div>
  );
}

/** The model's scored notes as a chart: printed axes keep matching template colours, cup-wide axes share one value. */
function chartFrom(chart: ChartNote[], printed: string[] | undefined, template: AxisDef[]): Flavour | null {
  // Printed axes that clean down to a different list (duplicates, blanks) can't be lined up with the scores.
  const fromPrint = printed && cleanAxes(printed.map((label, i) => {
    const same = template.find((a) => a.key === axisKey(label));
    return { label, color: same?.color ?? DEFAULT_AXES[i % DEFAULT_AXES.length].color, shared: same?.shared ?? false };
  }));
  const usable = fromPrint && fromPrint.length === printed!.length ? fromPrint : null;
  const axes = usable ?? template;
  const scored = usable ? printed! : template.map((a) => a.label);
  if (!chart.every((n) => n.values.length === scored.length)) return null;
  const at = new Map(scored.map((l, i) => [axisKey(l), i]));
  const layers = cleanLayers(chart.map((n) => ({
    note: n.note,
    color: paletteHex(n.colour) ?? noteColour(n.note),
    v: Object.fromEntries(axes.map((a) => [a.key, clamp10(n.values[at.get(a.key) ?? -1] ?? 0)])),
  })), axes);
  // Cup-wide axes take the highest score, so the profile matches what the bag says.
  for (const a of axes.filter((x) => x.shared)) {
    const v = Math.max(0, ...layers.map((l) => l.v[a.key] ?? 0));
    for (const l of layers) l.v[a.key] = v;
  }
  return { axes, layers };
}

/** Up to two photos of the bag (front and back), read with the user's own AI key to fill the form. */
function BagFill({ onFill, axes }: { onFill: (info: BagInfo, sent: AxisDef[]) => void; axes: AxisDef[] }) {
  const { db, notify } = useApp();
  const { ai_provider: provider, ai_model: model } = db.settings;
  const [shots, setShots] = useState<(Img & { url: string })[]>([]);
  const [reading, setReading] = useState(false);
  const inputId = useId();
  if (!getKey(provider)) return null;
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
      const info = await readBag(shots, provider, model, axes);
      if (!Object.keys(info).length) return notify("Nothing readable on that label. Try a closer, sharper photo.", "info");
      onFill(info, axes);
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
        <IconButton icon={QrCode} label="Share as QR code" onClick={() => go("share", str(bean.id))} />
        <IconButton icon={PencilSimple} label="Edit coffee" tipAlign="end" onClick={onEdit} />
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
      {fl.layers.length > 0 && (
        <PageArt fl={fl} title={`${str(bean.name)} roaster notes`}
          extra={<IconButton icon={Export} label="Export as image" onClick={() => setExporting(true)} />} />
      )}
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
      <div className="delete-coffee">
        <Button icon={Trash} danger disabled={busy} onClick={() => setConfirm(true)}>Delete coffee</Button>
      </div>
      {/* New brew of this coffee, starting from its last recipe. */}
      <button type="button" className="fab" aria-label="New brew" data-tip="New brew" onClick={() => go("brew", `bean:${str(bean.id)}`)}>
        <Coffee size={28} aria-hidden />
      </button>
    </div>
  );
}

/** The coffee's chart as a spider chart or blob, switchable here (saved as the coffee page setting, apart from card art). */
function PageArt({ fl, title, extra }: { fl: Flavour; title: string; extra?: ReactNode }) {
  const { db, update, busy } = useApp();
  const s = db.settings;
  const art = s.page_art;
  // Blob view: tapping a note shows it alone, as the spider chart's legend does.
  const [solo, setSolo] = useState<number | null>(null);
  const shown = solo != null && fl.layers[solo] ? [fl.layers[solo]] : fl.layers;
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
            <Fingerprint axes={fl.axes} layers={shown} size={280} dense />
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            {fl.layers.map((l, i) => (
              <button key={i} type="button" className="chip" style={{ minHeight: 44 }} aria-pressed={solo === i}
                aria-label={solo === i ? `${l.note}, showing alone. Tap to show all notes` : `Show ${l.note} alone`}
                onClick={() => setSolo(solo === i ? null : i)}>
                <span className="swatch" style={{ background: ink(l.color) }} />{l.note}
              </button>
            ))}
            {extra}
          </div>
        </>
      ) : <Radar axes={fl.axes} layers={fl.layers} size={360} title={title} rounded={s.page_shape === "rounded"} grid={s.page_grid} pitch={2.3} legendEnd={extra} />}
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
