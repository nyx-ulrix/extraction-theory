// Roaster QR codes: a coffee plus a recommended recipe in one code (Share), what someone sees after
// scanning it (Shared), and the in-app scanner (Scan). The code is a link, so any phone camera works too.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, DownloadSimple, Plus, QrCode, ShareNetwork } from "@phosphor-icons/react";
import { fmtTime, fromSerial, num, parseFlavour, round } from "../calc.ts";
import { str } from "../brew.ts";
import { useApp } from "../ctx.ts";
import { esc, fonts, svgToPng } from "../components/ExportChart.tsx";
import Radar from "../components/Radar.tsx";
import { qrAccent, qrMarks, QR_INK, QR_PAPER } from "../components/qr.ts";
import { ink } from "../palette.ts";
import { methodDefs } from "../schema.ts";
import {
  beanRow, codeFrom, decodeShare, encodeShare, makeShare, recipeFromBrew, recipeFromSaved, sameBean, savedRecipe, shareUrl, type Shared,
} from "../share.ts";
import { newId, saveBean, saveSettings, type Db } from "../store.ts";
import { Button, Fold, IconButton, Msg, SelectField, TextField, Toggle } from "../ui.tsx";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (v: unknown) => {
  const n = num(v);
  if (n == null) return "";
  const d = fromSerial(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const slug = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "coffee";

/** One-line recipe and grind, the same wording on the card and the scanned page. */
function recipeText(db: Db, r: NonNullable<Shared["recipe"]>) {
  const m = methodDefs(db.fields).find((x) => x.id === r.method);
  const f = r.f;
  const dose = num(f.dose_g);
  const poured = r.pours.reduce((a, p) => a + (num(p.water_g) ?? 0), 0) || null;
  const liquid = m?.liquid === "yield" ? num(f.yield_g) : num(f.water_g) ?? poured;
  const ratio = num(f.ratio) ?? (dose && liquid ? round(liquid / dose, 1) : null);
  const head = [
    m?.label ?? r.method,
    dose != null ? `${dose} g in` : "",
    liquid != null ? `${liquid} g ${m?.liquid === "yield" ? "out" : "water"}` : "",
    ratio != null ? `1:${ratio}` : "",
    num(f.temp_c) != null ? `${num(f.temp_c)} °C` : "",
    num(f.total_s) != null ? fmtTime(num(f.total_s)) : "",
  ].filter(Boolean);
  const setting = str(f.grind_setting).trim();
  const grind = [
    setting ? `Grind ${setting}${r.grinder ? ` on ${r.grinder}` : ""}` : r.grinder ? `Grinder ${r.grinder}` : "",
    num(f.grind_um) != null ? `${num(f.grind_um)} µm` : "",
  ].filter(Boolean).join(", ");
  return { head, grind, method: m };
}

/** Space Mono wraps by character count (0.6 em each). */
function lines(text: string, size: number, width: number, max = 3): string[] {
  const per = Math.max(8, Math.floor(width / (size * 0.6)));
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + w).trim().length > per && line) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/.{0,3}$/, "..."); }
  return out;
}

/** The printable card: coffee, QR, recipe, on paper (codes always print dark on light to scan). */
function card(db: Db, s: Shared, url: string, accent: string, fontCss: string): { svg: string; version: number } {
  const W = 1080, P = 72, inner = W - P * 2;
  const stone = "#7A766E", rule = "#D4D1CA";
  let y = P;
  const t: string[] = [];
  const text = (str: string, size: number, o: { bold?: boolean; fill?: string; caps?: boolean; anchor?: "end" } = {}) => {
    t.push(`<text x="${o.anchor ? W - P : P}" y="${y}" font-size="${size}" font-weight="${o.bold ? 700 : 400}" fill="${o.fill ?? QR_INK}"${o.caps ? ` letter-spacing="${size * 0.12}"` : ""}${o.anchor ? ` text-anchor="end"` : ""}>${esc(o.caps ? str.toUpperCase() : str)}</text>`);
  };
  y += 22; text("Scan to brew", 22, { caps: true, fill: stone });
  if (str(s.bean.roastery)) text(str(s.bean.roastery), 22, { caps: true, fill: stone, anchor: "end" });
  y += 30;
  for (const l of lines(str(s.bean.name), 60, inner, 2)) { y += 66; text(l, 60, { bold: true }); }
  const sub = [s.bean.product !== s.bean.name ? s.bean.product : "", s.bean.origin, s.bean.process, s.bean.variety].map(str).filter(Boolean).join(" · ");
  if (sub) for (const l of lines(sub, 26, inner, 2)) { y += 38; text(l, 26, { fill: stone }); }
  y += 32;
  t.push(`<rect x="${P}" y="${y}" width="${inner}" height="2" fill="${rule}"/>`);
  y += 2;
  const q = qrMarks(url, { x: P, y, size: inner, accent });
  t.push(q.svg);
  y += inner;
  t.push(`<rect x="${P}" y="${y}" width="${inner}" height="2" fill="${rule}"/>`);
  y += 24;
  if (s.recipe) {
    const r = recipeText(db, s.recipe);
    y += 22; text("Recommended recipe", 22, { caps: true, fill: stone });
    for (const l of lines(r.head.join(" · "), 30, inner, 2)) { y += 44; text(l, 30, { bold: true }); }
    if (r.grind) for (const l of lines(r.grind, 26, inner, 2)) { y += 38; text(l, 26); }
    y += 24;
  }
  if (str(s.bean.roaster_notes)) {
    y += 22; text("Tasting notes", 22, { caps: true, fill: stone });
    for (const l of lines(str(s.bean.roaster_notes), 26, inner, 2)) { y += 38; text(l, 26); }
    y += 24;
  }
  y += 40;
  text("Extraction Theory", 22, { caps: true, bold: true });
  text(location.host, 22, { fill: stone, anchor: "end" });
  y += P - 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><style>${fontCss}text{font-family:"Space Mono",monospace}</style><rect width="${W}" height="${y}" fill="${QR_PAPER}"/>${t.join("")}</svg>`;
  return { svg, version: q.version };
}

/** Share a coffee as a QR code: for roasters to print on a bag or card, or for anyone to send. */
export function ShareCoffee() {
  const { db, arg, back, notify } = useApp();
  const bean = db.beans.find((b) => b.id === arg);
  const defs = methodDefs(db.fields);
  const fl = parseFlavour(bean?.flavour, db.settings.axes);
  // Recommended recipe: this coffee's dialed-in brews first, then its other brews, then saved recipes.
  const options = useMemo(() => {
    const brews = db.brews.filter((b) => b.bean_id === arg)
      .sort((a, b) => (b.dialed_in === true ? 1 : 0) - (a.dialed_in === true ? 1 : 0) || (num(b.brew_date) ?? 0) - (num(a.brew_date) ?? 0));
    return [
      ...brews.map((b): [string, string] => [`b:${str(b.id)}`,
        `${defs.find((m) => m.id === b.method)?.label ?? str(b.method)}, ${ymd(b.brew_date)}${b.dialed_in === true ? ", dialed in" : ""}`]),
      ...db.settings.recipes.map((r, i): [string, string] => [`r:${i}`, `Saved: ${r.name}`]),
    ];
  }, [db, arg, defs]);
  const [pick, setPick] = useState(options[0]?.[0] ?? "");
  const [roast, setRoast] = useState(false);
  const [flavour, setFlavour] = useState(fl.layers.length > 0);
  const [out, setOut] = useState<{ url: string; svg: string; version: number } | null>(null);
  const [working, setWorking] = useState(false);

  const shared = useMemo(() => {
    if (!bean) return null;
    const name = [bean.roastery, bean.name].map(str).filter(Boolean).join(" ");
    const recipe = pick.startsWith("b:") ? (() => { const b = db.brews.find((x) => x.id === pick.slice(2)); return b ? recipeFromBrew(db, b, name) : null; })()
      : pick.startsWith("r:") ? (() => { const r = db.settings.recipes[Number(pick.slice(2))]; return r ? recipeFromSaved(db, r) : null; })()
      : null;
    return makeShare(bean, recipe, { roast, flavour });
  }, [bean, pick, roast, flavour, db]);
  // The eyes take the coffee's lead note colour, as printed ink.
  const accent = qrAccent(fl.layers[0] ? ink(fl.layers[0].color, true) : undefined);

  useEffect(() => {
    if (!shared) return;
    let live = true;
    (async () => {
      const url = shareUrl(await encodeShare(shared));
      const c = card(db, shared, url, accent, await fonts());
      if (live) setOut({ url, ...c });
    })().catch((e) => notify(e instanceof RangeError ? "Too much to fit in one code. Leave out the flavour chart or pick a simpler recipe." : e instanceof Error ? e.message : String(e), "error"));
    return () => { live = false; };
  }, [shared, accent, db, notify]);

  if (!bean) return <div className="page"><Msg kind="error">That coffee is not in your library.</Msg></div>;
  const file = `${slug(str(bean.name))}-qr.png`;
  const deliver = async (share: boolean) => {
    if (!out) return;
    setWorking(true);
    try {
      const blob = await svgToPng(out.svg);
      const f = new File([blob], file, { type: "image/png" });
      if (share && navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], title: str(bean.name), text: out.url });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setWorking(false);
    }
  };
  const copy = async () => {
    if (!out) return;
    try { await navigator.clipboard.writeText(out.url); notify("Link copied", "success"); } catch { notify("Could not copy. Long-press the code instead.", "error"); }
  };

  return (
    <div className="page stack-lg">
      <div className="page-head">
        <IconButton icon={ArrowLeft} label="Back" onClick={back} />
        <h1 style={{ flex: 1, minWidth: 0 }}>Share coffee</h1>
      </div>
      <p className="meta">
        One code with this coffee and a recommended recipe. Print it on the bag or a card: anyone who scans it gets both,
        straight into their own library. Nothing is uploaded; it all lives in the code.
      </p>
      <div className="share">
        <div className="stack">
          <SelectField label="Recommended recipe" value={pick} placeholder="None, coffee only" options={options} onChange={setPick}
            hint={options.length ? undefined : "Log a brew of this coffee or save a recipe to include one."} />
          <Fold title="What's included" meta={[flavour && "Flavour chart", roast && "Roast date"].filter(Boolean).join(", ") || "Coffee details"}>
            <div className="grid-2">
              <Toggle label="Flavour chart" checked={flavour} onChange={setFlavour} />
              <Toggle label="Roast date" checked={roast} onChange={setRoast} />
            </div>
            <p className="hint">Leave the roast date off for a code printed on every batch.</p>
          </Fold>
          {/* Phone cameras want modules of about half a millimetre. */}
          {out && <p className="hint">Print it at least {Math.max(2, Math.ceil(((17 + 4 * out.version + 8) * 0.5) / 10))} cm wide. Fewer extras make a smaller code.</p>}
          <div className="row share-actions">
            <IconButton icon={Copy} label="Copy link" disabled={!out} onClick={copy} />
            {typeof navigator !== "undefined" && !!navigator.canShare && (
              <Button ghost icon={ShareNetwork} disabled={!out || working} onClick={() => deliver(true)}>Share</Button>
            )}
            <Button icon={DownloadSimple} disabled={!out || working} onClick={() => deliver(false)}>{working ? "Making image..." : "Download PNG"}</Button>
          </div>
        </div>
        <figure className="share-card">
          {out ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}`} alt={`QR code for ${str(bean.name)}`} />
            : <div className="skel" style={{ aspectRatio: "3 / 4" }} />}
        </figure>
      </div>
      <style href="et-share" precedence="default">{CSS}</style>
    </div>
  );
}

/** A scanned code: the coffee and recipe, then add them to the library (and brew). */
export function SharedCoffee() {
  const { db, arg, back, go, update, busy } = useApp();
  const [s, setS] = useState<Shared | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let live = true;
    decodeShare(arg ?? "", db).then((x) => live && setS(x), () => live && setBad(true));
    return () => { live = false; };
    // Decoded once; later saves change db but not the code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arg]);

  if (bad) {
    return (
      <div className="page stack-lg">
        <div className="page-head">
          <IconButton icon={ArrowLeft} label="Back" onClick={back} />
          <h1 style={{ flex: 1, minWidth: 0 }}>Shared coffee</h1>
        </div>
        <Msg kind="error">This code isn't an Extraction Theory coffee, or it was cut short. Try scanning it again.</Msg>
        <div><Button icon={QrCode} onClick={() => go("scan")}>Scan again</Button></div>
      </div>
    );
  }
  if (!s) {
    return (
      <div className="page stack-lg" aria-busy="true" aria-label="Reading the code">
        <div className="skel" style={{ height: 40, width: 220 }} />
        <div className="skel" style={{ height: 280 }} />
        <div className="skel" style={{ height: 44, width: "70%" }} />
      </div>
    );
  }

  const b = s.bean;
  const have = sameBean(db, b);
  const fl = parseFlavour(b.flavour, db.settings.axes);
  const r = s.recipe ? recipeText(db, s.recipe) : null;
  // The roastery heads the page and the chart's legend lists the notes, so neither repeats here.
  const notesInChart = fl.layers.length > 0 && str(b.roaster_notes).toLowerCase() === fl.layers.map((l) => l.note).join(", ").toLowerCase();
  const facts: [string, string][] = ([
    ["Roaster's name", str(b.product)], ["Origin", str(b.origin)], ["Farm", str(b.farm)],
    ["Variety", str(b.variety)], ["Process", str(b.process)], ["Roast level", str(b.roast_level)], ["Roasted", ymd(b.roast_date)],
    ["Altitude", [b.altitude_low_m, b.altitude_high_m].map(str).filter(Boolean).join(" to ") ? `${[b.altitude_low_m, b.altitude_high_m].map(str).filter(Boolean).join(" to ")} m` : ""],
    ["Roaster's notes", notesInChart ? "" : str(b.roaster_notes)],
  ] as [string, string][]).filter(([, v]) => v);
  // Method extras by their label in this account's brew form.
  const extras = s.recipe
    ? Object.entries(s.recipe.f).map(([k, v]) => [db.fields.find((f) => f.method === s.recipe!.method && f.key === k)?.label, v] as const)
      .filter((x): x is readonly [string, string | number | boolean] => !!x[0] && x[1] != null && x[1] !== "")
    : [];
  const recipeName = [b.roastery, b.name].map(str).filter(Boolean).join(" ");

  const add = async (brew: boolean) => {
    const id = have ? str(have.id) : newId();
    const ok = await update(async (d) => {
      let x = d;
      if (!have) x = await saveBean(x, beanRow(b, d.settings.axes, id));
      if (s.recipe) {
        // Same name as one of the user's own recipes: keep theirs and tag this one.
        const mine = x.settings.recipes.some((y) => y.name === recipeName && y.bean !== id);
        const saved = savedRecipe(x, s.recipe, id, mine ? `${recipeName.slice(0, 31)} (shared)` : recipeName);
        x = await saveSettings(x, { ...x.settings, recipes: [...x.settings.recipes.filter((y) => y.bean !== id && y.name !== saved.name), saved] });
      }
      return x;
    }, have ? (s.recipe ? "Recipe added" : "Already in your library") : "Coffee added");
    if (ok) go(brew ? "brew" : "beans", brew ? `shared:${id}` : id);
  };

  return (
    <div className="page stack-lg">
      <div className="page-head">
        <IconButton icon={ArrowLeft} label="Back" onClick={back} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {str(b.roastery) && <span className="label">{str(b.roastery)}</span>}
          <h1>{str(b.name)}</h1>
        </div>
      </div>
      {fl.layers.length > 0 && <Radar axes={fl.axes} layers={fl.layers} size={360} title={`${str(b.name)} roaster notes`} rounded={db.settings.page_shape === "rounded"} grid={db.settings.page_grid} pitch={2.3} />}
      {facts.length > 0 && (
        <Fold title="Coffee details" meta={[b.origin, b.process].map(str).filter(Boolean).join(" · ") || `${facts.length} set`}>
          <dl className="kv">
            {facts.map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Fold>
      )}
      {r && s.recipe && (
        <section className="section">
          <header><h2>Recommended recipe</h2></header>
          <p className="strong num">{r.head.join(" · ")}</p>
          {r.grind && <p className="num">{r.grind}</p>}
          {s.recipe.pours.length > 0 && (
            <Fold title="Pours" meta={`${s.recipe.pours.length} ${s.recipe.pours.length === 1 ? "pour" : "pours"}`}>
              <dl className="brew-kv num">
                {s.recipe.pours.map((p, i) => (
                  <div key={i}>
                    <dt>{i === 0 ? "Bloom" : `Pour ${i + 1}`}{p.start_s != null ? ` at ${fmtTime(p.start_s)}` : ""}</dt>
                    <dd>{[p.water_g != null ? `${p.water_g} g` : "", p.temp_c != null ? `${p.temp_c} °C` : "", p.agitation && p.agitation !== "None" ? p.agitation : ""].filter(Boolean).join(", ") || "-"}</dd>
                  </div>
                ))}
              </dl>
            </Fold>
          )}
          {s.recipe.presses.some((p) => p.start_s != null || p.duration_s != null) && (
            <Fold title="Presses" meta={`${s.recipe.presses.length}`}>
              <dl className="brew-kv num">
                {s.recipe.presses.map((p, i) => (
                  <div key={i}><dt>Press {i + 1}{p.start_s != null ? ` at ${fmtTime(p.start_s)}` : ""}</dt><dd>{p.duration_s != null ? `${fmtTime(p.duration_s)} long` : "-"}</dd></div>
                ))}
              </dl>
            </Fold>
          )}
          {(extras.length > 0 || s.recipe.dripper || str(s.recipe.f.paper) || str(s.recipe.f.water_type)) && (
            <Fold title="More details" meta={`${extras.length + [s.recipe.dripper, s.recipe.f.paper, s.recipe.f.water_type].filter(Boolean).length} set`}>
              <dl className="brew-kv">
                {s.recipe.dripper && <div><dt>Dripper</dt><dd>{s.recipe.dripper}</dd></div>}
                {str(s.recipe.f.paper) && <div><dt>Paper</dt><dd>{str(s.recipe.f.paper)}</dd></div>}
                {str(s.recipe.f.water_type) && <div><dt>Water</dt><dd>{str(s.recipe.f.water_type)}</dd></div>}
                {extras.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd></div>)}
              </dl>
            </Fold>
          )}
        </section>
      )}
      <div className="savebar">
        <span>{have ? "Already in your library." : "Saved to your own Google Sheet."}</span>
        <div className="row">
          {!(have && !s.recipe) && <Button ghost disabled={busy} onClick={() => add(false)}>{have ? "Add recipe" : "Add to library"}</Button>}
          <Button icon={Plus} disabled={busy} onClick={() => add(true)}>{have && !s.recipe ? "Brew it" : "Add and brew"}</Button>
        </div>
      </div>
      <style href="et-share" precedence="default">{CSS}</style>
    </div>
  );
}

// BarcodeDetector is in Chrome on Android and desktop, not yet in Safari or Firefox.
interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

/** In-app scanner. Without camera scanning, the phone's own camera app opens the link just the same. */
export function Scan() {
  const { back, go } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "live" | "denied" | "unsupported">(() => (window.BarcodeDetector ? "starting" : "unsupported"));
  const [hint, setHint] = useState("");
  const [paste, setPaste] = useState("");

  useEffect(() => {
    if (!window.BarcodeDetector) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let live = true;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const tick = async () => {
      const v = video.current;
      if (!live || !v) return;
      try {
        if (v.readyState >= 2) {
          const found = await detector.detect(v);
          if (!live) return;
          for (const c of found) {
            const code = codeFrom(c.rawValue);
            if (code) { live = false; go("shared", code); return; }
            setHint("That code isn't an Extraction Theory coffee.");
          }
        }
      } catch { /* a frame that couldn't be read */ }
      timer = window.setTimeout(tick, 200);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(async (s) => {
      stream = s;
      if (!live || !video.current) return s.getTracks().forEach((t) => t.stop());
      video.current.srcObject = s;
      await video.current.play().catch(() => {});
      setState("live");
      tick();
    }, () => live && setState("denied"));
    return () => { live = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [go]);

  const open = () => {
    const code = codeFrom(paste);
    if (code) go("shared", code);
    else setHint("That link isn't an Extraction Theory coffee.");
  };
  const pasteForm = (
    <div className="stack">
      <TextField label="Link" value={paste} placeholder="https://..." onChange={setPaste} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button disabled={!paste.trim()} onClick={open}>Open</Button>
      </div>
    </div>
  );

  return (
    <div className="page stack-lg">
      <div className="page-head">
        <IconButton icon={ArrowLeft} label="Back" onClick={back} />
        <h1 style={{ flex: 1, minWidth: 0 }}>Scan a coffee</h1>
      </div>
      {state === "unsupported" ? (
        <Msg kind="info">This browser can't scan inside the app. Point your phone's camera at the code instead: it opens the coffee here.</Msg>
      ) : (
        <div className="scan" data-state={state}>
          <video ref={video} muted playsInline aria-label="Camera view" />
          <span className="scan-frame" aria-hidden />
          {state !== "live" && (
            <p className="scan-status">{state === "denied" ? "Camera access is off. Allow it in your browser, or paste the link below." : "Starting camera..."}</p>
          )}
        </div>
      )}
      <p className="meta" role="status">{hint || (state === "unsupported" ? "" : "Point at a roaster's Extraction Theory code. It opens as soon as it's read.")}</p>
      {/* Without in-app scanning, pasting a link is the main way in, so it isn't folded away. */}
      {state === "unsupported" ? pasteForm : <Fold title="Paste a link instead">{pasteForm}</Fold>}
      <style href="et-share" precedence="default">{CSS}</style>
    </div>
  );
}

const CSS = `
.share { display: grid; gap: 24px; align-items: start; }
.share-actions { justify-content: flex-end; }
.share-card { margin: 0; border: 1px solid var(--border); background: #fff; }
.share-card img { display: block; width: 100%; height: auto; }
@media (min-width: 900px) { .share { grid-template-columns: minmax(0, 1fr) 420px; gap: 48px; } }

/* A camera viewfinder stays dark in both themes, with white marks. */
.scan { position: relative; aspect-ratio: 1; width: 100%; max-width: 480px; margin: 0 auto; background: #0A0A0A; overflow: hidden; }
.scan video { width: 100%; height: 100%; object-fit: cover; display: block; }
.scan-frame { position: absolute; inset: 15%; pointer-events: none;
  background:
    linear-gradient(#fff, #fff) top left / 32px 3px, linear-gradient(#fff, #fff) top left / 3px 32px,
    linear-gradient(#fff, #fff) top right / 32px 3px, linear-gradient(#fff, #fff) top right / 3px 32px,
    linear-gradient(#fff, #fff) bottom left / 32px 3px, linear-gradient(#fff, #fff) bottom left / 3px 32px,
    linear-gradient(#fff, #fff) bottom right / 32px 3px, linear-gradient(#fff, #fff) bottom right / 3px 32px;
  background-repeat: no-repeat; }
.scan-status { position: absolute; inset: auto 16px 16px; margin: 0; color: #fff; font-size: 12px; text-align: center; }
`;
