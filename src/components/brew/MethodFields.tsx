import { num } from "../../calc.ts";
import { useApp } from "../../ctx.ts";
import { fieldShown, str, withF, type Draft, type Up } from "../../brew.ts";
import type { MethodField } from "../../schema.ts";
import { NumField, Section, SelectField, TextField, TimeField, Toggle } from "../../ui.tsx";

/** A run of Methods-tab fields, rendered by their type. */
export default function MethodFields({ title, fields, d, up }: { title: string; fields: MethodField[]; d: Draft; up: Up }) {
  const { db } = useApp();
  const set = (key: string) => (v: string | number | boolean | null) => up(withF({ [key]: v }));
  // Text fields (puck prep, basket, pressure...) offer what you have entered before, newest first.
  const used = (key: string) => [...new Set([...db.brews].reverse().map((b) => str(b[key]).trim()).filter(Boolean))];
  return (
    <Section title={title}>
      <div className="grid-2">
        {fields.filter((f) => fieldShown(f, d.f)).map((f) => {
          const v = d.f[f.key];
          switch (f.type) {
            case "number": return <NumField key={f.key} label={f.label} unit={f.unit || undefined} value={num(v)} onChange={set(f.key)} />;
            case "time": return <TimeField key={f.key} label={f.label} value={num(v)} onChange={set(f.key)} />;
            case "bool": return <Toggle key={f.key} label={f.label} checked={!!v} onChange={set(f.key)} />;
            case "select": return (
              <SelectField key={f.key} label={f.label} value={str(v)} other onChange={set(f.key)}
                options={(f.options ?? "").split("|").map((o) => o.trim()).filter(Boolean)} />
            );
            default: {
              const label = f.unit ? `${f.label} (${f.unit})` : f.label;
              const past = used(f.key);
              return past.length
                ? <SelectField key={f.key} label={label} value={str(v)} other options={past} placeholder="None" onChange={set(f.key)} />
                : <TextField key={f.key} label={label} value={str(v)} onChange={set(f.key)} />;
            }
          }
        })}
      </div>
    </Section>
  );
}
