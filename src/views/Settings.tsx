import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowCounterClockwise, ArrowDown, ArrowLeft, ArrowUp, CaretDown, CaretRight, ChartPolar, Database, DownloadSimple, Drop,
  FloppyDisk, GithubLogo, Globe, LinkedinLogo, Palette, Plus, Rows, SignOut, Table, Trash, UploadSimple, UserCircle, Wrench, type Icon,
} from "@phosphor-icons/react";
import { DEFAULT_AXES, cleanAxes, parsePattern, type DialType, type Layer } from "../calc.ts";
import Radar from "../components/Radar.tsx";
import Fingerprint from "../components/Fingerprint.tsx";
import { PROVIDERS, getKey, setKey, type Provider } from "../ai.ts";
import { useApp } from "../ctx.ts";
import { signOut } from "../google.ts";
import { useInstall } from "../install.ts";
import {
  SECTIONS, availableKeys, layoutFor, methodDefs, type DripperStyle, type Gear, type Preset, type Settings as S, OPTIONAL_SECTIONS
} from "../schema.ts";
import { sheetUrl } from "../sheets.ts";
import { fillGrinder, importData, saveGear, saveSettings } from "../store.ts";
import { Button, Dialog, Field, IconButton, NumField, Section, Segmented, SelectField, TextField } from "../ui.tsx";
import AxesEditor from "../components/AxesEditor.tsx";
import importGuide from "../import-guide.md?raw";
import { PAPERS } from "../papers.ts";
import { DripperDialog } from "../components/brew/Dripper.tsx";
import { GrinderDialog } from "../components/brew/Grind.tsx";
import { IconLink, setTheme, useTheme } from "../App.tsx";

type Patch = (p: Partial<S>) => void;

export default function Settings() {
  const { db, update, busy, setDirty, arg, go, back, notify } = useApp();
  const [s, setS] = useState<S>(db.settings);
  const lockedHours = Math.ceil((s.pretentious_lock + LOCK_MS - Date.now()) / 3_600_000);
  const edited = useRef(new Set<string>());
  const patch: Patch = (p) => { Object.keys(p).forEach((k) => edited.current.add(k)); setS((x) => ({ ...x, ...p })); };
  // Settings reloaded from the sheet (the app opens on its saved copy first): follow them unless edited here.
  const base = useRef(db.settings);
  useEffect(() => {
    setS((x) => (JSON.stringify(x) === JSON.stringify(base.current) ? db.settings : x));
    base.current = db.settings;
  }, [db.settings]);
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const problem = s.presets.some((p) => !p.name.trim() || !parsePattern(p.pattern))
    ? "Each preset needs a name and a pattern like 1:2:3."
    : s.axes.some((a) => !a.label.trim()) ? "Each radar axis needs a label." : "";
  const save = async () => {
    // Only the keys changed on this page: anything updated elsewhere since it opened stays as it is.
    const mine = Object.fromEntries([...edited.current].map((k) => [k, s[k as keyof S]]));
    let next: S = s;
    if (await update((d) => {
      next = { ...d.settings, ...mine, axes: cleanAxes(edited.current.has("axes") ? s.axes : d.settings.axes) };
      return saveSettings(d, next);
    }, "Settings saved")) { edited.current.clear(); setS(next); }
  };

  // Layered: a short list of categories; each opens its own page (arg), and back returns to the list.
  const cat = CATS.find(([k]) => k === arg);
  if (!cat) {
    return (
      <div className="page">
        <h1>Settings</h1>
        <div className="list">
          {CATS.map(([k, title, desc, I]) => (
            <div className="item" key={k}>
              <button type="button" className="item-main settings-row" onClick={() => go("settings", k)}>
                <I size={22} aria-hidden />
                <span className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                  <span className="item-title">{title}</span>
                  <span className="meta">{desc}</span>
                </span>
                <CaretRight size={18} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <footer className="credit">
          <span>Created by Jia En</span>
          <span className="spacer" />
          <IconLink href="https://liewjiaen.com" icon={Globe} label="Portfolio" />
          <IconLink href="https://github.com/nyx-ulrix" icon={GithubLogo} label="GitHub" />
          <IconLink href="https://www.linkedin.com/in/malcolmliewjiaen/" icon={LinkedinLogo} label="LinkedIn" />
        </footer>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <IconButton icon={ArrowLeft} label="Back to settings" onClick={back} />
        <h1 style={{ flex: 1, minWidth: 0 }}>{cat[1]}</h1>
      </div>
      {arg === "brewing" && <Brewing s={s} patch={patch} />}
      {arg === "form" && (<>
        <Section title="Brew form">
          <Segmented label="Mode" full value={s.brew_mode} options={[["basic", "I have a life"], ["advanced", "I'm a snob"], ["pretentious", "Pretentious"]]} onChange={(brew_mode) => {
            if (brew_mode === "pretentious" && lockedHours > 0) return notify(`You stepped down. Pretentious unlocks in ${lockedHours} h.`, "info");
            const leaving = db.settings.brew_mode === "pretentious" && brew_mode !== "pretentious";
            patch(leaving ? { brew_mode, pretentious_lock: Date.now() } : { brew_mode });
          }} />
          <p className="meta">{s.brew_mode === "basic"
            ? "I have a life shows the essentials: grind, dose and ratio, temperature, and for pour-overs the pours, dripper and paper. Pick I'm a snob to choose which fields show."
            : s.brew_mode === "advanced" ? "I'm a snob shows what you tick below, in the order you set."
            : "Pretentious shows every variable, takes grind size in microns only, and won't log a brew without the water's GH and KH."}</p>
          {lockedHours > 0 && s.brew_mode !== "pretentious" && <p className="meta">You stepped down from Pretentious. It unlocks in {lockedHours} h.</p>}
        </Section>
        {s.brew_mode !== "basic" && <><Optional s={s} patch={patch} /><Layout s={s} patch={patch} /></>}
      </>)}
      {arg === "chart" && (
        <>
          <ChartStyle s={s} patch={patch} />
          <Section title="Radar axes">
            <AxesEditor axes={s.axes} onChange={(axes) => patch({ axes })} template={DEFAULT_AXES} />
          </Section>
        </>
      )}
      {arg === "gear" && (<><MyGrinders s={s} patch={patch} /><MyPapers s={s} patch={patch} /><Drippers /><Grinders /></>)}
      {arg === "ai" && <Ai s={s} patch={patch} />}
      {arg === "data" && <ImportData />}
      {arg === "account" && <Account />}
      {dirty && (
        <div className="savebar">
          <span>{problem || "Unsaved changes."}</span>
          <Button icon={FloppyDisk} disabled={busy || !!problem} onClick={save}>
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
}

const CATS: [string, string, string, Icon][] = [
  ["brewing", "Brewing", "Pour entry, grind input, split presets", Drop],
  ["form", "Brew form", "Which sections each method shows, in what order", Rows],
  ["chart", "Flavour chart", "Chart shape, chart lines, card and page art, radar axes", ChartPolar],
  ["gear", "Gear", "Drippers and grinders", Wrench],
  ["ai", "AI", "Your API key for filling a bean from bag photos", Palette],
  ["data", "Import", "Add beans and brews from JSON", Database],
  ["account", "Account", "Your sheet, theme, install app, sign out", UserCircle],
];

const SAMPLE: Layer[] = [
  { note: "Peach", color: "#E9AE80", v: { sweetness: 8, aroma: 6, bitterness: 0, body: 4, acidity: 4, finish: 4 } },
  { note: "Dark chocolate", color: "#4A382B", v: { sweetness: 2, aroma: 4, bitterness: 6, body: 7, acidity: 1, finish: 7 } },
];

const SHAPES: [S["radar_shape"], string][] = [["sharp", "Sharp"], ["rounded", "Rounded"]];
const LINES: ["show" | "hide", string][] = [["show", "Show"], ["hide", "Hide"]];

function ChartStyle({ s, patch }: { s: S; patch: Patch }) {
  return (
    <Section title="Chart style">
      <h3 className="label">Home and Library cards</h3>
      <div className="grid-3">
        <Segmented full label="Art" value={s.card_art} onChange={(card_art) => patch({ card_art })} options={[["radar", "Spider"], ["blob", "Blob"]]} />
        <Segmented full label="Shape" value={s.card_shape} onChange={(card_shape) => patch({ card_shape })} options={SHAPES} />
        <Segmented full label="Chart lines" value={s.card_grid ? "show" : "hide"} onChange={(v) => patch({ card_grid: v === "show" })} options={LINES} />
      </div>
      <h3 className="label">Coffee pages</h3>
      <div className="grid-3">
        <Segmented full label="Chart" value={s.page_art} onChange={(page_art) => patch({ page_art })} options={[["radar", "Spider"], ["blob", "Blob"]]} />
        <Segmented full label="Shape" value={s.page_shape} onChange={(page_shape) => patch({ page_shape })} options={SHAPES} />
        <Segmented full label="Chart lines" value={s.page_grid ? "show" : "hide"} onChange={(v) => patch({ page_grid: v === "show" })} options={LINES} />
      </div>
      <h3 className="label">Brews and note editors</h3>
      <div className="grid-3">
        <Segmented full label="Shape" value={s.radar_shape} onChange={(radar_shape) => patch({ radar_shape })} options={SHAPES} />
        <Segmented full label="Chart lines" value={s.radar_grid ? "show" : "hide"} onChange={(v) => patch({ radar_grid: v === "show" })} options={LINES} />
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Preview shows the brews and note editors style.</p>
      <div className="grid-2" style={{ alignItems: "center" }}>
        <Radar axes={DEFAULT_AXES} layers={SAMPLE} size={280} legend={false} title="Chart preview"
          rounded={s.radar_shape === "rounded"} grid={s.radar_grid} />
        <div style={{ display: "grid", placeItems: "center" }}>
          <Fingerprint axes={DEFAULT_AXES} layers={SAMPLE} size={140} />
          <span className="meta">Blob card art</span>
        </div>
      </div>
    </Section>
  );
}

function Brewing({ s, patch }: { s: S; patch: Patch }) {
  const { db } = useApp();
  const setPreset = (i: number, p: Partial<Preset>) => patch({ presets: s.presets.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <Section title="Brewing">
      <Segmented label="Pour entry" value={s.pour_style} onChange={(pour_style) => patch({ pour_style })}
        options={[["per_pour", "Per pour"], ["target", "Target weight"]]} />
      <Segmented label="Grind input first" value={s.grind_first} onChange={(grind_first) => patch({ grind_first })}
        options={[["setting", "Setting"], ["microns", "Microns"]]} />
      <div className="stack">
        <div className="page-head">
          <span className="label">Split presets</span>
          <IconButton icon={Plus} label="Add preset" onClick={() => patch({ presets: [...s.presets, { name: "", pattern: "" }] })} />
        </div>
        {s.presets.length ? s.presets.map((p, i) => (
          <PresetRow key={i} p={p} onChange={(x) => setPreset(i, x)} onRemove={() => patch({ presets: s.presets.filter((_, j) => j !== i) })} />
        )) : <p>No presets. Add one to split pours in one tap.</p>}
      </div>
      <div className="stack">
        <span className="label">Saved recipes</span>
        {s.recipes.length ? (
          <div className="list">
            {s.recipes.map((r, i) => (
              <div className="lrow" key={`${r.name}-${i}`}>
                <span>{r.name}</span>
                <span className="meta" style={{ flex: "none" }}>{methodDefs(db.fields).find((m) => m.id === r.method)?.label ?? r.method}</span>
                <IconButton icon={Trash} label={`Delete ${r.name}`} variant="danger" onClick={() => patch({ recipes: s.recipes.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
        ) : <p>No saved recipes. In the brew form, use the bookmark next to Saved recipe to save one.</p>}
      </div>
    </Section>
  );
}

function PresetRow({ p, onChange, onRemove }: { p: Preset; onChange: (p: Partial<Preset>) => void; onRemove: () => void }) {
  const id = useId();
  const bad = p.pattern.trim() !== "" && !parsePattern(p.pattern);
  return (
    <div className="preset">
      <TextField label="Name" value={p.name} onChange={(name) => onChange({ name })} />
      <Field label="Pattern" id={id} hint="For example 1:2:3" error={bad ? "Use positive numbers split by colons" : undefined}>
        <input id={id} className="input num" inputMode="decimal" placeholder="1:2:3" value={p.pattern} aria-invalid={bad}
          onChange={(e) => onChange({ pattern: e.target.value })} />
      </Field>
      <IconButton icon={Trash} label="Remove preset" onClick={onRemove} />
    </div>
  );
}

function Check({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** On/off for every optional section and method extra, across all methods. Off = not shown in the brew form. */
const LOCK_MS = 24 * 3_600_000;

type Demotion = { hidden: string[]; layoutFix: (id: string, keys: string[]) => string[] };

/**
 * Pretentious mode logs everything. Switching one variable off asks which lesser mode you are:
 * I have a life, or I'm a snob with every method's full layout and only that variable gone.
 */
function useToSnob(s: S, patch: Patch): [(hidden: string[], layoutFix?: Demotion["layoutFix"]) => void, ReactNode] {
  const { db } = useApp();
  const [pending, setPending] = useState<Demotion | null>(null);
  const ask = (hidden: string[], layoutFix: Demotion["layoutFix"] = (_, k) => k) => setPending({ hidden, layoutFix });
  const snob = (p: Demotion) => patch({
    brew_mode: "advanced",
    pretentious_lock: Date.now(),
    hidden: p.hidden,
    layout: Object.fromEntries(methodDefs(db.fields).map((m) => [m.id, p.layoutFix(m.id, layoutFor(m, db.fields, s))])),
  });
  const dialog = (
    <Dialog open={!!pending} onClose={() => setPending(null)} title="Not pretentious enough">
      <div className="stack">
        <p>Pretentious logs every variable. Switch one off and you'll have to settle for something less, and Pretentious stays locked for 24 hours.</p>
        <div className="stack" style={{ gap: 8 }}>
          <Button onClick={() => { if (pending) snob(pending); setPending(null); }}>You're just snobby (I'm a snob)</Button>
          <Button ghost onClick={() => { patch({ brew_mode: "basic", pretentious_lock: Date.now() }); setPending(null); }}>Training wheels (I have a life)</Button>
          <Button ghost onClick={() => setPending(null)}>Stay pretentious</Button>
        </div>
      </div>
    </Dialog>
  );
  return [ask, dialog];
}

function Optional({ s, patch }: { s: S; patch: Patch }) {
  const { db } = useApp();
  const [toSnob, demote] = useToSnob(s, patch);
  const strict = s.brew_mode === "pretentious";
  // Rating and what changed are one section in the form, so they switch together.
  const set = (key: string, on: boolean) => {
    const keys = key === "rating" ? ["rating", "notes"] : [key];
    if (strict) { if (!on) toSnob(keys); return; }
    patch({ hidden: on ? s.hidden.filter((k) => !keys.includes(k)) : [...new Set([...s.hidden, ...keys])] });
  };
  const isOn = (k: string) => strict || !s.hidden.includes(k);
  const byMethod = methodDefs(db.fields)
    .map((m) => [m, db.fields.filter((f) => f.method === m.id)] as const)
    .filter(([, fs]) => fs.length);
  return (
    <Section title="Variables to log">
      {demote}
      <p className="meta">{strict
        ? "Pretentious logs all of it. Untick anything and you'll be asked to step down."
        : "Tick what you want in the brew form. Bean, dose and the ice brew's chilling always show. Saved values are kept either way."}</p>
      <div className="checks">
        {OPTIONAL_SECTIONS.map(([k, label]) => <Check key={k} label={label} on={isOn(k)} onChange={(on) => set(k, on)} />)}
      </div>
      {byMethod.map(([m, fs]) => (
        <div key={m.id} className="stack" style={{ gap: 8 }}>
          <h3 className="label">{m.label} details</h3>
          <div className="checks">
            {fs.map((f) => <Check key={f.key} label={f.label} on={isOn(f.key)} onChange={(on) => set(f.key, on)} />)}
          </div>
        </div>
      ))}
    </Section>
  );
}

function Layout({ s, patch }: { s: S; patch: Patch }) {
  const { db } = useApp();
  const defs = methodDefs(db.fields);
  const [mid, setMid] = useState(defs[0].id);
  // Settings only store the shown keys in order, so hidden rows keep their place here while editing.
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const m = defs.find((x) => x.id === mid) ?? defs[0];
  const avail = availableKeys(m, db.fields);
  const visible = layoutFor(m, db.fields, s);
  const local = orders[m.id];
  const fits = !!local && local.length === avail.length && avail.every((k) => local.includes(k))
    && local.filter((k) => visible.includes(k)).join() === visible.join();
  const order = fits ? local! : [...visible, ...avail.filter((k) => !visible.includes(k))];
  const required = ["bean", "recipe", ...(m.chill === "required" ? ["chill"] : [])];
  const label = (k: string) => SECTIONS[k] ?? db.fields.find((f) => f.method === m.id && f.key === k)?.label ?? k;
  const apply = (next: string[], shown: (k: string) => boolean) => {
    setOrders((o) => ({ ...o, [m.id]: next }));
    patch({ layout: { ...s.layout, [m.id]: next.filter(shown) } });
  };
  const reset = () => {
    const layout = { ...s.layout };
    delete layout[m.id];
    setOrders((o) => ({ ...o, [m.id]: avail }));
    patch({ layout });
  };
  const move = (i: number, d: number) => {
    const k = [...order];
    [k[i], k[i + d]] = [k[i + d], k[i]];
    apply(k, (x) => visible.includes(x));
  };
  const [toSnob, demote] = useToSnob(s, patch);
  const show = (key: string, on: boolean) => {
    if (s.brew_mode === "pretentious") {
      if (!on) toSnob([], (id, keys) => (id === m.id ? order.filter((k) => k !== key) : keys));
      return;
    }
    apply(order, (x) => (x === key ? on : visible.includes(x)));
  };

  return (
    <Section title="Brew form layout" actions={
      <IconButton icon={ArrowCounterClockwise} label="Reset layout" disabled={!s.layout[m.id]} onClick={reset} />
    }>
      {demote}
      <SelectField label="Method" value={m.id} options={defs.map((x): [string, string] => [x.id, x.label])} onChange={(v) => v && setMid(v)} />
      <div className="list">
        {order.map((k, i) => {
          const req = required.includes(k);
          const on = visible.includes(k);
          return (
            <div className={on ? "lrow" : "lrow off"} key={k}>
              <span>{label(k)}</span>
              {req && <span className="meta" style={{ flex: "none" }}>Always shown</span>}
              <label className="inline" style={{ minHeight: 44, cursor: req ? undefined : "pointer" }}>
                <input type="checkbox" checked={on} disabled={req} aria-label={`Show ${label(k)}`}
                  style={{ width: 20, height: 20, margin: 0, accentColor: "var(--text-strong)" }}
                  onChange={(e) => show(k, e.target.checked)} />
                <span className="label">Show</span>
              </label>
              <IconButton icon={ArrowUp} label={`Move ${label(k)} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} label={`Move ${label(k)} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const STYLES: [DripperStyle, string][] = [["immersion", "Immersion"], ["hybrid", "Hybrid"], ["percolation", "Percolation"]];

/** Collapsible row. `level` "section" renders a section-sized heading in the summary. */
function Fold({ title, meta, level, children }: { title: string; meta?: string; level?: "section" | "group"; children: ReactNode }) {
  return (
    <details className={`disclosure${level ? ` fold-${level}` : ""}`}>
      <summary>
        {level === "section" ? <h2 className="strong">{title}</h2> : <span className="strong">{title}</span>}
        {meta && <span className="label">{meta}</span>}
        <CaretDown size={16} aria-hidden className="caret" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

function Drippers() {
  const { db } = useApp();
  const [adding, setAdding] = useState(false);
  const list = db.gear.filter((g) => g.type === "dripper");
  return (
    <section className="section">
      <Fold title="Drippers" meta={`${list.length}`} level="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="meta">Saved as you change it.</p>
          <IconButton icon={Plus} label="Add dripper" tipAlign="end" onClick={() => setAdding(true)} />
        </div>
        {list.length ? <div className="list">{list.map((g) => <DripperRow key={g.id} g={g} />)}</div> : <p>No drippers yet.</p>}
      </Fold>
      <DripperDialog open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}

/** 3-stop style slider. Moves locally while dragging and saves once on release (pointer up or key up). */
function DripperRow({ g }: { g: Gear }) {
  const { update, busy } = useApp();
  const saved = STYLES.findIndex(([k]) => k === g.style);
  const [i, setI] = useState(saved);
  const commit = (e: { currentTarget: HTMLInputElement }) => {
    const n = Number(e.currentTarget.value);
    setI(n);
    if (n !== saved) update((d) => saveGear(d, { ...g, style: STYLES[n][0] }), `${g.name} saved`);
  };
  // Set once, so the slider stays folded away until the row is opened.
  return (
    <details className="disclosure">
      <summary>
        <span className="strong">{g.name}</span>
        <span className="label">{i < 0 ? "Not set" : STYLES[i][1]}</span>
        <CaretDown size={16} aria-hidden className="caret" />
      </summary>
      <div className="field" style={{ paddingBottom: 12 }}>
        <input
          type="range" min={0} max={2} step={1} value={i < 0 ? 1 : i} aria-label={`${g.name} style`}
          aria-valuetext={i < 0 ? "Not set" : STYLES[i][1]} className={i < 0 ? "unset" : undefined}
          disabled={busy} onChange={(e) => setI(Number(e.currentTarget.value))} onPointerUp={commit} onKeyUp={(e) => /^(Arrow|Home|End|Page)/.test(e.key) && commit(e)}
        />
        <div className="stops label"><span>Immersion</span><span>Hybrid</span><span>Percolation</span></div>
      </div>
    </details>
  );
}

const DIALS: [DialType, string][] = [["clicks", "Clicks"], ["rotation", "Rotation"], ["stepless", "Stepless"]];

/** Filter papers the user has: these come first in the brew form, right after papers they've used. */
function MyPapers({ s, patch }: { s: S; patch: Patch }) {
  const mine = s.my_papers;
  const toggle = (name: string) => patch({ my_papers: mine.includes(name) ? mine.filter((x) => x !== name) : [...mine, name] });
  return (
    <section className="section">
      <Fold title="My papers" meta={`${mine.length}`} level="section">
        <p className="meta">Pick the papers you have. The brew form lists papers you've used first (newest first), then these, then the rest.</p>
        <div className="list">
          {Object.entries(PAPERS).map(([brand, names]) => {
            const n = names.filter((x) => mine.includes(`${brand} ${x}`)).length;
            return (
              <Fold key={brand} title={brand} meta={n ? `${n} of ${names.length}` : `${names.length}`} level="group">
                <div className="row">
                  {names.map((x) => (
                    <button key={x} type="button" className="chip" aria-pressed={mine.includes(`${brand} ${x}`)} onClick={() => toggle(`${brand} ${x}`)}>{x}</button>
                  ))}
                </div>
              </Fold>
            );
          })}
        </div>
      </Fold>
    </section>
  );
}

/** The grinders this user owns. The brew form lists only these; the default goes on coffees not brewed yet. */
function MyGrinders({ s, patch }: { s: S; patch: Patch }) {
  const { db, update, busy } = useApp();
  const all = db.gear.filter((g) => g.type === "grinder");
  const label = (id: string) => { const g = all.find((x) => x.id === id); return g ? [g.brand, g.name].filter(Boolean).join(" ") : id; };
  const brands = [...new Set(all.map((g) => g.brand || "Other"))];
  const mine = s.my_grinders;
  const toggle = (id: string) => patch({ my_grinders: mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id] });
  const saved = db.settings.my_grinders[0];
  const missing = db.brews.filter((b) => !b.grinder_id).length;
  return (
    <Section title="My grinders">
      <p className="meta">Pick the grinders you have. The brew form lists only these. Each coffee keeps the grinder of its last brew; a coffee you haven't brewed yet starts on your default.</p>
      {brands.map((b) => (
        <div key={b} className="field">
          <span className="label">{b}</span>
          <div className="row">
            {all.filter((g) => (g.brand || "Other") === b).map((g) => (
              <button key={g.id} type="button" className="chip" aria-pressed={mine.includes(g.id)} onClick={() => toggle(g.id)}>{g.name}</button>
            ))}
          </div>
        </div>
      ))}
      {mine.length > 1 && (
        <SelectField label="Default grinder" value={mine[0]} options={mine.map((id) => [id, label(id)])}
          onChange={(id) => patch({ my_grinders: [id, ...mine.filter((x) => x !== id)] })} />
      )}
      {saved && missing > 0 && (
        <div>
          <Button ghost disabled={busy} onClick={() => update(async (d) => (await fillGrinder(d, saved)).db, `${label(saved)} set on ${missing} brews`)}>
            Use {label(saved)} on {missing} {missing === 1 ? "brew" : "brews"} with no grinder
          </Button>
        </div>
      )}
    </Section>
  );
}

function Grinders() {
  const { db } = useApp();
  const [adding, setAdding] = useState(false);
  const list = db.gear.filter((g) => g.type === "grinder");
  const brands = [...new Set(list.map((g) => g.brand || "Other"))];
  return (
    <section className="section">
      <Fold title="Grinders" meta={`${list.length}`} level="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="meta">Saved as you change it.</p>
          <IconButton icon={Plus} label="Add grinder" tipAlign="end" onClick={() => setAdding(true)} />
        </div>
        {list.length ? (
          <div className="list">
            {brands.map((b) => {
              const own = list.filter((g) => (g.brand || "Other") === b);
              return (
                <Fold key={b} title={b} meta={`${own.length}`} level="group">
                  {own.map((g) => <GrinderRow key={g.id} g={g} />)}
                </Fold>
              );
            })}
          </div>
        ) : <p>No grinders yet.</p>}
      </Fold>
      <GrinderDialog open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}

/** Saves when focus leaves the row, so one edit gives one save and one toast. */
function GrinderRow({ g }: { g: Gear }) {
  const { update, busy } = useApp();
  const [d, setD] = useState(g);
  const name = [g.brand, g.name].filter(Boolean).join(" ");
  const commit = () => {
    if (busy || (d.um_per_step === g.um_per_step && d.zero_um === g.zero_um)) return;
    update((db) => saveGear(db, d), `${name} saved`);
  };
  return (
    <Fold title={g.name || name} meta={DIALS.find(([k]) => k === g.dial_type)?.[1] ?? "Clicks"}>
      <div className="grid-2" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && commit()}>
        {/* Labels avoid the µ sign: uppercase styling turns it into a Greek capital that reads as M. */}
        <NumField label="Microns per step" unit="µm" min={0} value={d.um_per_step} onChange={(um_per_step) => setD({ ...d, um_per_step })} />
        <NumField
          label="Zero point (microns)" unit="µm" placeholder="0" value={d.zero_um} onChange={(zero_um) => setD({ ...d, zero_um })}
          hint="Setting 0 = burrs touching, so 0 unless your burrs were re-zeroed."
        />
      </div>
    </Fold>
  );
}

function Ai({ s, patch }: { s: S; patch: Patch }) {
  const p = PROVIDERS.find((x) => x.id === s.ai_provider) ?? PROVIDERS[0];
  return (
    <Section title="Bag photo auto-fill (AI)">
      <p className="muted">Optional. Reads up to two photos of a bag to fill the bean form. Nothing else uses AI; for bulk imports, use the guide in Import.</p>
      <Segmented label="Provider" value={p.id} options={PROVIDERS.map((x): [Provider, string] => [x.id, x.label])}
        onChange={(ai_provider) => patch({ ai_provider, ai_model: "" })} />
      <TextField label="Model" value={s.ai_model} placeholder={p.model} hint="Leave empty for the cheapest default." onChange={(ai_model) => patch({ ai_model })} />
      <KeyField key={p.id} p={p} />
    </Section>
  );
}

function KeyField({ p }: { p: (typeof PROVIDERS)[number] }) {
  const id = useId();
  const [k, setK] = useState(() => getKey(p.id));
  const change = (v: string) => {
    setK(v);
    setKey(p.id, v);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Field label={`${p.label} API key`} id={id} hint={`Stored only in this browser. Sent only to ${p.label}.`}>
        <div className="inline">
          <input id={id} className="input" type="password" autoComplete="off" spellCheck={false} placeholder="Paste your key"
            value={k} onChange={(e) => change(e.target.value)} />
          <IconButton icon={Trash} label="Clear key" disabled={!k} onClick={() => change("")} />
        </div>
      </Field>
      <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="meta">Get a {p.label} key</a>
    </div>
  );
}

// One source for the format: the guide file, also shown here (its JSON template) and offered as a download.
const TEMPLATE = /```json\n([\s\S]*?)```/.exec(importGuide)?.[1] ?? "";
function downloadGuide() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([importGuide], { type: "text/markdown" }));
  a.download = "extraction-theory-import-guide.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Paste a JSON export (beans and brews) to add it to the sheet. Re-running skips rows already imported. */
function ImportData() {
  const { update, busy, notify } = useApp();
  const [text, setText] = useState("");
  const run = async () => {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return notify("That is not valid JSON.", "error"); }
    let msg = "";
    const ok = await update(async (db) => {
      const r = await importData(db, raw);
      msg = `Imported ${r.beans} beans and ${r.brews} brews${r.skipped ? `, skipped ${r.skipped} already imported` : ""}${r.deleted ? `, deleted ${r.deleted}` : ""}.`;
      return r.db;
    });
    if (ok) { notify(msg, "success"); setText(""); }
  };
  return (
    <section className="section">
      <Section title="Import">
        <p className="meta">Add many coffees and brews at once as JSON. Download the guide for the format and rules: fill it by hand, or give it to any AI chat with photos of your bags or your notes and paste back what it writes.</p>
        <div className="row">
          <Button ghost icon={DownloadSimple} onClick={downloadGuide}>Import guide (.md)</Button>
        </div>
        <Fold title="Format" level="group">
          <pre className="code">{TEMPLATE}</pre>
        </Fold>
        <TextField label="Import data (JSON)" multiline value={text} onChange={setText} placeholder='{"beans": [], "brews": []}'
          hint='Beans match existing ones by name and roastery. Brews already imported are skipped; add "update": true to change one or "delete": true to remove it.' />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <label className="btn ghost">
            Choose file
            <input type="file" accept=".json,application/json,text/plain" className="sr-only"
              onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); e.target.value = ""; }} />
          </label>
          <IconButton icon={UploadSimple} label="Import into my sheet" variant="solid" tipAlign="end" disabled={busy || !text.trim()} onClick={run} />
        </div>
      </Section>
    </section>
  );
}

function Account() {
  const { db } = useApp();
  const { choice } = useTheme();
  return (
    <Section title="Account" actions={
      <IconButton icon={SignOut} label="Sign out" onClick={() => { signOut(); location.reload(); }} />
    }>
      <p className="meta">Signing out clears this device's draft. AI keys stay until you clear them.</p>
      <a className="row" href={sheetUrl(db.id)} target="_blank" rel="noopener noreferrer">
        <Table size={20} aria-hidden />Open your Google Sheet
      </a>
      <Segmented label="Theme" value={choice} onChange={setTheme}
        options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} />
      <InstallApp />
    </Section>
  );
}

function InstallApp() {
  const { installed, canPrompt, ios, install } = useInstall();
  if (installed) return <p className="meta">Installed as an app on this device.</p>;
  if (canPrompt) return <div><Button ghost icon={DownloadSimple} onClick={install}>Install app</Button></div>;
  if (ios) return <p className="meta">To install on iPhone or iPad: tap Share, then Add to Home Screen.</p>;
  return <p className="meta">To install: open the browser menu and choose Install app or Add to Home Screen.</p>;
}
