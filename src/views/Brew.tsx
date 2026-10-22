import { useEffect, useId, useState } from "react";
import {
  ArrowsDownUp, Coffee, Drop, Eraser, Flame, FloppyDisk, Flask, Funnel, Plant, Snowflake, Star, X, type Icon,
} from "@phosphor-icons/react";
import { fromSerial, num, parseFlavour, toSerial } from "../calc.ts";
import { DateField } from "../components/DateField.tsx";
import { useApp } from "../ctx.ts";
import { isFinished } from "../group.ts";
import {
  beanRecipe, buildRecord, DRAFT_KEY, emptyDraft, loadFrom, pourTotal, prefill, restoreDraft, str, withF, type Draft, type Up,
} from "../brew.ts";
import { MILK_DEFAULT_G, MILK_DRINKS, layoutFor, methodDefs, type MethodField, type Rec } from "../schema.ts";
import { addBrew, newId, saveBean, type Db } from "../store.ts";
import { Button, Dialog, IconButton, Msg, NumField, Section, Segmented, SelectField, TextField, Toggle } from "../ui.tsx";
import Timeline from "../components/Timeline.tsx";
import Chill from "../components/brew/Chill.tsx";
import Dripper from "../components/brew/Dripper.tsx";
import Grind from "../components/brew/Grind.tsx";
import MethodFields from "../components/brew/MethodFields.tsx";
import Pours from "../components/brew/Pours.tsx";
import Presses from "../components/brew/Presses.tsx";
import Readout from "../components/brew/Readout.tsx";
import Recipe from "../components/brew/Recipe.tsx";

const ICONS: Record<string, Icon> = {
  espresso: Coffee, filter: Funnel, ice: Snowflake, coldbrew: Drop, moka: Flame, aeropress: ArrowsDownUp,
};

const ymd = (serial: unknown) => {
  const s = num(serial);
  if (s == null) return "-";
  const d = fromSerial(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Brew again: the earlier brew's recipe, remembering its date for the notice. */
const again = (db: Db, b: Rec, fallback: string): Draft => ({ ...loadFrom(db, b, emptyDraft(str(b.method) || fallback)), from: ymd(b.brew_date) });

export default function Brew() {
  const { db, update, busy, go, arg, notify } = useApp();
  const methods = methodDefs(db.fields);
  const [init] = useState(() => {
    // arg: a brew id (Brew again) or "bean:<id>" (new brew from a coffee's page).
    const beanArg = arg?.startsWith("bean:") ? arg.slice(5) : undefined;
    const b = arg && !beanArg ? db.brews.find((x) => x.id === arg) : undefined;
    const saved = restoreDraft();
    // A touched draft is not replaced without asking.
    if (b && saved?.touched) return { d: saved, pending: b };
    if (beanArg) {
      const last = db.brews.filter((x) => x.bean_id === beanArg).sort((x, y) => (num(y.brew_date) ?? 0) - (num(x.brew_date) ?? 0))[0];
      if (saved?.touched && last) return { d: saved, pending: last };
      return { d: beanRecipe(db, saved?.touched ? saved : emptyDraft(methods[0].id), beanArg), pending: undefined };
    }
    let d = b ? again(db, b, methods[0].id) : saved ?? emptyDraft(methods[0].id);
    const open = db.beans.filter((x) => !isFinished(x.finished));
    if (!d.f.bean_id && open.length) {
      const newest = open.reduce((a, x) => ((num(x.created) ?? 0) > (num(a.created) ?? 0) ? x : a));
      d = beanRecipe(db, d, str(newest.id));
    }
    return { d, pending: undefined };
  });
  const [d, setD] = useState<Draft>(init.d);
  const [pending, setPending] = useState<Rec | undefined>(init.pending);
  const [hideNote, setHideNote] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const dateId = useId();

  useEffect(() => {
    if (pending) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ }
  }, [d, pending]);

  const m = methods.find((x) => x.id === d.method) ?? methods[0];
  const up: Up = (fn) => setD((o) => ({ ...fn(o), touched: true }));
  const bean = db.beans.find((b) => b.id === d.f.bean_id);
  const template = parseFlavour(bean?.flavour, db.settings.axes).axes;
  const { rec, phases } = buildRecord(d, db, m, template);
  const dripper = db.gear.find((g) => g.id === d.f.dripper_id);
  const missBean = !d.f.bean_id;
  const missDose = !num(d.f.dose_g);
  const missChill = m.chill === "required" && !str(d.f.chill_method).trim();
  const errBean = tried && missBean ? "Pick a bean" : undefined;
  const errDose = tried && missDose ? "Enter the dose" : undefined;
  const errChill = tried && missChill ? "Choose a chill method" : undefined;
  const errors = [errBean, errDose, errChill].filter(Boolean).join(". ");

  if (!db.beans.length) {
    return (
      <div className="page stack">
        <h1>Brew</h1>
        <p>Add the bag you are brewing first.</p>
        <div><Button icon={Plant} onClick={() => go("beans", "new")}>Add a bean</Button></div>
      </div>
    );
  }

  // Bean and method changes do not count as edits, so an untouched form keeps prefilling.
  const pickMethod = (id: string) => { setHideNote(false); setD((o) => prefill(db, { ...o, method: id })); };
  const pickBean = (id: string) => { setHideNote(false); setD((o) => (id ? beanRecipe(db, o, id) : withF({ bean_id: null })(o))); };
  // The roast date lives on the coffee, so setting it here sets it everywhere.
  const setRoast = (v: number | null) => { if (bean) update((x) => saveBean(x, { id: bean.id, roast_date: v }), "Roast date saved"); };
  const clearLoaded = () => setD((o) => ({ ...emptyDraft(o.method), date: o.date, f: { bean_id: o.f.bean_id }, touched: true }));

  async function save() {
    setTried(true);
    const missing = [missBean && "Pick a bean", missDose && "Enter the dose", missChill && "Choose a chill method"].filter(Boolean);
    if (missing.length) {
      notify(`${missing.join(". ")}.`, "error");
      requestAnimationFrame(() => document.querySelector(".brew-form [role=alert]")?.scrollIntoView({ block: "center" }));
      return;
    }
    const full: Rec = { ...rec, id: newId(), created: toSerial(new Date()) };
    setSaving(true);
    const ok = await update((db) => addBrew(db, full, phases), "Brew logged");
    setSaving(false);
    if (!ok) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
    setTried(false);
    // Keep the recipe for the next shot; the verdict starts fresh.
    setD((o) => ({
      ...o,
      date: emptyDraft(o.method).date,
      dateSet: false,
      f: { ...o.f, tasting_notes: "", rating: null, taste_balance: null, taste_strength: null, changed: "", notes: "", dialed_in: false },
      flavour: null,
      touched: false,
      prefilled: false,
      from: undefined,
    }));
  }

  // Consecutive Methods-tab fields share one section.
  const own = db.fields.filter((f) => f.method === m.id);
  const blocks: (string | MethodField[])[] = [];
  for (const k of layoutFor(m, db.fields, db.settings)) {
    const fld = own.find((f) => f.key === k);
    const last = blocks[blocks.length - 1];
    if (!fld) blocks.push(k);
    else if (Array.isArray(last)) last.push(fld);
    else blocks.push([fld]);
  }

  function section(b: string | MethodField[], i: number) {
    if (Array.isArray(b)) return <MethodFields key={`mf${i}`} title={`${m.label} details`} fields={b} d={d} up={up} />;
    switch (b) {
      case "bean": return (
        <Section key={b} title="Bean and date">
          <SelectField label="Bean" value={str(d.f.bean_id)} onChange={pickBean}
            options={db.beans
              .filter((x) => !isFinished(x.finished) || x.id === d.f.bean_id) // finished bags drop out
              .map((x) => [str(x.id), [x.name, x.roastery].map(str).filter(Boolean).join(" - ")])}
            hint="Finished bags are hidden. Mark a bag as finished in History or Beans." />
          {errBean && <p className="brew-err" role="alert">{errBean}</p>}
          <div className="grid-3">
            <div className="field">
              <label className="label" htmlFor={dateId}>Brew date</label>
              <input id={dateId} className="input" type="datetime-local" value={d.date}
                onChange={(e) => setD((o) => ({ ...o, date: e.target.value || emptyDraft(o.method).date, dateSet: !!e.target.value }))} />
            </div>
            <DateField label="Roast date" value={num(bean?.roast_date)} onChange={setRoast} disabled={!bean || busy} />
            <Readout label="Days off roast">{num(rec.days_off_roast) ?? "-"}</Readout>
          </div>
        </Section>
      );
      case "grind": return <Grind key={b} d={d} up={up} />;
      case "recipe": return <Recipe key={b} d={d} up={up} m={m} err={errDose} />;
      case "water_type": return (
        <Section key={b} title="Water used">
          {/* Waters you've used before, newest first; "Other" adds a new one, which then joins the list. */}
          <SelectField label="Water used" value={str(d.f.water_type)} other placeholder="None" onChange={(v) => up(withF({ water_type: v }))}
            options={[...new Set([...db.brews].reverse().map((x) => str(x.water_type).trim()).filter(Boolean))]} />
        </Section>
      );
      case "milk": {
        // How the cup was served: straight, black (hot or iced, with water) or as a milk drink.
        const serve = str(d.f.serve) || (str(d.f.milk_drink) ? "milk" : "");
        return (
          <Section key={b} title="Serve">
            <Segmented label="Served as" value={serve || "none"} full
              options={[["none", "Not set"], ["espresso", "Espresso"], ["black", "Black"], ["milk", "Milk drink"]]}
              onChange={(v) => up(withF(v === "milk"
                ? { serve: v, milk_drink: str(d.f.milk_drink) || MILK_DRINKS[0], milk_g: num(d.f.milk_g) ?? MILK_DEFAULT_G[MILK_DRINKS[0]] ?? null }
                : { serve: v === "none" ? "" : v, milk_drink: "", milk_g: null }))} />
            {serve === "black" && (
              <div className="grid-2">
                <Segmented label="Temperature" value={d.f.serve_iced ? "iced" : "hot"} options={[["hot", "Hot"], ["iced", "Iced"]]}
                  onChange={(v) => up(withF({ serve_iced: v === "iced" }))} />
                <NumField label="Water" unit="g" min={0} value={num(d.f.serve_water_g)} onChange={(v) => up(withF({ serve_water_g: v }))} />
              </div>
            )}
            {serve === "milk" && (
              <div className="grid-2">
                <SelectField label="Drink" value={str(d.f.milk_drink)} options={MILK_DRINKS} other
                  onChange={(v) => {
                    const drink = v || MILK_DRINKS[0];
                    up(withF({ milk_drink: drink, milk_g: num(d.f.milk_g) ?? MILK_DEFAULT_G[drink] ?? null }));
                  }} />
                <NumField label="Milk" unit="g" min={0} value={num(d.f.milk_g)} onChange={(v) => up(withF({ milk_g: v }))} />
              </div>
            )}
          </Section>
        );
      }
      case "dripper": return <Dripper key={b} d={d} up={up} />;
      case "pours": return <Pours key={b} d={d} up={up} total={pourTotal(d, m)} hybrid={dripper?.style === "hybrid"} />;
      case "presses": return <Presses key={b} d={d} up={up} />;
      case "chill": return <Chill key={b} d={d} up={up} m={m} err={errChill} />;
      // One chart per coffee (on its page); a brew keeps its tasting notes as text.
      case "taste": return (
        <Section key={b} title="Tasting notes">
          <TextField label="Tasting notes" multiline value={str(d.f.tasting_notes)} onChange={(v) => up(withF({ tasting_notes: v }))}
            hint="What you tasted in this cup. The coffee's flavour chart is on its page." />
        </Section>
      );
      case "rating": return (
        <Section key={b} title="Rating and taste direction">
          <Segmented label="Rating" value={str(d.f.rating)} onChange={(v) => up(withF({ rating: Number(v) }))}
            options={["1", "2", "3", "4", "5"].map((n): [string, string, Icon] => [n, n, Star])} />
          <div className="stack brew-pair">
            <Segmented label="Taste balance" value={str(d.f.taste_balance)} onChange={(v) => up(withF({ taste_balance: v }))} full
              options={[["sour", "Sour"], ["balanced", "Balanced"], ["bitter", "Bitter"]]} />
            <Segmented label="Strength" value={str(d.f.taste_strength)} onChange={(v) => up(withF({ taste_strength: v }))} full
              options={[["weak", "Weak"], ["balanced", "Balanced"], ["strong", "Strong"]]} />
          </div>
        </Section>
      );
      case "notes": return (
        <Section key={b} title="What changed and notes">
          <TextField label="What changed" value={str(d.f.changed)} onChange={(v) => up(withF({ changed: v }))} />
          <TextField label="Notes" multiline value={str(d.f.notes)} onChange={(v) => up(withF({ notes: v }))} />
          <Toggle label="Dialed in" checked={!!d.f.dialed_in} onChange={(v) => up(withF({ dialed_in: v }))} />
        </Section>
      );
    }
    return null;
  }

  const ratio = num(rec.ratio), fin = num(rec.final_ratio), dose = num(rec.dose_g);
  const liquid = num(m.liquid === "yield" ? rec.yield_g : rec.water_g);
  return (
    <div className="brew">
      <style href="et-brew" precedence="default">{CSS}</style>
      <div className="brew-form">
        <div className="stack">
          <h1>Brew</h1>
          <div className="brew-methods">
            <Segmented label="Method" value={m.id} onChange={pickMethod}
              options={methods.map((x): [string, string, Icon] => [x.id, x.label, ICONS[x.id] ?? Flask])} />
          </div>
          {/* Only "Brew again" says where the recipe came from; the usual last-brew prefill is silent. */}
          {d.prefilled && d.from && !hideNote && (
            <Msg>
              <span className="spacer">{`Loaded the brew from ${d.from}.`}</span>
              <IconButton icon={Eraser} label="Start blank" variant="bare" onClick={clearLoaded} />
              <IconButton icon={X} label="Dismiss" variant="bare" onClick={() => setHideNote(true)} />
            </Msg>
          )}
        </div>
        {blocks.map(section)}
      </div>
      <aside className="brew-side" aria-label="Brew summary">
        <div className="brew-bar">
          <div className="brew-sum num">
            <strong>{ratio != null ? `1:${ratio}` : "1:-"}</strong>
            <span>
              {dose ?? "-"} g in, {liquid ?? "-"} g {m.liquid === "yield" ? "out" : "water"}
              {fin != null ? `, final 1:${fin}` : ""}
            </span>
          </div>
          {errors && <p className="brew-err brew-bar-err">{errors}.</p>}
          <Button icon={FloppyDisk} onClick={save} disabled={busy || saving}>{saving ? "Logging..." : "Log brew"}</Button>
        </div>
        <div className="brew-preview">
          <Timeline items={[{ label: "This brew", method: m, brew: rec, phases }]} />
        </div>
      </aside>
      <Dialog open={!!pending} onClose={() => setPending(undefined)} title="Replace your unsaved draft?">
        <p>Brew again loads the brew from {ymd(pending?.brew_date)} over the edits you have not logged.</p>
        <div className="row">
          <span className="spacer" />
          <Button ghost onClick={() => setPending(undefined)}>Keep draft</Button>
          <Button onClick={() => { if (pending) setD(again(db, pending, methods[0].id)); setPending(undefined); }}>Replace</Button>
        </div>
      </Dialog>
    </div>
  );
}

// Phone and tablet: one column, the summary bar sticks to the bottom (above the phone tab bar).
// Laptop: form left, sticky preview right.
const CSS = `
.brew { display: grid; gap: 32px; }
.brew-form { display: grid; gap: 32px; min-width: 0; }
.brew-err { margin: 0; font-size: 12px; color: var(--error); }
.readout { min-height: 44px; display: flex; align-items: center; }
.phase { border: 1px solid var(--border-soft); padding: 12px; display: grid; gap: 12px; }
.phase > header { display: flex; align-items: center; gap: 4px; }
.brew-methods .seg {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; width: 100%;
  overflow: visible; background: var(--border);
}
.brew-methods .seg button {
  flex-direction: column; justify-content: center; gap: 4px; min-height: 60px; padding: 8px 4px;
  border-right: 0; background: var(--bg); white-space: normal; text-align: center; letter-spacing: 0.1em;
}
.brew-methods .seg button[aria-pressed="true"] { background: var(--text-strong); }
@media (min-width: 1024px) { .brew-methods .seg { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
@media (min-width: 768px) { .brew-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.brew-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 12px; align-items: start; }
.brew-split > .icon-btn { margin-top: 23px; }
.brew-kv { margin: 0; display: grid; font-size: 13px; }
.brew-kv > div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border-soft); }
.brew-kv dt { color: var(--text); }
.brew-kv dd { margin: 0; color: var(--text-strong); }
.brew-side {
  position: sticky; bottom: calc(var(--nav-h) + env(safe-area-inset-bottom)); z-index: 5;
  background: var(--bg); border-top: 1px solid var(--border); padding: 12px 0;
}
@media (min-width: 768px) { .brew-side { bottom: env(safe-area-inset-bottom); } }
.brew-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.brew-bar-err { flex: 1; min-width: 0; text-align: right; }
.brew-sum { display: grid; gap: 2px; min-width: 0; font-size: 12px; }
.brew-sum strong { font-size: 18px; color: var(--text-strong); }
.brew-preview { display: none; }
@media (min-width: 1024px) {
  .brew { grid-template-columns: minmax(0, 1fr) 420px; gap: 48px; align-items: start; }
  .brew-side {
    top: calc(var(--nav-h) + 24px); bottom: auto; border-top: 0; padding: 0;
    display: grid; gap: 24px; max-height: calc(100dvh - var(--nav-h) - 48px); overflow-y: auto;
  }
  .brew-bar { flex-direction: column; align-items: stretch; border-bottom: 1px solid var(--border-soft); padding-bottom: 24px; }
  .brew-bar-err { text-align: left; }
  .brew-preview { display: grid; gap: 24px; }
}
`;
