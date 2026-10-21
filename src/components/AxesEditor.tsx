// Ordered radar axes (clockwise from the top) with colour, label, move and delete.
import { useId, useRef } from "react";
import { ArrowCounterClockwise, ArrowDown, ArrowUp, LinkSimple, Plus, Trash } from "@phosphor-icons/react";
import { MAX_AXES, MIN_AXES, axisKey, type AxisDef } from "../calc.ts";
import { IconButton } from "../ui.tsx";
import ColourPicker from "./ColourPicker.tsx";
import Radar from "./Radar.tsx";

const unique = (base: string, taken: Set<string>) => {
  const b = base || "axis";
  let k = b;
  for (let i = 2; taken.has(k); i++) k = `${b}_${i}`;
  return k;
};

export default function AxesEditor({ axes, onChange, template }: { axes: AxisDef[]; onChange: (a: AxisDef[]) => void; template?: AxisDef[] }) {
  // Keys of axes added here follow their label; existing keys stay put so stored values survive a rename.
  const fresh = useRef(new Set<string>());
  const uid = useId();
  // Stable React keys, so renaming a fresh axis (which changes its key) keeps input focus.
  const ids = useRef({ map: new Map<string, number>(), next: 0 });
  const idOf = (key: string) => {
    const { map } = ids.current;
    if (!map.has(key)) map.set(key, ids.current.next++);
    return map.get(key)!;
  };
  const set = (i: number, patch: Partial<AxisDef>) => onChange(axes.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const rename = (i: number, label: string) => {
    const a = axes[i];
    if (!fresh.current.has(a.key)) return set(i, { label });
    const key = unique(axisKey(label), new Set(axes.filter((_, j) => j !== i).map((x) => x.key)));
    fresh.current.delete(a.key);
    fresh.current.add(key);
    if (key !== a.key) {
      ids.current.map.set(key, idOf(a.key));
      ids.current.map.delete(a.key);
    }
    set(i, { label, key });
  };
  const move = (i: number, d: number) => {
    const next = [...axes];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const add = () => {
    const key = unique(axisKey("New"), new Set(axes.map((a) => a.key)));
    fresh.current.add(key);
    onChange([...axes, { key, label: "New", color: "#7A766E" }]);
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="label">Axes, clockwise from the top</span>
        <div className="row">
          {template && (
            <IconButton icon={ArrowCounterClockwise} label="Reset to template" onClick={() => { fresh.current.clear(); onChange(template); }} />
          )}
          <IconButton icon={Plus} label="Add axis" onClick={add} disabled={axes.length >= MAX_AXES} />
        </div>
      </div>
      <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 8 }}>
        {axes.map((a, i) => {
          const id = idOf(a.key);
          const blank = !a.label.trim();
          return (
            <li key={id} style={{ display: "grid", gap: 4 }}>
              <div className="row">
                <ColourPicker value={a.color} label={`${a.label || "Axis"} colour`} onChange={(color) => set(i, { color })} />
                <input
                  className="input" style={{ minWidth: 0, flex: "1 1 120px" }} value={a.label} maxLength={24} placeholder="Name this axis"
                  aria-label={`Axis ${i + 1} label`} aria-invalid={blank} aria-describedby={blank ? `${uid}-${id}` : undefined}
                  onChange={(e) => rename(i, e.target.value)}
                />
                <IconButton
                  icon={LinkSimple} label="Share across all notes" pressed={!!a.shared}
                  onClick={() => onChange(axes.map((x, j) => (j === i ? { ...x, shared: !x.shared } : x)))}
                />
                <IconButton icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
                <IconButton icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === axes.length - 1} />
                <IconButton icon={Trash} label="Delete axis" onClick={() => onChange(axes.filter((_, j) => j !== i))} disabled={axes.length <= MIN_AXES} />
              </div>
              {blank && <span id={`${uid}-${id}`} style={{ fontSize: 12, color: "var(--error)" }}>Name this axis</span>}
            </li>
          );
        })}
      </ol>
      <Radar axes={axes} layers={[]} legend={false} size={200} title="Axes preview" emptyText="" />
    </div>
  );
}
