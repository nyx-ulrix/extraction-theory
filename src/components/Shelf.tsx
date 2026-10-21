// A set of coffees as cards (with a small spider chart) or as a list, with roaster / origin / process filters.
import { useId, useState } from "react";
import { CheckCircle, Funnel, ListBullets, SortAscending, SquaresFour, Target } from "@phosphor-icons/react";
import { num, parseFlavour, type AxisDef, type Layer } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { dialedMethods, groups, isFinished, norm, originKey } from "../group.ts";
import type { Rec } from "../schema.ts";
import { Marquee, Segmented, SelectField } from "../ui.tsx";
import { shapePath, sharp, type Pt } from "./shape.ts";
import Fingerprint, { InkShape } from "./Fingerprint.tsx";
import { str, when } from "../views/History.tsx";
import { ink } from "../palette.ts";

/** Label-free spider chart for small cards: five rings, axis dots in their colours, see-through layers. */
function MiniRadar({ axes, layers, rounded, grid }: { axes: AxisDef[]; layers: Layer[]; rounded: boolean; grid: boolean }) {
  const n = axes.length;
  const MIN = rounded ? 0.16 : 0; // same soft-shape mapping as the full radar and the cup fingerprint
  const rad = (v: number) => 40 * (MIN + (1 - MIN) * (v / 10));
  const pt = (i: number, r: number): Pt => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  return (
    <svg viewBox="-46 -46 92 92" className="mini-radar" aria-hidden>
      {grid && [2, 4, 6, 8, 10].map((v) => rounded
        ? <circle key={v} r={rad(v)} fill="none" stroke="var(--border-soft)" strokeWidth={0.6} />
        : <path key={v} d={sharp(axes.map((_, i) => pt(i, rad(v))))} fill="none" stroke="var(--border-soft)" strokeWidth={0.6} />)}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 40);
        // Lines off hides the axis dots too, leaving only the note shapes.
        return grid ? <g key={a.key}><line x1={0} y1={0} x2={x} y2={y} stroke="var(--border-soft)" strokeWidth={0.6} /><circle cx={x} cy={y} r={2.4} fill={ink(a.color)} stroke="var(--text)" strokeWidth={0.4} /></g> : null;
      })}
      {layers.map((l, k) => (
        <InkShape key={k} d={shapePath(axes.map((a, i) => pt(i, rad(l.v[a.key] ?? 0))), rounded)} color={l.color} pitch={2.4} />
      ))}
    </svg>
  );
}

// New on every page load; steady while the app is open, so cards don't change shape on each re-render.
const LOAD_SALT = String(Math.random());

/** Stand-in for a coffee with no notes yet: two random shapes, new each load, drawn greyed out. */
function ghost(axes: AxisDef[], id: string): Layer[] {
  const seed = id + LOAD_SALT;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  return [0, 1].map(() => ({ note: "", color: "#9A968D", v: Object.fromEntries(axes.map((a) => [a.key, Math.round((2 + rnd() * 7) * 2) / 2])) }));
}

type Mode = "cards" | "list";
function savedMode(key: string): Mode {
  try { return localStorage.getItem(`et.shelf.${key}`) === "list" ? "list" : "cards"; } catch { return "cards"; }
}
type Sort = "recent" | "name" | "added" | "roasted";
const SORTS: [Sort, string][] = [["recent", "Last brewed"], ["name", "Name"], ["added", "Date added"], ["roasted", "Date roasted"]];
function savedSort(key: string): Sort {
  try {
    const v = localStorage.getItem(`et.shelf.${key}.sort`);
    return SORTS.some(([s]) => s === v) ? (v as Sort) : "recent";
  } catch { return "recent"; }
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
  const [bag, setBag] = useState("");
  const [sort, setSortState] = useState<Sort>(() => savedSort(storageKey));
  const setSort = (s: Sort) => {
    setSortState(s);
    try { localStorage.setItem(`et.shelf.${storageKey}.sort`, s); } catch { /* storage blocked */ }
  };
  const [panel, setPanel] = useState<"filters" | "sort" | null>(null);
  const toggle = (p: "filters" | "sort") => setPanel(panel === p ? null : p);
  const filterId = useId();
  const sortId = useId();
  // The bag filter only matters where both open and finished bags are listed (the Library).
  const mixed = beans.some((b) => isFinished(b.finished)) && beans.some((b) => !isFinished(b.finished));
  const active = [roaster, origin, process, mixed && bag].filter(Boolean).length;

  const lastBrew = (bean: Rec) => db.brews.filter((b) => b.bean_id === bean.id).sort((a, b) => when(b) - when(a))[0];
  const latest = (bean: Rec) => { const b = lastBrew(bean); return b ? when(b) : 0; };
  const dialed = (bean: Rec) => dialedMethods(bean).length > 0
    || db.brews.some((b) => b.bean_id === bean.id && (b.dialed_in === true || str(b.dialed_in).toLowerCase() === "true"));
  // Dates: newest first, coffees without one last. Last brewed also keeps finished bags at the end.
  const date = (v: unknown) => num(v) ?? -Infinity;
  const order: Record<Sort, (a: Rec, b: Rec) => number> = {
    recent: (a, b) => Number(isFinished(a.finished)) - Number(isFinished(b.finished)) || latest(b) - latest(a),
    name: (a, b) => str(a.name).localeCompare(str(b.name), undefined, { sensitivity: "base", numeric: true }),
    added: (a, b) => date(b.created) - date(a.created),
    roasted: (a, b) => date(b.roast_date) - date(a.roast_date),
  };
  const shown = beans
    .filter((b) => (!roaster || norm(b.roastery) === roaster) && (!origin || originKey(b.origin) === origin) && (!process || norm(b.process) === process)
      && (!mixed || !bag || (bag === "finished") === isFinished(b.finished)))
    .sort((a, b) => order[sort](a, b) || str(a.name).localeCompare(str(b.name)));

  if (!beans.length) return <p>{empty}</p>;

  return (
    <div className="stack">
      <div className="shelf-bar">
        <div className="seg" role="group" aria-label="View and filters">
          <button type="button" aria-pressed={panel === "filters"} aria-expanded={panel === "filters"} aria-controls={filterId}
            aria-label={active ? `Filters, ${active} on` : "Filters"} onClick={() => toggle("filters")}>
            <Funnel size={18} weight={active ? "fill" : "regular"} aria-hidden />{active > 0 && <span className="num">{active}</span>}
          </button>
          <button type="button" aria-pressed={panel === "sort"} aria-expanded={panel === "sort"} aria-controls={sortId}
            aria-label={`Sort, ${SORTS.find(([s]) => s === sort)![1]}`} onClick={() => toggle("sort")}>
            <SortAscending size={18} weight={sort !== "recent" ? "fill" : "regular"} aria-hidden />
          </button>
          <button type="button" aria-pressed={mode === "cards"} aria-label="Card view" onClick={() => setMode("cards")}><SquaresFour size={18} aria-hidden /></button>
          <button type="button" aria-pressed={mode === "list"} aria-label="List view" onClick={() => setMode("list")}><ListBullets size={18} aria-hidden /></button>
        </div>
      </div>
      {panel === "filters" && (
        <div className="shelf-filters" id={filterId}>
          <div className="grid-3">
            <SelectField label="Roaster" value={roaster} placeholder="All" onChange={setRoaster} options={groups(beans.map((b) => b.roastery))} />
            <SelectField label="Origin" value={origin} placeholder="All" onChange={setOrigin} options={groups(beans.map((b) => b.origin), originKey)} />
            <SelectField label="Process" value={process} placeholder="All" onChange={setProcess} options={groups(beans.map((b) => b.process))} />
            {mixed && <SelectField label="Bag" value={bag} placeholder="All" onChange={setBag} options={[["available", "Available"], ["finished", "Finished"]]} />}
          </div>
          {active > 0 && (
            <div><button type="button" className="btn ghost" onClick={() => { setRoaster(""); setOrigin(""); setProcess(""); setBag(""); }}>Clear filters</button></div>
          )}
        </div>
      )}
      {panel === "sort" && (
        <div className="shelf-filters" id={sortId}>
          <Segmented label="Sort by" value={sort} onChange={setSort} options={SORTS} />
        </div>
      )}

      {!shown.length ? <p>No coffees match these filters.</p> : mode === "cards" ? (
        <div className="cards">
          {shown.map((bean) => {
            // The roaster's notes, else the latest brew's tasting.
            const own = parseFlavour(bean.flavour, db.settings.axes);
            const real = own.layers.length ? own : parseFlavour(lastBrew(bean)?.flavour, db.settings.axes);
            const empty = !real.layers.length;
            const fl = empty ? { axes: real.axes, layers: ghost(real.axes, str(bean.id)) } : real;
            const sub = [str(bean.roastery), str(bean.process)].filter(Boolean).join(", ");
            const name = str(bean.name) || "Unnamed";
            return (
              <button key={str(bean.id)} type="button" className={`card${isFinished(bean.finished) ? " done" : ""}${empty ? " ghost" : ""}`}
                onClick={() => go("beans", str(bean.id))} aria-label={`${name}${sub ? `, ${sub}` : ""}. Open coffee`}>
                {dialed(bean) && (
                  <span className="card-badge left" title="Dialed in"><Target size={18} weight="fill" aria-hidden /><span className="sr-only">Dialed in</span></span>
                )}
                {isFinished(bean.finished) && (
                  <span className="card-badge" title="Bag finished"><CheckCircle size={18} weight="fill" aria-hidden /><span className="sr-only">Finished</span></span>
                )}
                {db.settings.card_art === "blob" ? (
                  <span className="card-blob"><Fingerprint axes={fl.axes} layers={fl.layers} size={200} /></span>
                ) : (
                  <MiniRadar axes={fl.axes} layers={fl.layers} rounded={db.settings.card_shape === "rounded"} grid={db.settings.card_grid} />
                )}
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
                {dialed(bean) && <Target size={20} weight="fill" aria-label="Dialed in" style={{ flex: "none" }} />}
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
