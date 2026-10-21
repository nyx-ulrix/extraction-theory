import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowsClockwise, CheckSquare, Coffee, Plant, Square, Target, X, type Icon, type IconProps,
} from "@phosphor-icons/react";
import { fmtTime, fromSerial, num, parseFlavour, round } from "../calc.ts";
import { groups, isFinished, norm, originKey } from "../group.ts";
import { useApp } from "../ctx.ts";
import { AGITATION_TIMING, methodDefs, type MethodDef, type Phase, type Rec } from "../schema.ts";
import { patchBrew, saveBean, type Db } from "../store.ts";
import { Button, IconButton, Msg, Section, Segmented, SelectField } from "../ui.tsx";
import Fingerprint from "../components/Fingerprint.tsx";
import Radar from "../components/Radar.tsx";
import Timeline from "../components/Timeline.tsx";

/** "Dialed in" marker. Stars are kept for rating only. */
const TargetFill = ((p: IconProps) => <Target {...p} weight="fill" />) as unknown as Icon;

export const str = (v: unknown) => (v == null ? "" : String(v));
export const cap = (v: unknown) => str(v).charAt(0).toUpperCase() + str(v).slice(1);
const yes = (v: unknown) => v === true || str(v).toLowerCase() === "true";
const pad = (n: number) => String(n).padStart(2, "0");
export function stamp(v: unknown): string {
  const n = num(v);
  if (n == null) return "";
  const d = fromSerial(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const when = (b: Rec) => num(b.brew_date) ?? num(b.created) ?? 0;
export const methodOf = (id: unknown, defs: MethodDef[]): MethodDef =>
  defs.find((m) => m.id === id) ?? { id: str(id), label: str(id) || "-", liquid: "water", tempLabel: "Water temp", time: "total" };
export const liquidOf = (b: Rec, m: MethodDef) => num(m.liquid === "yield" ? b.yield_g : b.water_g);
export function ratioOf(b: Rec, m: MethodDef): string {
  const dose = num(b.dose_g);
  const liq = liquidOf(b, m);
  const r = num(b.ratio) ?? (dose && liq != null ? liq / dose : null);
  return r == null ? "" : `1:${round(r, 1)}`;
}
const phasesOf = (db: Db, id: unknown): Phase[] =>
  db.phases.filter((p) => p.brew_id === id).sort((a, b) => (a.kind === b.kind ? a.n - b.n : a.kind === "pour" ? -1 : 1));
export const beanName = (db: Db, id: unknown) => str(db.beans.find((x) => x.id === id)?.name) || "Unknown bean";

function stage(v: unknown): string {
  const s = str(v);
  const [k, raw] = s.split(":");
  if (k === "start") return "Brew start";
  if (k === "end") return "End of brew";
  if (k === "after") return "After brew";
  if (k === "phase") return `Start of phase ${raw}`;
  if (k === "t") return `At ${fmtTime(num(raw))}`;
  if (k === "y") return `At ${raw} g yield`;
  return s;
}

function phaseText(p: Phase): string {
  const timing = p.agitation_timing === "at"
    ? `at ${fmtTime(p.agitation_at_s)}`
    : (AGITATION_TIMING.find(([k]) => k === p.agitation_timing)?.[1] ?? "").toLowerCase();
  return [
    p.start_s != null && `at ${fmtTime(p.start_s)}`,
    p.water_g != null && `${p.water_g} g`,
    p.temp_c != null && `${p.temp_c} °C`,
    p.duration_s != null && `for ${fmtTime(p.duration_s)}`,
    p.agitation && p.agitation !== "None" && `${p.agitation}${p.agitation_count ? ` x${p.agitation_count}` : ""} ${timing}`.trim(),
    p.valve && `valve ${p.valve}`,
    p.note,
  ].filter(Boolean).join(", ");
}

const GROUPS = ["Recipe", "Grind", "Pours", "Chill", "Taste", "Notes"] as const;
type P = [group: (typeof GROUPS)[number], label: string, value: string];

/** Every displayable parameter of a brew, empty values included (callers skip them). */
function params(b: Rec, db: Db, m: MethodDef): P[] {
  const gear = (id: unknown) => {
    const g = db.gear.find((x) => x.id === id);
    return g ? [g.brand, g.name].filter(Boolean).join(" ") : str(id);
  };
  const n = (v: unknown, unit = "") => {
    const x = num(v);
    return x == null ? "" : unit ? `${x} ${unit}` : String(x);
  };
  const t = (v: unknown) => fmtTime(num(v));
  const yn = (v: unknown) => (v == null || v === "" ? "" : yes(v) ? "Yes" : "No");
  const fr = num(b.final_ratio);
  const rating = num(b.rating);
  let pours = 0;
  let presses = 0;
  const head: P[] = [
    ["Recipe", "Method", m.label],
    ["Recipe", "Bean", beanName(db, b.bean_id)],
    ["Recipe", "Brew date", stamp(b.brew_date)],
    ["Recipe", "Days off roast", n(b.days_off_roast)],
    ["Recipe", "Dose", n(b.dose_g, "g")],
    ["Recipe", m.liquid === "yield" ? "Yield" : "Water", n(liquidOf(b, m), "g")],
    ["Recipe", "Ratio", ratioOf(b, m)],
    ["Recipe", m.tempLabel, n(b.temp_c, "°C")],
    ["Recipe", m.time === "shot" ? "Shot time" : "Total time", t(b.total_s)],
    ["Recipe", "Water used", str(b.water_type)],
    ["Recipe", "Milk drink", str(b.milk_drink)],
    ["Recipe", "Milk", n(b.milk_g, "g")],
    ["Recipe", "Dripper", b.dripper_id ? gear(b.dripper_id) : ""],
    ["Recipe", "Paper", str(b.paper)],
    ["Recipe", "Drain at", t(b.drain_at_s)],
  ];
  const tail: P[] = [
    ["Grind", "Grinder", b.grinder_id ? gear(b.grinder_id) : ""],
    ["Grind", "Grind setting", str(b.grind_setting)],
    ["Grind", "Clicks", n(b.grind_clicks)],
    ["Grind", "Grind size", n(b.grind_um, "µm")],
    ...phasesOf(db, b.id).map((p): P => ["Pours", p.kind === "press" ? `Press ${++presses}` : `Pour ${++pours}`, phaseText(p)]),
    ["Chill", "Chill method", str(b.chill_method)],
    ["Chill", "Ice", yes(b.ice_max) ? "As much as possible" : n(b.ice_g, "g")],
    ["Chill", "Chill start", stage(b.chill_start)],
    ["Chill", "Chill stop", stage(b.chill_stop)],
    ["Chill", "Final ratio", fr == null ? "" : `1:${round(fr, 1)}`],
    ["Taste", "Tasting notes", str(b.tasting_notes)],
    ["Taste", "Taste balance", cap(b.taste_balance)],
    ["Taste", "Strength", cap(b.taste_strength)],
    ["Taste", "Rating", rating == null ? "" : `${rating}/5`],
    ["Taste", "Dialed in", yn(b.dialed_in)],
    ["Notes", "What changed", str(b.changed)],
    ["Notes", "Notes", str(b.notes)],
  ];
  // Methods-tab fields whose label matches a built-in one get the method name, e.g. "Cold brew method".
  const taken = new Set([...head, ...tail].map((p) => p[1].toLowerCase()));
  const own: P[] = db.fields.filter((f) => f.method === m.id).map((f) => {
    const v = b[f.key];
    const val = f.type === "time" ? t(v) : f.type === "bool" ? yn(v) : f.type === "number" ? n(v, f.unit) : str(v);
    return ["Recipe", taken.has(f.label.toLowerCase()) ? `${m.label} ${f.label.toLowerCase()}` : f.label, val];
  });
  return [...head, ...own, ...tail];
}

export default function History() {
  const { db, arg, go } = useApp();
  const defs = useMemo(() => methodDefs(db.fields), [db.fields]);
  const [bean, setBean] = useState("");
  const [method, setMethod] = useState("");
  const [roaster, setRoaster] = useState("");
  const [origin, setOrigin] = useState("");
  const [process, setProcess] = useState("");
  const [sel, setSel] = useState<string[]>([]);

  if (arg) {
    const b = db.brews.find((x) => x.id === arg);
    if (b) return <Detail brew={b} defs={defs} />;
    return (
      <div className="page">
        <div className="row">
          <IconButton icon={ArrowLeft} label="Back to history" onClick={() => go("history")} />
          <Msg kind="error">That brew was not found. It may have been deleted from the sheet.</Msg>
        </div>
      </div>
    );
  }

  if (!db.brews.length) {
    return (
      <div className="page">
        <h1>History</h1>
        <p>No brews yet. Log one to start your calibration history.</p>
        <div><Button icon={Coffee} onClick={() => go("brew")}>Log a brew</Button></div>
      </div>
    );
  }

  const beanOf = (b: Rec) => db.beans.find((x) => x.id === b.bean_id);
  const rows = db.brews
    .filter((b) => {
      const bn = beanOf(b);
      return (!bean || b.bean_id === bean) && (!method || b.method === method)
        && (!roaster || norm(bn?.roastery) === roaster)
        && (!origin || originKey(bn?.origin) === origin)
        && (!process || norm(bn?.process) === process);
    })
    .sort((a, b) => when(b) - when(a));
  const filter = (set: (v: string) => void) => (v: string) => { set(v); setSel([]); };
  const picked = sel.map((id) => db.brews.find((b) => b.id === id)).filter((b): b is Rec => !!b);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s));

  return (
    <div className="page">
      <h1>History</h1>
      <div className="grid-2">
        <SelectField label="Bean" value={bean} placeholder="All beans" onChange={(v) => { setBean(v); setSel([]); }}
          options={db.beans.map((b): [string, string] => [str(b.id), str(b.name) || "Unnamed"])} />
        <SelectField label="Method" value={method} placeholder="All methods" onChange={(v) => { setMethod(v); setSel([]); }}
          options={defs.map((m): [string, string] => [m.id, m.label])} />
        <SelectField label="Roaster" value={roaster} placeholder="All roasters" onChange={filter(setRoaster)}
          options={groups(db.beans.map((b) => b.roastery))} />
        <SelectField label="Origin" value={origin} placeholder="All origins" onChange={filter(setOrigin)}
          options={groups(db.beans.map((b) => b.origin), originKey)} />
        <SelectField label="Process" value={process} placeholder="All processes" onChange={filter(setProcess)}
          options={groups(db.beans.map((b) => b.process))} />
      </div>

      {picked.length === 2 && <Compare pair={picked} defs={defs} onClear={() => setSel([])} />}

      {rows.length ? (
        <div className="list">
          {rows.map((b) => {
            const id = str(b.id);
            const m = methodOf(b.method, defs);
            const on = sel.includes(id);
            const rating = num(b.rating);
            const fp = parseFlavour(b.flavour, db.settings.axes);
            return (
              <div className="item" key={id}>
                <span style={{ width: 40, height: 40, flex: "none", display: "inline-flex" }}>
                  <Fingerprint axes={fp.axes} layers={fp.layers} size={40} />
                </span>
                <button type="button" className="item-main" onClick={() => go("history", id)}>
                  <span className="item-title">
                    {beanName(db, b.bean_id)}
                    <span className="muted">{m.label}</span>
                    {yes(b.dialed_in) && <><TargetFill size={16} aria-hidden /><span className="sr-only">Dialed in</span></>}
                  </span>
                  <span className="meta num">
                    <span>{stamp(b.brew_date ?? b.created) || "-"}</span>
                    <span>{num(b.dose_g) ?? "-"} g in, {liquidOf(b, m) ?? "-"} g out</span>
                    <span>{ratioOf(b, m) || "-"}</span>
                    <span>Grind {str(b.grind_setting) || "-"}</span>
                    <span>{rating == null ? "-" : `${rating}/5`}</span>
                  </span>
                </button>
                <IconButton
                  icon={on ? CheckSquare : Square} label={on ? "Remove from compare" : "Add to compare"}
                  pressed={on} disabled={!on && sel.length >= 2} onClick={() => toggle(id)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p>No brews match these filters.</p>
      )}

      {picked.length === 1 && (
        <div className="savebar">
          <span>1 of 2 picked. Pick one more to compare.</span>
          <IconButton icon={X} label="Clear" variant="bare" onClick={() => setSel([])} />
        </div>
      )}
    </div>
  );
}

function Detail({ brew, defs }: { brew: Rec; defs: MethodDef[] }) {
  const { db, go, update, busy } = useApp();
  const [overlay, setOverlay] = useState(false);
  const m = methodOf(brew.method, defs);
  const bean = db.beans.find((x) => x.id === brew.bean_id);
  const fl = parseFlavour(brew.flavour, db.settings.axes);
  const beanFl = bean ? parseFlavour(bean.flavour, db.settings.axes) : null;
  const sameAxes = !!beanFl && beanFl.axes.map((a) => a.key).join() === fl.axes.map((a) => a.key).join();
  const layers = overlay && sameAxes
    ? [...fl.layers, ...beanFl!.layers.map((l) => ({ ...l, note: `Roaster: ${l.note}` }))]
    : fl.layers;
  const dialed = yes(brew.dialed_in);
  const ps = params(brew, db, m).filter((p) => p[2] !== "");

  return (
    <div className="page">
      <div className="row">
        <IconButton icon={ArrowLeft} label="Back to history" onClick={() => go("history")} />
        <span className="spacer" />
        <IconButton
          icon={dialed ? TargetFill : Target} label={dialed ? "Unmark dialed in" : "Mark as dialed in"} pressed={dialed} disabled={busy}
          onClick={() => update((d) => patchBrew(d, { id: brew.id, dialed_in: !dialed }), dialed ? "No longer dialed in" : "Marked as dialed in")}
        />
        <Button icon={ArrowsClockwise} onClick={() => go("brew", str(brew.id))}>Brew again</Button>
      </div>

      <div className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
        <Fingerprint axes={fl.axes} layers={fl.layers} size={96} />
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <h1>{beanName(db, brew.bean_id)}</h1>
          <p className="meta num"><span>{m.label}</span><span>{stamp(brew.brew_date ?? brew.created)}</span></p>
        </div>
      </div>
      {bean && <BagToggle bean={bean} />}

      <Section
        title="Flavour"
        actions={bean && (
          <IconButton icon={Plant} label={overlay ? "Hide roaster notes" : "Overlay roaster notes"} pressed={overlay} onClick={() => setOverlay(!overlay)} />
        )}
      >
        {overlay && !sameAxes && <Msg>The roaster notes use different radar axes, so they cannot be overlaid.</Msg>}
        {overlay && sameAxes && !beanFl!.layers.length && <Msg>This bean has no roaster flavour scores yet.</Msg>}
        {layers.length ? <Radar axes={fl.axes} layers={layers} legend /> : <p>No flavour scores for this brew.</p>}
      </Section>

      <Section title="Timeline">
        <Timeline items={[{ label: m.label, method: m, brew, phases: phasesOf(db, brew.id) }]} />
      </Section>

      {GROUPS.map((g) => {
        const items = ps.filter((p) => p[0] === g);
        if (!items.length) return null;
        return (
          <Section key={g} title={g}>
            <dl className="kv">
              {items.map(([, label, v], i) => (
                <div key={i} className={v.length > 40 ? "wide" : undefined}>
                  <dt className="label">{label}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        );
      })}
    </div>
  );
}

function Compare({ pair, defs, onClear }: { pair: Rec[]; defs: MethodDef[]; onClear: () => void }) {
  const { db } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "start" }), []);
  const [a, b] = [...pair].sort((x, y) => when(x) - when(y));
  const ma = methodOf(a.method, defs);
  const mb = methodOf(b.method, defs);
  const fa = parseFlavour(a.flavour, db.settings.axes);
  const fb = parseFlavour(b.flavour, db.settings.axes);
  const key = (p: P) => `${p[0]}|${p[1]}`;
  const pa = params(a, db, ma);
  const pb = params(b, db, mb);
  const va = new Map(pa.map((p) => [key(p), p[2]]));
  const vb = new Map(pb.map((p) => [key(p), p[2]]));
  const diff = [...new Set([...pa, ...pb].map(key))]
    .map((k) => [k.split("|")[1], va.get(k) ?? "", vb.get(k) ?? ""] as const)
    .filter(([, x, y]) => x !== y);
  const sides = [{ tag: "A", r: a, f: fa }, { tag: "B", r: b, f: fb }];

  return (
    <div id="compare" ref={ref} style={{ scrollMarginTop: 72 }}>
      <Section title="Compare" actions={<IconButton icon={X} label="Clear compare" onClick={onClear} />}>
        <div className="split">
          {sides.map(({ tag, r, f }) => (
            <div key={tag} className="stack">
              <span className="label">{`${tag} ${beanName(db, r.bean_id)} ${stamp(r.brew_date ?? r.created)}`}</span>
              {f.layers.length ? <Radar axes={f.axes} layers={f.layers} legend size={280} /> : <p>No flavour scores.</p>}
            </div>
          ))}
        </div>
        <Timeline items={[
          { label: "A", method: ma, brew: a, phases: phasesOf(db, a.id) },
          { label: "B", method: mb, brew: b, phases: phasesOf(db, b.id) },
        ]} />
        {diff.length ? (
          <table className="diff num">
            <thead><tr><th className="label">Parameter</th><th className="label">A</th><th className="label">B</th></tr></thead>
            <tbody>
              {diff.map(([label, x, y], i) => (
                <tr key={i}><th>{label}</th><td>{x || "-"}</td><td style={{ color: "var(--text-strong)", fontWeight: 700 }}>{y || "-"}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>These brews use the same parameters.</p>
        )}
      </Section>
    </div>
  );
}

/** Mark the bag as finished (hidden from the Brew form's bean list) or still in use. */
export function BagToggle({ bean }: { bean: Rec }) {
  const { update, busy } = useApp();
  const done = isFinished(bean.finished);
  return (
    <Segmented
      label={`Bag of ${str(bean.name) || "this bean"}`} value={done ? "done" : "left"}
      options={[["left", "Still have some"], ["done", "Finished"]]}
      onChange={(v) => {
        if (busy || (v === "done") === done) return;
        update((d) => saveBean(d, { id: bean.id, finished: v === "done" }), v === "done" ? "Marked as finished" : "Back in your bean list");
      }}
    />
  );
}
