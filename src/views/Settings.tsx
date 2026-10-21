import { useEffect, useId, useState } from "react";
import {
  ArrowCounterClockwise, ArrowDown, ArrowUp, FloppyDisk, GithubLogo, Globe, LinkedinLogo, Plus, SignOut, Table, Trash,
} from "@phosphor-icons/react";
import { DEFAULT_AXES, cleanAxes, parsePattern, type DialType } from "../calc.ts";
import { PROVIDERS, getKey, setKey, type Provider } from "../ai.ts";
import { useApp } from "../ctx.ts";
import { signOut } from "../google.ts";
import {
  SECTIONS, availableKeys, layoutFor, methodDefs, type DripperStyle, type Gear, type Preset, type Settings as S,
} from "../schema.ts";
import { sheetUrl } from "../sheets.ts";
import { saveGear, saveSettings } from "../store.ts";
import { Button, Field, IconButton, NumField, Section, Segmented, SelectField, TextField } from "../ui.tsx";
import AxesEditor from "../components/AxesEditor.tsx";
import { DripperDialog } from "../components/brew/Dripper.tsx";
import { GrinderDialog } from "../components/brew/Grind.tsx";
import { IconLink, setTheme, useTheme } from "../App.tsx";

type Patch = (p: Partial<S>) => void;

export default function Settings() {
  const { db, update, busy, setDirty } = useApp();
  const [s, setS] = useState<S>(db.settings);
  const patch: Patch = (p) => setS((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const problem = s.presets.some((p) => !p.name.trim() || !parsePattern(p.pattern))
    ? "Each preset needs a name and a pattern like 1:2:3."
    : s.axes.some((a) => !a.label.trim()) ? "Each radar axis needs a label." : "";
  const save = async () => {
    const next = { ...s, axes: cleanAxes(s.axes) };
    if (await update((d) => saveSettings(d, next), "Settings saved")) setS(next);
  };

  return (
    <div className="page">
      <h1>Settings</h1>
      <Brewing s={s} patch={patch} />
      <Section title="Radar template">
        <AxesEditor axes={s.axes} onChange={(axes) => patch({ axes })} template={DEFAULT_AXES} />
      </Section>
      <Layout s={s} patch={patch} />
      <Drippers />
      <Grinders />
      <Ai s={s} patch={patch} />
      <Account />
      {dirty && (
        <div className="savebar">
          <span>{problem || "Unsaved changes."}</span>
          <Button icon={FloppyDisk} disabled={busy || !!problem} onClick={save}>
            Save settings
          </Button>
        </div>
      )}
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

function Brewing({ s, patch }: { s: S; patch: Patch }) {
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
  const show = (key: string, on: boolean) => apply(order, (x) => (x === key ? on : visible.includes(x)));

  return (
    <Section title="Brew form layout" actions={
      <IconButton icon={ArrowCounterClockwise} label="Reset layout" disabled={!s.layout[m.id]} onClick={reset} />
    }>
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

function Drippers() {
  const { db } = useApp();
  const [adding, setAdding] = useState(false);
  const list = db.gear.filter((g) => g.type === "dripper");
  return (
    <Section title="Drippers" actions={<IconButton icon={Plus} label="Add dripper" onClick={() => setAdding(true)} />}>
      <p className="meta">Saved as you change it.</p>
      {list.length ? <div className="list">{list.map((g) => <DripperRow key={g.id} g={g} />)}</div> : <p>No drippers yet.</p>}
      <DripperDialog open={adding} onClose={() => setAdding(false)} />
    </Section>
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
  return (
    <div className="gear dripper">
      <span className="strong">{g.name}</span>
      <div className="field">
        <input
          type="range" min={0} max={2} step={1} value={i < 0 ? 1 : i} aria-label={`${g.name} style`}
          aria-valuetext={i < 0 ? "Not set" : STYLES[i][1]} className={i < 0 ? "unset" : undefined}
          disabled={busy} onChange={(e) => setI(Number(e.currentTarget.value))} onPointerUp={commit} onKeyUp={(e) => /^(Arrow|Home|End|Page)/.test(e.key) && commit(e)}
        />
        <div className="stops label"><span>Immersion</span><span>Hybrid</span><span>Percolation</span></div>
      </div>
    </div>
  );
}

const DIALS: [DialType, string][] = [["clicks", "Clicks"], ["rotation", "Rotation"], ["stepless", "Stepless"]];

function Grinders() {
  const { db } = useApp();
  const [adding, setAdding] = useState(false);
  const list = db.gear.filter((g) => g.type === "grinder");
  return (
    <Section title="Grinders" actions={<IconButton icon={Plus} label="Add grinder" onClick={() => setAdding(true)} />}>
      <p className="meta">Saved as you change it.</p>
      {list.length ? <div className="list">{list.map((g) => <GrinderRow key={g.id} g={g} />)}</div> : <p>No grinders yet.</p>}
      <GrinderDialog open={adding} onClose={() => setAdding(false)} />
    </Section>
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
    <div className="gear grinder" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && commit()}>
      <div className="stack" style={{ gap: 2 }}>
        <span className="strong">{name}</span>
        <span className="meta">{DIALS.find(([k]) => k === g.dial_type)?.[1] ?? "Clicks"}</span>
      </div>
      <NumField label="µm per step" unit="µm" min={0} value={d.um_per_step} onChange={(um_per_step) => setD({ ...d, um_per_step })} />
      <NumField label="Zero point" unit="µm" value={d.zero_um} onChange={(zero_um) => setD({ ...d, zero_um })} />
    </div>
  );
}

function Ai({ s, patch }: { s: S; patch: Patch }) {
  const p = PROVIDERS.find((x) => x.id === s.ai_provider) ?? PROVIDERS[0];
  return (
    <Section title="Note colours (AI)">
      <p className="muted">Optional. Picks a palette colour for each tasting note. Nothing else uses AI.</p>
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
    </Section>
  );
}
