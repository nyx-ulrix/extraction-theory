// Home: every past brew as a small card: spider chart, bean, roastery and process, origin.
import { Coffee, Plant } from "@phosphor-icons/react";
import { parseFlavour, type AxisDef, type Layer } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { Button } from "../ui.tsx";
import { beanName, str, when } from "./History.tsx";

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

export default function Home() {
  const { db, go } = useApp();
  const brews = [...db.brews].sort((a, b) => when(b) - when(a));

  return (
    <div className="page stack-lg">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Home</h1>
        <Button icon={Plant} onClick={() => go("beans", "new")}>Add bean</Button>
      </div>

      {brews.length ? (
        <div className="cards">
          {brews.map((b) => {
            const bean = db.beans.find((x) => x.id === b.bean_id);
            // The brew's own tasting, else the roaster's notes for the bean.
            const own = parseFlavour(b.flavour, db.settings.axes);
            const fl = own.layers.length ? own : parseFlavour(bean?.flavour, db.settings.axes);
            const sub = [str(bean?.roastery), str(bean?.process)].filter(Boolean).join(", ");
            return (
              <button key={str(b.id)} type="button" className="card" onClick={() => go("history", str(b.id))}
                aria-label={`${beanName(db, b.bean_id)}${sub ? `, ${sub}` : ""}. Open brew`}>
                <MiniRadar axes={fl.axes} layers={fl.layers} />
                <span className="card-title">{beanName(db, b.bean_id)}</span>
                {sub && <span className="card-sub">{sub}</span>}
                {bean?.origin ? <span className="card-sub">{str(bean.origin)}</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="stack">
          <p>No brews yet. Add the beans you are brewing, then log your first cup.</p>
          <div><Button ghost icon={Coffee} onClick={() => go("brew")}>Log a brew</Button></div>
        </div>
      )}
    </div>
  );
}
