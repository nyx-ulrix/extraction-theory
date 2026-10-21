// Path builders shared by the spider charts: sharp polygon or rounded (closed Catmull-Rom curve).
export type Pt = [number, number];

export function smooth(p: Pt[]): string {
  const n = p.length;
  const at = (i: number) => p[(i + n) % n];
  let d = `M${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${c1.map((v) => v.toFixed(2))} ${c2.map((v) => v.toFixed(2))} ${c[0].toFixed(2)},${c[1].toFixed(2)}`;
  }
  return d + "Z";
}

export const sharp = (p: Pt[]) => `M${p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}Z`;

export const shapePath = (p: Pt[], rounded: boolean) => (rounded ? smooth(p) : sharp(p));
