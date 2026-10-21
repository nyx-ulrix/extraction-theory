// A set of coffees as cards (with a small spider chart) or as a list, with roaster / origin / process filters.
import { useState } from "react";
import { CheckCircle, ListBullets, SquaresFour } from "@phosphor-icons/react";
import { parseFlavour, type AxisDef, type Layer } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { groups, isFinished, norm, originKey } from "../group.ts";
import type { Rec } from "../schema.ts";
import { Marquee, SelectField } from "../ui.tsx";
import { str, when } from "../views/History.tsx";

/** Label-free spider chart for small cards: five rings, axis dots in their colours, see-through layers. */
function MiniRadar({ axes, layers }: { axes: AxisDef[]; layers: Layer[] }) {
  const n = axes.length;
  const pt = (i: number, v: number): [number, number] => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * v * 4, Math.sin(a) * v * 4];
  };
  const poly = (v: (i: number) => number) => axes.map((_, i) => pt(i, v(i)).map((x) => x.toFixed(1)).join(",")).join(" ");
  return (
    <svg viewBox="-46 -46 92 92" className="mini-radar" aria-hidden>
      {[2, 4, 6, 8, 10].map((r) => <polygon key={r} points={poly(() => r)} fill="none" stroke="var(--border-soft)" strokeWidth={0.6} />)}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 10);
        return <g key={a.key}><line x1={0} y1={0} x2={x} y2={y} stroke="var(--border-soft)" strokeWidth={0.6} /><circle cx={x} cy={y} r={2.4} fill={a.color} stroke="var(--text)" strokeWidth={0.4} /></g>;
      })}
      {layers.map((l, k) => (
        <polygon key={k} points={poly((i) => l.v[axes[i].key] ?? 0)} fill={l.color} fillOpacity={0.35} stroke={l.color} strokeWidth={1.2} />
      ))}
    </svg>
  );
}

type Mode = "cards" | "list";
function savedMode(key: string): Mode {
  try { return localStorage.getItem(`et.shelf.${key}`) === "list" ? "list" : "cards"; } catch { return "cards"; }
}

export default function Shelf({ beans, storageKey, empty }: { beans: Rec[]; storageKey: string; empty: string }) {
  const { db, go } = useApp();
  const [mode, setModeState] = useState<Mode>(() => savedMode(storageKey));
  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(`et.shelf.${storageKey}`, m); } catch { /* storage blocked */ }
  };
  const [roaster, setRoaster] = useState("");
  const [origin, setOrigin] = useState("");
  const [process, setProcess] = useState("");

  const lastBrew = (bean: Rec) => db.brews.filter((b) => b.bean_id === bean.id).sort((a, b) => when(b) - when(a))[0];
  const latest = (bean: Rec) => { const b = lastBrew(bean); return b ? when(b) : 0; };
  const shown = beans
    .filter((b) => (!roaster || norm(b.roastery) === roaster) && (!origin || originKey(b.origin) === origin) && (!process || norm(b.process) === process))
    .sort((a, b) => Number(isFinished(a.finished)) - Number(isFinished(b.finished)) || latest(b) - latest(a));

  if (!beans.length) return <p>{empty}</p>;

  return (
    <div className="stack">
      <div className="shelf-bar">
        <div className="grid-3" style={{ flex: 1 }}>
          <SelectField label="Roaster" value={roaster} placeholder="All" onChange={setRoaster} options={groups(beans.map((b) => b.roastery))} />
          <SelectField label="Origin" value={origin} placeholder="All" onChange={setOrigin} options={groups(beans.map((b) => b.origin), originKey)} />
          <SelectField label="Process" value={process} placeholder="All" onChange={setProcess} options={groups(beans.map((b) => b.process))} />
        </div>
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === "cards"} aria-label="Card view" onClick={() => setMode("cards")}><SquaresFour size={18} aria-hidden /></button>
          <button type="button" aria-pressed={mode === "list"} aria-label="List view" onClick={() => setMode("list")}><ListBullets size={18} aria-hidden /></button>
        </div>
      </div>

      {!shown.length ? <p>No coffees match these filters.</p> : mode === "cards" ? (
        <div className="cards">
          {shown.map((bean) => {
            // The roaster's notes, else the latest brew's tasting.
            const own = parseFlavour(bean.flavour, db.settings.axes);
            const fl = own.layers.length ? own : parseFlavour(lastBrew(bean)?.flavour, db.settings.axes);
            const sub = [str(bean.roastery), str(bean.process)].filter(Boolean).join(", ");
            const name = str(bean.name) || "Unnamed";
            return (
              <button key={str(bean.id)} type="button" className={`card${isFinished(bean.finished) ? " done" : ""}`}
                onClick={() => go("beans", str(bean.id))} aria-label={`${name}${sub ? `, ${sub}` : ""}. Open coffee`}>
                {isFinished(bean.finished) && (
                  <span className="card-badge" title="Bag finished"><CheckCircle size={18} weight="fill" aria-hidden /><span className="sr-only">Finished</span></span>
                )}
                <MiniRadar axes={fl.axes} layers={fl.layers} />
                <Marquee className="card-title">{name}</Marquee>
                {sub && <Marquee className="card-sub">{sub}</Marquee>}
                {bean.origin ? <Marquee className="card-sub">{str(bean.origin)}</Marquee> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="list">
          {shown.map((bean) => {
            const n = db.brews.filter((b) => b.bean_id === bean.id).length;
            const sub = [str(bean.roastery), str(bean.process)].filter(Boolean).join(", ");
            return (
              <div className={`item${isFinished(bean.finished) ? " done" : ""}`} key={str(bean.id)}>
                {isFinished(bean.finished) && <CheckCircle size={20} weight="fill" aria-label="Finished" style={{ flex: "none" }} />}
                <button type="button" className="item-main" onClick={() => go("beans", str(bean.id))}>
                  <Marquee className="item-title">{str(bean.name) || "Unnamed"}</Marquee>
                  <span className="meta">
                    {sub && <span>{sub}</span>}
                    {bean.origin ? <span>{str(bean.origin)}</span> : null}
                    <span>{n} {n === 1 ? "brew" : "brews"}</span>
                    {isFinished(bean.finished) && <span>Finished</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
