import { useState } from "react";
import { ArrowDown, ArrowUp, MagicWand, Plus, Trash } from "@phosphor-icons/react";
import { fromTargets, num, parsePattern, planPours, toTargets, type Num } from "../../calc.ts";
import { useApp } from "../../ctx.ts";
import { kp, type Draft, type DPhase, type Up } from "../../brew.ts";
import { AGITATION_TIMING, AGITATIONS, newPhase, type Phase } from "../../schema.ts";
import { IconButton, NumField, Section, Segmented, SelectField, TextField, TimeField } from "../../ui.tsx";
import Readout from "./Readout.tsx";

const TIMING = AGITATION_TIMING.map(([v, l]): [string, string] => [v, l]);

export default function Pours({ d, up, total, hybrid }: { d: Draft; up: Up; total: Num; hybrid: boolean }) {
  const { db } = useApp();
  const pours = d.pours;
  const brewTemp = num(d.f.temp_c);
  const target = db.settings.pour_style === "target";
  const cum = toTargets(pours.map((p) => p.water_g ?? 0));
  const pattern = parsePattern(d.x.pattern);
  const patternErr = d.x.pattern.trim() && !pattern;
  // Scale readings refused for being below the previous one, by phase key.
  const [low, setLow] = useState<Record<string, number>>({});
  const [typing, setTyping] = useState<string | null>(null);

  const setPours = (ps: DPhase[]) => up((o) => ({ ...o, pours: ps }));
  const setX = (patch: Partial<Draft["x"]>) => up((o) => ({ ...o, x: { ...o.x, ...patch } }));
  const edit = (i: number, patch: Partial<Phase>) => setPours(pours.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, by: number) => {
    const ps = [...pours];
    [ps[i], ps[i + by]] = [ps[i + by], ps[i]];
    setPours(ps);
  };
  // Stored per pour. A scale reading changes this pour and, if set, the next one so later readings hold.
  function setWater(i: number, v: Num) {
    const prev = i ? cum[i - 1] : 0;
    const bad = target && v != null && v < prev;
    const k = pours[i].k;
    setLow((o) => {
      const n = { ...o };
      if (bad) n[k] = prev;
      else delete n[k];
      return n;
    });
    if (bad) return;
    if (!target || v == null) return edit(i, { water_g: v });
    const t = [...cum];
    t[i] = v;
    const per = fromTargets(t);
    setPours(pours.map((p, j) => (j === i || (j === i + 1 && p.water_g != null) ? { ...p, water_g: Math.max(0, per[j]) } : p)));
  }
  const split = (o: Draft, pt: number[] | null): Draft => {
    if (!pt || !total) return o;
    const plan = planPours({ total, pattern: pt, interval: o.x.interval });
    return {
      ...o,
      pours: plan.map((s, i) => ({
        ...(o.pours[i] ?? kp(newPhase("pour", i + 1))), water_g: s.water, start_s: s.start ?? o.pours[i]?.start_s ?? null,
      })),
    };
  };

  return (
    <Section title="Pour phases" actions={
      <IconButton icon={Plus} label="Add phase" onClick={() => setPours([...pours, kp(newPhase("pour", pours.length + 1))])} />
    }>
      <div className="stack brew-assist">
        <Readout label="Water to split">{total != null ? `${total} g` : null}</Readout>
        <div className="brew-split">
          <TextField
            label="Split pattern" value={d.x.pattern} placeholder="1:2:3:3" onChange={(v) => setX({ pattern: v })}
            hint={patternErr ? "Use numbers split by colons, for example 4:6" : "Parts of the water, the first is the bloom"}
          />
          <NumField label="Interval" unit="s" value={d.x.interval} onChange={(v) => setX({ interval: v })} min={0} hint="Optional, sets start times" />
          <IconButton icon={MagicWand} label="Split water into phases" variant="solid" disabled={!pattern || !total}
            onClick={() => up((o) => split(o, pattern))} />
        </div>
        {db.settings.presets.length > 0 && (
          <div className="row" role="group" aria-label="Split presets">
            {db.settings.presets.map((p) => (
              <button key={p.name} type="button" className="chip" aria-pressed={d.x.pattern === p.pattern}
                onClick={() => up((o) => split({ ...o, x: { ...o.x, pattern: p.pattern } }, parsePattern(p.pattern)))}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {pours.length === 0 && <p>No phases yet. Split the water above or add a phase.</p>}
      {pours.map((p, i) => (
        <div key={p.k} className="phase">
          <header>
            <span className="label">{i === 0 ? "Bloom" : `Phase ${i + 1}`}</span>
            <span className="spacer" />
            <IconButton icon={ArrowUp} label="Move up" variant="bare" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon={ArrowDown} label="Move down" variant="bare" disabled={i === pours.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon={Trash} label="Remove phase" variant="bare" onClick={() => setPours(pours.filter((_, j) => j !== i))} />
          </header>
          <div className="grid-3">
            <TimeField label="Start" value={p.start_s} onChange={(v) => edit(i, { start_s: v })} />
            {/* Only flag a too-low reading once the field loses focus, not while typing 2, 25, 250. */}
            <div onFocus={() => setTyping(p.k)} onBlur={() => setTyping(null)} style={{ minWidth: 0 }}>
              <NumField
                label={target ? "Scale reading" : "Water"} unit="g" min={0}
                value={target ? (p.water_g == null ? null : cum[i]) : p.water_g} onChange={(v) => setWater(i, v)}
              />
            </div>
            <NumField
              label="Temp" unit="°C" value={p.temp_c} placeholder={brewTemp != null ? String(brewTemp) : "Brew temp"}
              onChange={(v) => edit(i, { temp_c: v })}
            />
            <SelectField label="Agitation" value={p.agitation} options={AGITATIONS} other onChange={(v) => edit(i, { agitation: v || "None" })} />
            {p.agitation !== "None" && (
              <>
                <SelectField label="When" value={p.agitation_timing} options={TIMING} onChange={(v) => edit(i, { agitation_timing: v || "after" })} />
                {p.agitation_timing === "at" && <TimeField label="Agitate at" value={p.agitation_at_s} onChange={(v) => edit(i, { agitation_at_s: v })} />}
                <NumField label="Count" value={p.agitation_count} min={0} step={1} onChange={(v) => edit(i, { agitation_count: v })} />
              </>
            )}
          </div>
          {low[p.k] != null && typing !== p.k && <p className="brew-err" role="alert">Must be at least {low[p.k]} g</p>}
          {hybrid && (
            <Segmented label="Valve" value={p.valve} onChange={(v) => edit(i, { valve: v })}
              options={[["open", "Open"], ["closed", "Closed"]]} />
          )}
        </div>
      ))}
    </Section>
  );
}
