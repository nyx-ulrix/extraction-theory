// QR codes in the site's risograph print: data modules as round halftone dots in ink, the three finder
// eyes as sharp squares in the coffee's accent ink. Medium error correction covers the gaps between dots.
import { encode } from "uqr";
import { luminance } from "./ColourPicker.tsx";

export const QR_INK = "#0A0A0A";
export const QR_PAPER = "#FFFFFF";

/** The accent for the eyes: the ink deepened (same hue) until it is dark enough for any scanner. */
export function qrAccent(c: string | undefined): string {
  if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return QR_INK;
  let rgb = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const hex = () => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  while (luminance(hex()) > 0.38) rgb = rgb.map((v) => v * 0.9);
  return hex();
}

/** SVG markup for a QR code `size` wide at (x, y), quiet zone included. */
export function qrMarks(text: string, o: { x?: number; y?: number; size: number; accent?: string }): { svg: string; version: number } {
  const qr = encode(text, { ecc: "M", border: 0 });
  const n = qr.size;
  const m = o.size / (n + 8); // 4 modules of quiet zone each side
  const x0 = (o.x ?? 0) + 4 * m, y0 = (o.y ?? 0) + 4 * m;
  const eye = o.accent ?? QR_INK;
  const f = (v: number) => +v.toFixed(2);
  const parts = [`<rect x="${f(o.x ?? 0)}" y="${f(o.y ?? 0)}" width="${f(o.size)}" height="${f(o.size)}" fill="${QR_PAPER}"/>`];
  // Dots: one path of circles, drawn as two arcs each.
  const r = m * 0.46;
  let d = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!qr.data[row][col] || qr.types[row][col] === 2) continue; // 2 = finder (Position)
      const cx = x0 + (col + 0.5) * m, cy = y0 + (row + 0.5) * m;
      d += `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
    }
  }
  parts.push(`<path d="${d}" fill="${QR_INK}"/>`);
  // Eyes: a 7-module square ring and a 3-module square, sharp like the rest of the site.
  for (const [row, col] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const ex = x0 + col * m, ey = y0 + row * m;
    parts.push(
      `<path fill-rule="evenodd" fill="${eye}" d="M${f(ex)} ${f(ey)}h${f(7 * m)}v${f(7 * m)}h${f(-7 * m)}z M${f(ex + m)} ${f(ey + m)}v${f(5 * m)}h${f(5 * m)}v${f(-5 * m)}z"/>`,
      `<rect x="${f(ex + 2 * m)}" y="${f(ey + 2 * m)}" width="${f(3 * m)}" height="${f(3 * m)}" fill="${eye}"/>`,
    );
  }
  return { svg: parts.join(""), version: qr.version };
}
