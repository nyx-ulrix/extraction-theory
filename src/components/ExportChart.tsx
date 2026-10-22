// Export a coffee's risograph chart as a PNG: pick the chart style and which details go with it, see a
// preview, then download or share. The image is one SVG (chart, text, embedded Space Mono) drawn to a canvas.
import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadSimple, ShareNetwork } from "@phosphor-icons/react";
import font400 from "@fontsource/space-mono/files/space-mono-latin-400-normal.woff2?url";
import font700 from "@fontsource/space-mono/files/space-mono-latin-700-normal.woff2?url";
import { fmtTime, fromSerial, num, type Flavour } from "../calc.ts";
import { useApp } from "../ctx.ts";
import { ink } from "../palette.ts";
import { bodyLabel, methodDefs, type Rec } from "../schema.ts";
import { Button, Dialog, Segmented, SelectField, Toggle } from "../ui.tsx";
import ColourPicker, { luminance } from "./ColourPicker.tsx";
import Fingerprint from "./Fingerprint.tsx";
import Radar from "./Radar.tsx";

const W = 1080; // image width; the height follows the content
const PAD = 72;
const CHART = 860;
const str = (v: unknown) => (v == null ? "" : String(v));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad2 = (n: number) => String(n).padStart(2, "0");
const stamp = (v: unknown) => {
  const n = num(v);
  if (n == null) return "";
  const d = fromSerial(n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
/** Space Mono is monospaced (0.6 em per character), so lines wrap by character count. */
function wrap(text: string, size: number, width = W - PAD * 2): string[] {
  const max = Math.max(8, Math.floor(width / (size * 0.6)));
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > max && line) { out.push(line); line = word; } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out;
}

let fontCss: Promise<string> | null = null;
const dataUrl = (url: string) => fetch(url).then((r) => r.blob()).then((b) => new Promise<string>((res) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result));
  fr.readAsDataURL(b);
}));
/** The app font, embedded so the image looks the same wherever it is opened. */
function fonts(): Promise<string> {
  return (fontCss ??= Promise.all([dataUrl(font400), dataUrl(font700)]).then(([a, b]) =>
    `@font-face{font-family:"Space Mono";font-weight:400;src:url(${a}) format("woff2")}@font-face{font-family:"Space Mono";font-weight:700;src:url(${b}) format("woff2")}`));
}

interface Opts {
  art: "radar" | "blob"; rounded: boolean; grid: boolean; coffee: boolean; notes: boolean; brewId: string;
  /** Background: the app theme's, none (transparent PNG), or a palette colour. */
  bg: "theme" | "none" | "colour"; bgColour: string;
}

export default function ExportChart({ bean, fl, open, onClose }: { bean: Rec; fl: Flavour; open: boolean; onClose: () => void }) {
  const { db, notify } = useApp();
  const s = db.settings;
  const brews = useMemo(() => db.brews.filter((b) => b.bean_id === bean.id).sort((a, b) => (num(b.brew_date) ?? 0) - (num(a.brew_date) ?? 0)), [db.brews, bean.id]);
  const defs = methodDefs(db.fields);
  const [o, setO] = useState<Opts>({
    art: s.page_art, rounded: s.page_shape === "rounded", grid: s.page_grid, coffee: true, notes: true, brewId: str(brews[0]?.id),
    bg: "theme", bgColour: "#F3F2EF",
  });
  const set = (p: Partial<Opts>) => setO((x) => ({ ...x, ...p }));
  const chartRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [working, setWorking] = useState(false);

  // Compose the image whenever an option changes (the chart is drawn off screen, without the entrance animation).
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const el = chartRef.current?.querySelector("svg");
      if (!el) return;
      const css = await fonts();
      if (live) setSvg(compose(el, o, bean, fl, brews.find((b) => b.id === o.brewId), db, defs, css));
    }, 50);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, o, bean, fl, brews]);

  const png = async (): Promise<Blob> => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth * 2;
    c.height = img.naturalHeight * 2;
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not make the image."))), "image/png"));
  };
  const name = `${str(bean.name).replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "coffee"}-chart.png`;
  const run = async (share: boolean) => {
    setWorking(true);
    try {
      const blob = await png();
      const file = new File([blob], name, { type: "image/png" });
      if (share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: str(bean.name) });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setWorking(false);
    }
  };
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare;

  return (
    <Dialog open={open} onClose={onClose} title="Export chart">
      <div className="stack">
        <div className="grid-2">
          <Segmented label="Chart" full value={o.art} options={[["radar", "Spider"], ["blob", "Blob"]]} onChange={(art) => set({ art })} />
          {o.art === "radar" && <Segmented label="Shape" full value={o.rounded ? "rounded" : "sharp"} options={[["sharp", "Sharp"], ["rounded", "Rounded"]]} onChange={(v) => set({ rounded: v === "rounded" })} />}
          {o.art === "radar" && <Segmented label="Chart lines" full value={o.grid ? "show" : "hide"} options={[["show", "Show"], ["hide", "Hide"]]} onChange={(v) => set({ grid: v === "show" })} />}
          <Toggle label="Coffee details" checked={o.coffee} onChange={(coffee) => set({ coffee })} />
          <Toggle label="Tasting notes" checked={o.notes} onChange={(notes) => set({ notes })} />
          <Segmented label="Background" full value={o.bg} options={[["theme", "Theme"], ["none", "Clear"], ["colour", "Colour"]]} onChange={(bg) => set({ bg })} />
          {o.bg === "colour" && (
            <div className="field"><span className="label">Background colour</span><ColourPicker value={o.bgColour} label="Background colour" onChange={(bgColour) => set({ bgColour })} /></div>
          )}
        </div>
        <SelectField label="Brew details" value={o.brewId} placeholder="None" onChange={(brewId) => set({ brewId })}
          options={brews.map((b) => [str(b.id), `${defs.find((m) => m.id === b.method)?.label ?? str(b.method)} ${stamp(b.brew_date)}`])} />
        {svg ? <img className="export-preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Preview of the exported chart" /> : <p className="meta">Preparing preview...</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {canShare && <Button ghost icon={ShareNetwork} disabled={!svg || working} onClick={() => run(true)}>Share</Button>}
          <Button icon={DownloadSimple} disabled={!svg || working} onClick={() => run(false)}>{working ? "Making image..." : "Download PNG"}</Button>
        </div>
      </div>
      {/* Off-screen chart in the chosen style; its SVG is copied into the image. */}
      <div ref={chartRef} aria-hidden style={{ position: "absolute", left: -10000, top: 0, width: CHART }}>
        {o.art === "blob"
          ? <Fingerprint axes={fl.axes} layers={fl.layers} size={CHART} dense animate={false} />
          : <Radar axes={fl.axes} layers={fl.layers} size={CHART} legend={false} emptyText="" rounded={o.rounded} grid={o.grid} pitch={2.3} animate={false} />}
      </div>
    </Dialog>
  );
}

/** The whole image as SVG: header, chart, notes, brew, footer, in the app's current theme. */
function compose(chart: SVGSVGElement, o: Opts, bean: Rec, fl: Flavour, brew: Rec | undefined, db: ReturnType<typeof useApp>["db"], defs: ReturnType<typeof methodDefs>, fontFaces: string): string {
  const cs = getComputedStyle(document.documentElement);
  const tok = (k: string) => cs.getPropertyValue(k).trim();
  const dark = document.documentElement.dataset.theme === "dark";
  // Text follows the background: light text on a dark colour, dark text on a light one.
  const bg = o.bg === "none" ? null : o.bg === "colour" ? o.bgColour : tok("--bg");
  const onDark = o.bg === "colour" ? luminance(o.bgColour) < 0.35 : dark;
  const strong = o.bg === "colour" ? (onDark ? "#FFFFFF" : "#0A0A0A") : tok("--text-strong");
  const text = o.bg === "colour" ? (onDark ? "#D4D1CA" : "#5C5953") : tok("--text");

  // The chart's own SVG, with the page's CSS variables written out as colours.
  const c = chart.cloneNode(true) as SVGSVGElement;
  c.removeAttribute("style");
  c.querySelectorAll("title").forEach((t) => t.remove());
  for (const el of [c, ...c.querySelectorAll("*")]) {
    for (const a of [...el.attributes]) if (a.value.includes("var(")) el.setAttribute(a.name, a.value.replace(/var\((--[\w-]+)\)/g, (_, k) => tok(k)));
  }

  const parts: string[] = [];
  let y = PAD;
  const line = (t: string, size: number, color: string, weight = 400, spacing = 0) => {
    y += size;
    parts.push(`<text x="${PAD}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}"${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(t)}</text>`);
    y += size * 0.45;
  };

  if (o.coffee) {
    wrap(str(bean.name) || "Coffee", 56).forEach((l) => line(l, 56, strong, 700));
    const sub = [bean.roastery, bean.origin, bean.process, bean.variety].map(str).filter(Boolean).join(" · ");
    if (sub) wrap(sub, 26).forEach((l) => line(l, 26, text));
    const roast = stamp(bean.roast_date);
    if (roast) line(`Roasted ${roast}`, 22, text);
    y += 16;
  }

  const size = o.art === "blob" ? CHART * 0.82 : CHART;
  c.setAttribute("x", String((W - size) / 2));
  c.setAttribute("y", String(y));
  c.setAttribute("width", String(size));
  c.setAttribute("height", String(size));
  parts.push(new XMLSerializer().serializeToString(c));
  y += size + 24;

  if (o.notes && fl.layers.length) {
    // Two columns of swatch + note.
    const colW = (W - PAD * 2) / 2;
    fl.layers.forEach((l, i) => {
      const x = PAD + (i % 2) * colW;
      const ry = y + Math.floor(i / 2) * 44;
      parts.push(`<rect x="${x}" y="${ry}" width="24" height="24" fill="${ink(l.color)}"/>`);
      parts.push(`<text x="${x + 38}" y="${ry + 20}" font-size="24" fill="${strong}">${esc(l.note.slice(0, 26))}</text>`);
    });
    y += Math.ceil(fl.layers.length / 2) * 44 + 16;
  }

  if (brew) {
    const m = defs.find((x) => x.id === brew.method);
    const liquid = m?.liquid === "yield" ? num(brew.yield_g) : num(brew.water_g);
    const grinder = db.gear.find((g) => g.id === brew.grinder_id);
    const t = num(brew.total_s);
    const facts = [
      num(brew.dose_g) != null && liquid != null ? `${num(brew.dose_g)} g in, ${liquid} g ${m?.liquid === "yield" ? "out" : "water"}` : "",
      num(brew.ratio) != null ? `1:${num(brew.ratio)}` : "",
      num(brew.temp_c) != null ? `${num(brew.temp_c)} °C` : "",
      str(brew.grind_setting) ? `Grind ${str(brew.grind_setting)}${grinder ? ` (${[grinder.brand, grinder.name].filter(Boolean).join(" ")})` : ""}` : "",
      t != null ? `Time ${fmtTime(t)}` : "",
      num(brew.presoak_s) != null ? `Pre-soak ${num(brew.presoak_s)} s` : "",
      num(brew.hold_s) != null ? `Hold ${num(brew.hold_s)} s` : "",
      str(brew.paper),
      str(brew.water_type) ? `Water ${str(brew.water_type)}` : "",
      bodyLabel(brew.taste_strength) ? `Body ${bodyLabel(brew.taste_strength)}` : "",
      num(brew.rating) != null ? `${num(brew.rating)}/5` : "",
    ].filter(Boolean).join(" · ");
    parts.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${tok("--border")}" stroke-width="2"/>`);
    y += 16;
    line(`${m?.label ?? str(brew.method)} · ${stamp(brew.brew_date)}`.toUpperCase(), 22, text, 400, 4);
    wrap(facts, 26).forEach((l) => line(l, 26, strong));
    if (str(brew.tasting_notes)) wrap(`“${str(brew.tasting_notes)}”`, 24).forEach((l) => line(l, 24, text));
    y += 8;
  }

  y += 12;
  line("EXTRACTION THEORY", 18, text, 700, 6);
  const H = Math.ceil(y + PAD - 18);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<style>${fontFaces}text{font-family:"Space Mono",monospace}.ink{mix-blend-mode:${dark ? "screen" : "multiply"}}</style>`
    + `${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ""}${parts.join("")}</svg>`;
}
