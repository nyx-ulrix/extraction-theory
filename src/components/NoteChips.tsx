// The notes under a chart as a wrapping row of chips, the same in the coffee page and the editor:
// tapping one shows that note alone (or picks it to shape), tapping it again shows them all.
import type { ReactNode } from "react";
import type { Layer } from "../calc.ts";
import { ink } from "../palette.ts";

export default function NoteChips({ layers, active, onTap, end }: {
  layers: Layer[];
  active: number | null;
  onTap: (i: number | null) => void;
  /** Shown at the end of the row, e.g. add, edit or export buttons. */
  end?: ReactNode;
}) {
  return (
    <div className="row note-chips">
      {layers.map((l, i) => (
        <button key={i} type="button" className="chip" aria-pressed={active === i}
          aria-label={active === i ? `${l.note || "Note"}, showing alone. Tap to show all notes` : `Show ${l.note || "note"} alone`}
          onClick={() => onTap(active === i ? null : i)}>
          <span className="swatch" style={{ background: ink(l.color) }} />{l.note || "Unnamed"}
        </button>
      ))}
      {end}
    </div>
  );
}
