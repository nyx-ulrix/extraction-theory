import { useApp } from "../../ctx.ts";
import { finalRatio, fmtTime, num, pressTimes, round, type Num } from "../../calc.ts";
import { extraction, iceAssist, iceTarget, liquidKey, solve, sumWater, withF, type Draft, type RatioKey, type Up } from "../../brew.ts";
import { STARTS, layoutFor, shows, type MethodDef } from "../../schema.ts";
import { NumField, Section, TimeField } from "../../ui.tsx";
import Readout from "./Readout.tsx";

const r = (v: Num) => (v == null ? null : `1:${v}`);
const g = (v: Num) => (v == null ? null : `${v} g`);

export default function Recipe({ d, up, m, err }: { d: Draft; up: Up; m: MethodDef; err?: string }) {
  const { db } = useApp();
  const st = db.settings;
  const basic = st.brew_mode === "basic";
  // I have a life gets the espresso shot time only (Aeropress works time out from the presses either way).
  const showTime = shows(st, "total_s") || (basic && m.time === "shot");
  const start = STARTS[m.id] ?? {};
  const ph = (v?: number) => (v == null ? undefined : String(v));
  const f = d.f;
  const dose = num(f.dose_g);
  const doseLabel = basic ? "Coffee" : "Dose";
  const ratioHint = !basic ? undefined : m.liquid === "yield"
    ? `Espresso out per gram of coffee. 1:${start.ratio ?? 2} is a good start.`
    : `Water per gram of coffee. 1:${start.ratio ?? 16} is a good start.`;
  const temp = <NumField label="Temp" unit="°C" value={num(f.temp_c)} placeholder={ph(start.temp)} onChange={(v) => up(withF({ temp_c: v }))} />;
  // Pour phases switched off: the water poured is typed here instead.
  const noPours = !!m.pours && !layoutFor(m, db.fields, st).includes("pours");
  const pressTotal = pressTimes(d.presses.map((p) => ({ start: p.start_s, duration: p.duration_s }))).total;
  const time =
    m.time === "shot" || m.time === "total" ? (
      <TimeField label="Time" value={num(f.total_s)} onChange={(v) => up(withF({ total_s: v }))} />
    ) : m.time === "derived" ? (
      <Readout label="Time">{pressTotal != null ? fmtTime(pressTotal) : null}</Readout>
    ) : null;

  let body;
  let readouts: [string, string | null][] = [];
  if (!m.pours) {
    // Any two of dose, liquid and ratio fill the third.
    const lk = liquidKey(m);
    const edit = (k: RatioKey) => (v: Num) => up((o) => solve(o, m, k, v));
    body = (
      <>
        <NumField label={doseLabel} unit="g" min={0} value={dose} placeholder={ph(start.dose)} onChange={edit("dose")} />
        <NumField label={m.liquid === "yield" ? (basic ? "Out" : "Yield") : "Water"} unit="g" min={0} value={num(f[lk])}
          placeholder={ph(start.liquid)} onChange={edit("liquid")} />
        <NumField label="Ratio" min={0} value={num(f.ratio)} placeholder={ph(start.ratio)} onChange={edit("ratio")} />
      </>
    );
  } else {
    const water = noPours ? num(f.water_g) : sumWater(d.pours);
    const brewRatio = dose && water ? round(water / dose, 2) : null;
    if (m.ice) {
      const t = iceTarget(d);
      const set = (patch: Partial<Draft["x"]> | null, fp: Record<string, Num>) =>
        up((o) => iceAssist({ ...withF(fp)(o), x: { ...o.x, ...patch } }));
      body = (
        <>
          <NumField label={doseLabel} unit="g" min={0} value={dose} placeholder={ph(start.dose)} onChange={(v) => set(null, { dose_g: v })} />
          <NumField label="Final" min={0} value={num(f.final_ratio)} placeholder={ph(start.ratio)}
            onChange={(v) => set(null, { final_ratio: v })} />
          <NumField label="Ice" unit="%" min={0} max={100} value={d.x.ice_pct} onChange={(v) => set({ ice_pct: v }, {})} />
        </>
      );
      readouts = [
        ["Hot water target", g(t?.hot ?? null)],
        ["Ice target", g(t?.ice ?? null)],
        ["Water poured", g(water)],
        ["Brew ratio", r(brewRatio)],
        ["Final ratio poured", r(finalRatio(dose, water, num(f.ice_g), !!f.ice_max))],
      ];
    } else {
      // Water is the sum of the pours; the ratio here is the target the splitter uses. The water poured
      // and the ratio it makes are in the summary bar, so the row keeps room for what is typed.
      body = (
        <>
          <NumField label={doseLabel} unit="g" min={0} value={dose} placeholder={ph(start.dose)} onChange={(v) => up(withF({ dose_g: v }))} />
          <NumField label={noPours ? "Ratio" : "Target"} min={0} value={num(f.ratio)} placeholder={ph(start.ratio)}
            onChange={(v) => up(withF({ ratio: v }))} />
          {noPours && <NumField label="Water" unit="g" min={0} value={num(f.water_g)} onChange={(v) => up(withF({ water_g: v }))} />}
        </>
      );
    }
  }
  // Espresso flow: the yield over the time the pump was actually pushing.
  if (m.liquid === "yield" && shows(st, "total_s")) {
    const run = (num(f.total_s) ?? 0) - (num(f.presoak_s) ?? 0) - (num(f.hold_s) ?? 0);
    const out = num(f.yield_g);
    readouts.push(["Average flow", out && run > 0 ? `${round(out / run, 2)} g/s` : null]);
  }
  const ey = extraction(m, f);
  const typed = showTime && (m.time === "shot" || m.time === "total");
  const hint = [
    ratioHint,
    typed ? `Time: type the digits, 230 is 2:30${basic && m.time === "shot" ? "; aim for about 25 to 35 s" : ""}.` : "",
  ].filter(Boolean).join(" ");
  return (
    <Section title="Recipe">
      {/* One line per row, so the recipe reads at a glance without scrolling; hints sit under it. */}
      <div className="recipe-line">
        {body}
        {temp}
        {showTime && time}
      </div>
      {hint && <p className="meta">{hint}</p>}
      {shows(st, "extraction") && (
        <>
          <div className="recipe-line">
            <NumField label="TDS" unit="%" min={0} max={30} value={num(f.tds_pct)} onChange={(v) => up(withF({ tds_pct: v }))} />
            {m.liquid !== "yield" && (
              <NumField label="Drink" unit="g" min={0} value={num(f.beverage_g)} onChange={(v) => up(withF({ beverage_g: v }))} />
            )}
            <Readout label="EY">{ey != null ? `${ey}%` : null}</Readout>
          </div>
          <p className="meta">TDS from a refractometer{m.liquid !== "yield" ? "; drink is the weight of the brewed coffee" : ""}. EY is the extraction yield.</p>
        </>
      )}
      {err && <p className="brew-err" role="alert">{err}</p>}
      {readouts.length > 0 && (
        <dl className="brew-kv num">
          {readouts.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v ?? "-"}</dd></div>
          ))}
        </dl>
      )}
    </Section>
  );
}
