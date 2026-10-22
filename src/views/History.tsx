import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowsClockwise, CheckSquare, Coffee, PencilSimple, Square, Target, X, type Icon, type IconProps,
} from "@phosphor-icons/react";
import { fmtTime, fromSerial, num, round } from "../calc.ts";
import { dialedMethods, isFinished } from "../group.ts";
import { useApp } from "../ctx.ts";
import { AGITATION_TIMING, bodyLabel, methodDefs, type MethodDef, type Phase, type Rec } from "../schema.ts";
import { patchBrew, saveBean, type Db } from "../store.ts";
import { Button, IconButton, Msg, Section, Segmented, SelectField } from "../ui.tsx";
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
  return r == null ? "" : `1:${round(r, 2)}`;
}
const phasesOf = (db: Db, id: unknown): Phase[] =>
  db.phases.filter((p) => p.brew_id === id).sort((a, b) => (a.kind === b.kind ? a.n - b.n : a.kind === "pour" ? -1 : 1));
/** "Espresso", "Black (iced)", or the milk drink name. */
export function served(b: Rec): string {
  const s = str(b.serve) || (str(b.milk_drink) ? "milk" : "");
  if (s === "espresso") return "Espresso";
  if (s === "black") return yes(b.serve_iced) ? "Black (iced)" : "Black (hot)";
  if (s === "milk") return str(b.milk_drink) || "Milk drink";
  return "";
}
export const beanName =(db: Db, id: unknown) => str(db.beans.find((x) => x.id === id)?.name) || "Unknown bean";

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
    ["Recipe", "Served as", served(b)],
    ["Recipe", "Water added", n(b.serve_water_g, "g")],
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
    ["Taste", "Body", bodyLabel(b.taste_strength) || cap(b.taste_strength)],
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

/** Brew detail by id (arg). Without one there is nothing to show here: history lives on each coffee's page. */
export default function History() {
  const { db, arg, back } = useApp();
  const defs = useMemo(() => methodDefs(db.fields), [db.fields]);
  const b = arg ? db.brews.find((x) => x.id === arg) : undefined;
  if (b) return <Detail brew={b} defs={defs} />;
  return (
    <div className="page">
      <div className="row">
        <IconButton icon={ArrowLeft} label="Back" onClick={back} />
        <Msg kind="error">That brew was not found. It may have been deleted from the sheet.</Msg>
      </div>
    </div>
  );
}

/** One coffee's brew history: method filter, rows, compare two. */
export function BrewList({ beanId }: { beanId: string }) {
  const { db, go } = useApp();
  const defs = useMemo(() => methodDefs(db.fields), [db.fields]);
  const [method, setMethod] = useState("");
  const [sel, setSel] = useState<string[]>([]);

  const mine = db.brews.filter((b) => b.bean_id === beanId);
  if (!mine.length) {
    return (
      <div className="stack">
        <p>No brews of this coffee yet.</p>
        <div><Button ghost icon={Coffee} onClick={() => go("brew")}>Log a brew</Button></div>
      </div>
    );
  }
  const rows = mine.filter((b) => !method || b.method === method).sort((a, b) => when(b) - when(a));
  const used = defs.filter((m) => mine.some((b) => b.method === m.id));
  const picked = sel.map((id) => db.brews.find((b) => b.id === id)).filter((b): b is Rec => !!b);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s));

  return (
    <div className="stack">
      {used.length > 1 && (
        <SelectField label="Method" value={method} placeholder="All methods" onChange={(v) => { setMethod(v); setSel([]); }}
          options={used.map((m): [string, string] => [m.id, m.label])} />
      )}

      {picked.length === 2 && <Compare pair={picked} defs={defs} onClear={() => setSel([])} />}

      {rows.length ? (
        <div className="list">
          {rows.map((b) => {
            const id = str(b.id);
            const m = methodOf(b.method, defs);
            const on = sel.includes(id);
            const rating = num(b.rating);
            return (
              <div className="item" key={id}>
                <button type="button" className="item-main" onClick={() => go("history", id)}>
                  <span className="item-title">
                    {[m.label, served(b)].filter(Boolean).join(", ")}
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
  const { db, go, back, update, busy } = useApp();
  const m = methodOf(brew.method, defs);
  const bean = db.beans.find((x) => x.id === brew.bean_id);
  const dialed = yes(brew.dialed_in);
  const ps = params(brew, db, m).filter((p) => p[2] !== "");

  return (
    <div className="page">
      <div className="row">
        <IconButton icon={ArrowLeft} label="Back" onClick={back} />
        <span className="spacer" />
        <IconButton
          icon={dialed ? TargetFill : Target} label={dialed ? "Unmark dialed in" : "Mark as dialed in"} pressed={dialed} disabled={busy}
          onClick={() => update(async (d) => {
            // Keep the coffee's per-method mark in step with this brew.
            let next = await patchBrew(d, { id: brew.id, dialed_in: !dialed });
            if (bean) {
              const on = dialedMethods(bean);
              const methods = !dialed ? [...new Set([...on, str(brew.method)])] : on.filter((x) => x !== str(brew.method));
              next = await saveBean(next, { id: bean.id, dialed: methods.join(",") });
            }
            return next;
          }, dialed ? "No longer dialed in" : "Marked as dialed in")}
        />
        <IconButton icon={PencilSimple} label="Edit brew" onClick={() => go("brew", `edit:${str(brew.id)}`)} />
        <Button icon={ArrowsClockwise} onClick={() => go("brew", str(brew.id))}>Brew again</Button>
      </div>

      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
        <h1>{beanName(db, brew.bean_id)}</h1>
        <p className="meta num"><span>{m.label}</span><span>{stamp(brew.brew_date ?? brew.created)}</span></p>
      </div>
      {bean && <BagToggle bean={bean} />}

      {/* One chart per coffee, on its page; a brew keeps its tasting notes as text. */}
      {str(brew.tasting_notes).trim() && (
        <Section title="Tasting notes"><p>{str(brew.tasting_notes)}</p></Section>
      )}

      {/* Nothing timed (an I have a life espresso, say): no empty timeline. */}
      {(num(brew.total_s) != null || phasesOf(db, brew.id).length > 0 || num(brew.steep_h) != null) && (
        <Section title="Timeline">
          <Timeline items={[{ label: m.label, method: m, brew, phases: phasesOf(db, brew.id) }]} />
        </Section>
      )}

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
  const key = (p: P) => `${p[0]}|${p[1]}`;
  const pa = params(a, db, ma);
  const pb = params(b, db, mb);
  const va = new Map(pa.map((p) => [key(p), p[2]]));
  const vb = new Map(pb.map((p) => [key(p), p[2]]));
  const diff = [...new Set([...pa, ...pb].map(key))]
    .map((k) => [k.split("|")[1], va.get(k) ?? "", vb.get(k) ?? ""] as const)
    .filter(([, x, y]) => x !== y);
  const sides = [{ tag: "A", r: a }, { tag: "B", r: b }];

  return (
    <div id="compare" ref={ref} style={{ scrollMarginTop: 72 }}>
      <Section title="Compare" actions={<IconButton icon={X} label="Clear compare" onClick={onClear} />}>
        <div className="split">
          {sides.map(({ tag, r }) => (
            <div key={tag} className="stack">
              <span className="label">{`${tag} ${beanName(db, r.bean_id)} ${stamp(r.brew_date ?? r.created)}`}</span>
              <p>{str(r.tasting_notes) || "No tasting notes."}</p>
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
      options={[["left", "Available"], ["done", "Finished"]]}
      onChange={(v) => {
        if (busy || (v === "done") === done) return;
        update((d) => saveBean(d, { id: bean.id, finished: v === "done" }), v === "done" ? "Marked as finished" : "Back in your bean list");
      }}
    />
  );
}
