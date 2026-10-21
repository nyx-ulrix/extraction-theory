import { fmtTime, pressTimes } from "../../calc.ts";
import { kp, type Draft, type Up } from "../../brew.ts";
import { newPhase, type Phase } from "../../schema.ts";
import { NumField, Section, TextField, TimeField } from "../../ui.tsx";
import Readout from "./Readout.tsx";

export default function Presses({ d, up }: { d: Draft; up: Up }) {
  const ps = d.presses;
  const t = pressTimes(ps.map((p) => ({ start: p.start_s, duration: p.duration_s })));
  const edit = (i: number, patch: Partial<Phase>) => up((o) => ({ ...o, presses: o.presses.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const resize = (n: number) => up((o) => ({
    ...o,
    presses: Array.from({ length: n }, (_, i) => o.presses[i] ?? kp(newPhase("press", i + 1))),
  }));
  return (
    <Section title="Press phases">
      <div className="grid-3">
        <NumField label="Press phases" value={ps.length} min={1} max={6} step={1}
          onChange={(v) => v != null && resize(Math.max(1, Math.min(6, Math.round(v))))} />
        <Readout label="Steep time">{t.steep != null ? fmtTime(t.steep) : null}</Readout>
        <Readout label="Total time">{t.total != null ? fmtTime(t.total) : null}</Readout>
      </div>
      {ps.map((p, i) => (
        <div key={p.k} className="phase">
          <span className="label">Press {i + 1}</span>
          <div className="grid-3">
            <TimeField label="Start" value={p.start_s} onChange={(v) => edit(i, { start_s: v })} />
            <NumField label="Duration" unit="s" min={0} value={p.duration_s} onChange={(v) => edit(i, { duration_s: v })} />
            <TextField label="Note" value={p.note} onChange={(v) => edit(i, { note: v })} />
          </div>
        </div>
      ))}
    </Section>
  );
}
