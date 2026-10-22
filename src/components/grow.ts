// Chart entrance: every point of every note travels out from the centre along its own axis, each
// starting a little apart, so shapes morph into place instead of zooming. Runs once per mount.
import { useEffect, useRef, useState } from "react";

const DUR = 900; // ms for one point to travel out
const LAYER_SPREAD = 350; // notes start apart from each other...
const POINT_SPREAD = 250; // ...and each point within a note a little apart again
const ease = (x: number) => 1 - (1 - x) ** 4; // quick start, slow settle

/** Returns the share (0 to 1) of its final distance that point `axis` of note `layer` has travelled. */
export function useGrow(animate = true): (layer: number, axis: number) => number {
  const still = !animate || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [t, setT] = useState(still ? Infinity : 0);
  const delays = useRef(new Map<string, number>());
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const e = now - start;
      if (e >= DUR + LAYER_SPREAD + POINT_SPREAD) return setT(Infinity);
      setT(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still]);
  const delay = (key: string, spread: number) => {
    let d = delays.current.get(key);
    if (d == null) delays.current.set(key, (d = Math.random() * spread));
    return d;
  };
  return (layer, axis) =>
    t === Infinity ? 1 : ease(Math.min(1, Math.max(0, (t - delay(`l${layer}`, LAYER_SPREAD) - delay(`${layer}:${axis}`, POINT_SPREAD)) / DUR)));
}
