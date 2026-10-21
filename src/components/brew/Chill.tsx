import { num } from "../../calc.ts";
import { ICE_CHILLS, iceTarget, str, withF, type Draft, type Up } from "../../brew.ts";
import { CHILL_METHODS, type MethodDef } from "../../schema.ts";
import { NumField, Section, SelectField, TimeField, Toggle, type Opt } from "../../ui.tsx";

// Sensible stages per chill method. Hyperchiller is left to the user.
const DEFAULTS: Record<string, [string, string]> = { "Ice drip": ["start", "end"], Shaken: ["after", "after"] };

export default function Chill({ d, up, m, err }: { d: Draft; up: Up; m: MethodDef; err?: string }) {
  const method = str(d.f.chill_method);
  const iced = ICE_CHILLS.includes(method);
  const phases = m.pours ? d.pours.length : 0;
  const espresso = m.liquid === "yield";
  const iceT = m.ice ? iceTarget(d)?.ice : undefined;
  function pick(v: string) {
    const def = DEFAULTS[v];
    up(withF(def ? { chill_method: v, chill_start: def[0], chill_stop: def[1] } : { chill_method: v }));
  }
  return (
    <Section title="Chilling">
      <SelectField label="Chill method" value={method} options={CHILL_METHODS} other
        placeholder={m.chill === "required" ? "Choose" : "None"} onChange={pick} />
      {err && <p className="brew-err" role="alert">{err}</p>}
      {method && (
        <>
          {iced && (
            <div className="grid-2">
              {!d.f.ice_max && <NumField label="Ice" unit="g" min={0} value={num(d.f.ice_g)} placeholder={iceT != null ? String(iceT) : undefined} onChange={(v) => up(withF({ ice_g: v }))} />}
              <Toggle label="As much ice as possible" checked={!!d.f.ice_max} onChange={(v) => up(withF({ ice_max: v }))} />
            </div>
          )}
          <div className="grid-2">
            <Stage label="Chill start" value={str(d.f.chill_start)} phases={phases} espresso={espresso} onChange={(v) => up(withF({ chill_start: v }))} />
            <Stage label="Chill stop" value={str(d.f.chill_stop)} phases={phases} espresso={espresso} onChange={(v) => up(withF({ chill_stop: v }))} />
          </div>
        </>
      )}
    </Section>
  );
}

/** Stored as "start" | "phase:2" | "t:45" | "y:15" | "end" | "after". */
function Stage({ label, value, onChange, phases, espresso }: {
  label: string; value: string; onChange: (v: string) => void; phases: number; espresso: boolean;
}) {
  const [kind, raw = ""] = value.split(":");
  const opts: Opt[] = [
    ["start", "Brew start"],
    ...Array.from({ length: phases }, (_, i): Opt => [`phase:${i + 1}`, `Start of phase ${i + 1}`]),
    ["t", "At a time"],
    ...(espresso ? [["y", "At a yield"] as Opt] : []),
    ["end", "End of brew"],
    ["after", "After brew"],
  ];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <SelectField label={label} value={kind === "phase" ? value : kind} options={opts}
        onChange={(v) => onChange(v === "t" || v === "y" ? `${v}:` : v)} />
      {kind === "t" && <TimeField label={`${label} time`} value={num(raw)} onChange={(s) => onChange(`t:${s ?? ""}`)} />}
      {kind === "y" && <NumField label={`${label} yield`} unit="g" min={0} value={num(raw)} onChange={(g) => onChange(`y:${g ?? ""}`)} />}
    </div>
  );
}
