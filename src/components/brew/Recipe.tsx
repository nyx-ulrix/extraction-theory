import { finalRatio, fmtTime, num, pressTimes, round, type Num } from "../../calc.ts";
import { iceAssist, iceTarget, liquidKey, solve, sumWater, withF, type Draft, type RatioKey, type Up } from "../../brew.ts";
import type { MethodDef } from "../../schema.ts";
import { NumField, Section, TimeField } from "../../ui.tsx";
import Readout from "./Readout.tsx";

const r = (v: Num) => (v == null ? null : `1:${v}`);
const g = (v: Num) => (v == null ? null : `${v} g`);

export default function Recipe({ d, up, m, err }: { d: Draft; up: Up; m: MethodDef; err?: string }) {
  const f = d.f;
  const dose = num(f.dose_g);
  const temp = <NumField label={m.tempLabel} unit="°C" value={num(f.temp_c)} onChange={(v) => up(withF({ temp_c: v }))} />;
  const pressTotal = pressTimes(d.presses.map((p) => ({ start: p.start_s, duration: p.duration_s }))).total;
  const time =
    m.time === "shot" || m.time === "total" ? (
      <TimeField label={m.time === "shot" ? "Shot time" : "Total time"} value={num(f.total_s)} onChange={(v) => up(withF({ total_s: v }))} />
    ) : m.time === "derived" ? (
      <Readout label="Total time">{pressTotal != null ? fmtTime(pressTotal) : null}</Readout>
    ) : null;

  let body;
  let readouts: [string, string | null][] = [];
  if (!m.pours) {
    // Any two of dose, liquid and ratio fill the third.
    const lk = liquidKey(m);
    const edit = (k: RatioKey) => (v: Num) => up((o) => solve(o, m, k, v));
    body = (
      <>
        <NumField label="Dose" unit="g" min={0} value={dose} onChange={edit("dose")} />
        <NumField label={m.liquid === "yield" ? "Yield" : "Water"} unit="g" min={0} value={num(f[lk])} onChange={edit("liquid")} />
        <NumField label="Ratio (1:x)" min={0} value={num(f.ratio)} onChange={edit("ratio")} />
      </>
    );
  } else {
    const water = sumWater(d.pours);
    const brewRatio = dose && water ? round(water / dose, 2) : null;
    if (m.ice) {
      const t = iceTarget(d);
      const set = (patch: Partial<Draft["x"]> | null, fp: Record<string, Num>) =>
        up((o) => iceAssist({ ...withF(fp)(o), x: { ...o.x, ...patch } }));
      body = (
        <>
          <NumField label="Dose" unit="g" min={0} value={dose} onChange={(v) => set(null, { dose_g: v })} />
          <NumField label="Final ratio (1:x)" min={0} value={num(f.final_ratio)} onChange={(v) => set(null, { final_ratio: v })} />
          <NumField label="Ice share" unit="%" min={0} max={100} value={d.x.ice_pct} onChange={(v) => set({ ice_pct: v }, {})} />
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
      // Water is the sum of the pours; the ratio here is the target the splitter uses.
      body = (
        <>
          <NumField label="Dose" unit="g" min={0} value={dose} onChange={(v) => up(withF({ dose_g: v }))} />
          <NumField label="Target ratio (1:x)" min={0} value={num(f.ratio)} onChange={(v) => up(withF({ ratio: v }))} />
          <Readout label="Water poured">{g(water)}</Readout>
          <Readout label="Ratio">{r(brewRatio)}</Readout>
        </>
      );
    }
  }
  return (
    <Section title="Dose, ratio, temp, time">
      <div className="grid-3">
        {body}
        {temp}
        {time}
      </div>
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
