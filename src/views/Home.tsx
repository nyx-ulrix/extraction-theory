// Home: every past brew as a card with its spider chart and the bean's key facts.
import { Coffee, Plant } from "@phosphor-icons/react";
import { num, parseFlavour } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { methodDefs } from "../schema.ts";
import { Button } from "../ui.tsx";
import Radar from "../components/Radar.tsx";
import { beanName, methodOf, ratioOf, stamp, str, when } from "./History.tsx";

export default function Home() {
  const { db, go } = useApp();
  const defs = methodDefs(db.fields);
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
            const m = methodOf(b.method, defs);
            const bean = db.beans.find((x) => x.id === b.bean_id);
            const fl = parseFlavour(b.flavour, db.settings.axes);
            const facts = [str(bean?.origin), str(bean?.process)].filter(Boolean);
            const dose = num(b.dose_g);
            return (
              <button key={str(b.id)} type="button" className="card" onClick={() => go("history", str(b.id))}>
                <Radar axes={fl.axes} layers={fl.layers} size={240} legend={false} emptyText="No tasting notes yet" title={`${beanName(db, b.bean_id)} flavour`} />
                <span className="card-title">{beanName(db, b.bean_id)}</span>
                {bean?.roastery ? <span className="muted">{str(bean.roastery)}</span> : null}
                <span className="card-facts">{facts.length ? facts.join(", ") : "Origin and process not set"}</span>
                <span className="meta num">
                  {m.label} · {stamp(b.brew_date ?? b.created).slice(0, 10) || "-"}
                </span>
                <span className="meta num">
                  {[b.grind_setting ? `Grind ${str(b.grind_setting)}` : "", dose != null ? `${dose} g` : "", ratioOf(b, m)].filter(Boolean).join(", ") || "-"}
                </span>
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
