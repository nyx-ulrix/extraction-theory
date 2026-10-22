import { useEffect, useId, useState } from "react";
import {
  ArrowsDownUp, BookmarkSimple, Coffee, Drop, Eraser, Flame, FloppyDisk, Flask, Funnel, Plant, Snowflake, Star, X, type Icon,
} from "@phosphor-icons/react";
import { fromSerial, num, parseFlavour, toSerial } from "../calc.ts";
import { DateField } from "../components/DateField.tsx";
import { useApp } from "../ctx.ts";
import { isFinished } from "../group.ts";
import {
  applyRecipe, beanRecipe, buildRecord, DRAFT_KEY, editDraft, espressoStyle, isIced, pastValues, serveOf, toRecipe, emptyDraft, loadFrom, pourTotal, prefill, restoreDraft, str, withF, type Draft, type Up,
} from "../brew.ts";
import { BODY_LEVELS, MILK_DEFAULT_G, MILK_DRINKS, bodyLevel, frozenOn, layoutFor, methodDefs, type MethodField, type Rec } from "../schema.ts";
import { addBrew, newId, saveBean, saveBrew, saveSettings, type Db } from "../store.ts";
import { Button, Dialog, FoldCtx, IconButton, Msg, NumField, Section, Segmented, SelectField, TextField, Toggle } from "../ui.tsx";
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

const VERDICT = "Rating and what changed";

/** What would replace an unlogged draft: an earlier brew (Brew again) or a coffee's last recipe. */
type Pending = { brew?: Rec; beanId?: string };

/** Brew again: the earlier brew's recipe, remembering its date for the notice. */
const again = (db: Db, b: Rec, fallback: string): Draft => ({ ...loadFrom(db, b, emptyDraft(str(b.method) || fallback)), from: ymd(b.brew_date) });

export default function Brew() {
  const { db, update, busy, go, arg, notify } = useApp();
  const methods = methodDefs(db.fields);
  const [editing] = useState(() => (arg?.startsWith("edit:") ? db.brews.find((x) => x.id === arg.slice(5)) : undefined));
  const [init] = useState(() => {
    // arg: a brew id (Brew again), "bean:<id>" (new brew from a coffee's page) or "edit:<id>" (change a logged brew).
    if (editing) return { d: editDraft(db, editing, methods[0].id), pending: undefined as Pending | undefined };
    const beanArg = arg?.startsWith("bean:") ? arg.slice(5) : undefined;
    const b = arg && !beanArg ? db.brews.find((x) => x.id === arg) : undefined;
    const saved = restoreDraft();
    // A touched draft is not replaced without asking.
    if (b && saved?.touched) return { d: saved, pending: { brew: b } as Pending };
    if (beanArg) {
      if (saved?.touched) return { d: saved, pending: { beanId: beanArg } as Pending };
      return { d: beanRecipe(db, emptyDraft(methods[0].id), beanArg), pending: undefined };
    }
    let d = b ? again(db, b, methods[0].id) : saved ?? emptyDraft(methods[0].id);
    const open = db.beans.filter((x) => !isFinished(x.finished));
    if (!d.f.bean_id && open.length) {
      const newest = open.reduce((a, x) => ((num(x.created) ?? 0) > (num(a.created) ?? 0) ? x : a));
      d = beanRecipe(db, d, str(newest.id));
    }
    return { d, pending: undefined as Pending | undefined };
  });
  const [d, setD] = useState<Draft>(init.d);
  const [pending, setPending] = useState<Pending | undefined>(init.pending);
  const [hideNote, setHideNote] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const dateId = useId();

  useEffect(() => {
    // Editing a logged brew never touches the new-brew draft kept on this device.
    if (pending || editing) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ }
  }, [d, pending]);

  const m = methods.find((x) => x.id === d.method) ?? methods[0];
  const up: Up = (fn) => setD((o) => ({ ...fn(o), touched: true }));
  const bean = db.beans.find((b) => b.id === d.f.bean_id);
  const template = parseFlavour(bean?.flavour, db.settings.axes).axes;
  const { rec, phases } = buildRecord(d, db, m, template);
  const dripper = db.gear.find((g) => g.id === d.f.dripper_id);
  const iced = isIced(d.f, m);
  const serve = serveOf(d.f);
  // Every section is a fold, closed by default except the verdict; a closed one still shows its key values.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [naming, setNaming] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const missBean = !d.f.bean_id;
  const missDose = !num(d.f.dose_g);
  const missChill = m.chill === "required" && !str(d.f.chill_method).trim();
  // Pretentious mode will not log a brew without the grind in microns and the water's makeup.
  const mode = db.settings.brew_mode;
  const missMicrons = mode === "pretentious" && num(d.f.grind_um) == null;
  const missWater = mode === "pretentious" && (!str(d.f.water_type).trim() || num(d.f.water_gh_ppm) == null || num(d.f.water_kh_ppm) == null);
  const errBean = tried && missBean ? "Pick a bean" : undefined;
  const errDose = tried && missDose ? "Enter the dose" : undefined;
  const errChill = tried && missChill ? "Choose a chill method" : undefined;
  const errMicrons = tried && missMicrons ? "Enter the grind in microns" : undefined;
  const errWater = tried && missWater ? "Enter the water, its GH and its KH" : undefined;
  const errors = [errBean, errDose, errChill, errMicrons, errWater].filter(Boolean).join(". ");

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
  // Another coffee loads its last recipe; over unlogged edits, ask first.
  const pickBean = (id: string) => {
    setHideNote(false);
    if (!id) return setD(withF({ bean_id: null }));
    if (d.touched) return setPending({ beanId: id });
    setD((o) => beanRecipe(db, o, id));
  };
  // The roast date lives on the coffee, so setting it here sets it everywhere.
  const setRoast = (v: number | null) => { if (bean) update((x) => saveBean(x, { id: bean.id, roast_date: v }), "Roast date saved"); };
  const clearLoaded = () => setD((o) => ({ ...emptyDraft(o.method), date: o.date, f: { bean_id: o.f.bean_id }, touched: true }));

  async function save() {
    setTried(true);
    const missing = [missBean && "Pick a bean", missDose && "Enter the dose", missChill && "Choose a chill method",
      missMicrons && "Enter the grind in microns", missWater && "Enter the water, its GH and its KH"].filter(Boolean);
    if (missing.length) {
      setOpened((o) => ({ ...o, ...(missBean ? { "Bean and date": true } : {}), ...(missDose ? { "Recipe": true } : {}), ...(missChill ? { Chilling: true } : {}), ...(missMicrons ? { Grind: true } : {}), ...(missWater ? { "Water used": true } : {}) }));
      notify(`${missing.join(". ")}.`, "error");
      requestAnimationFrame(() => document.querySelector(".brew-form [role=alert]")?.scrollIntoView({ block: "center" }));
      return;
    }
    if (editing) {
      setSaving(true);
      const ok = await update((x) => saveBrew(x, { ...rec, id: editing.id, created: editing.created }, phases), "Brew updated");
      setSaving(false);
      if (ok) go("history", str(editing.id));
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

  const layoutKeys = layoutFor(m, db.fields, db.settings);
  const layoutHasRating = layoutKeys.includes("rating");
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
            hint="Finished bags are hidden." />
          {errBean && <p className="brew-err" role="alert">{errBean}</p>}
          {/* Date and time is wide on phones: it gets its own row so it never runs into the next column. */}
          <div className="field">
            <label className="label" htmlFor={dateId}>Brew date</label>
            <input id={dateId} className="input" type="datetime-local" value={d.date}
              onChange={(e) => setD((o) => ({ ...o, date: e.target.value || emptyDraft(o.method).date, dateSet: !!e.target.value }))} />
          </div>
          <div className="grid-2">
            <DateField label="Roast date" value={num(bean?.roast_date)} onChange={setRoast} disabled={!bean} commitOnBlur />
            <Readout label={frozenOn(bean) != null
              ? <span className="frozen-label">Days off roast<Snowflake size={14} weight="bold" aria-label="to the day it was frozen" /></span>
              : "Days off roast"}>{num(rec.days_off_roast) ?? "-"}</Readout>
          </div>
        </Section>
      );
      case "grind": return <Grind key={b} d={d} up={up} />;
      case "recipe": return <Recipe key={b} d={d} up={up} m={m} err={errDose} />;
      case "water_type": return (
        <Section key={b} title="Water used">
          {/* Waters you've used before, newest first; "Other" adds a new one, which then joins the list.
              Picking a water you've logged before brings its makeup with it. */}
          <SelectField label="Water used" value={str(d.f.water_type)} other placeholder="None" options={pastValues(db, "water_type")}
            onChange={(v) => {
              const last = [...db.brews].filter((x) => str(x.water_type) === v).sort((a, c) => (num(c.brew_date) ?? 0) - (num(a.brew_date) ?? 0))[0];
              up(withF({ water_type: v, ...(last ? { water_gh_ppm: num(last.water_gh_ppm), water_kh_ppm: num(last.water_kh_ppm), water_tds_ppm: num(last.water_tds_ppm) } : {}) }));
            }} />
          {mode !== "basic" && (
            <div className="grid-3">
              <NumField label="GH" unit="ppm" min={0} value={num(d.f.water_gh_ppm)} hint="General hardness, as CaCO3" onChange={(v) => up(withF({ water_gh_ppm: v }))} />
              <NumField label="KH" unit="ppm" min={0} value={num(d.f.water_kh_ppm)} hint="Alkalinity, as CaCO3" onChange={(v) => up(withF({ water_kh_ppm: v }))} />
              <NumField label="TDS" unit="ppm" min={0} value={num(d.f.water_tds_ppm)} hint="Optional" onChange={(v) => up(withF({ water_tds_ppm: v }))} />
            </div>
          )}
          {errWater && <p className="brew-err" role="alert">{errWater}</p>}
        </Section>
      );
      case "milk": {
        // Espresso-style only; Black or Milk is picked at the top of the form.
        if (!espressoStyle(m)) return null;
        return serve === "milk" ? (
          <Section key={b} title="Milk">
            <div className="grid-2">
              <SelectField label="Drink" value={str(d.f.milk_drink)} options={MILK_DRINKS} other
                onChange={(v) => {
                  const drink = v || MILK_DRINKS[0];
                  up(withF({ milk_drink: drink, milk_g: num(d.f.milk_g) ?? MILK_DEFAULT_G[drink] ?? null }));
                }} />
              <NumField label="Milk" unit="g" min={0} value={num(d.f.milk_g)} onChange={(v) => up(withF({ milk_g: v }))} />
            </div>
          </Section>
        ) : (
          <Section key={b} title="Black">
            <NumField label="Water added" unit="g" min={0} value={num(d.f.serve_water_g)} onChange={(v) => up(withF({ serve_water_g: v }))}
              hint="For an americano or long black. Leave empty for a straight shot." />
          </Section>
        );
      }
      case "dripper": return <Dripper key={b} d={d} up={up} />;
      case "pours": return <Pours key={b} d={d} up={up} total={pourTotal(d, m)} hybrid={dripper?.style === "hybrid"} />;
      case "presses": return <Presses key={b} d={d} up={up} />;
      case "chill": return iced ? <Chill key={b} d={d} up={up} m={m} err={errChill} /> : null;
      // One chart per coffee (on its page); a brew keeps its tasting notes as text.
      case "taste": return (
        <Section key={b} title="Tasting notes">
          <TextField label="Tasting notes" multiline value={str(d.f.tasting_notes)} onChange={(v) => up(withF({ tasting_notes: v }))}
            hint="What you tasted in this cup. The coffee's flavour chart is on its page." />
        </Section>
      );
      // Rating and what changed are one section (the verdict), open by default.
      case "notes": if (layoutHasRating) return null;
      // falls through
      case "rating": return (
        <Section key={b} title={VERDICT}>
          <Segmented label="Rating" value={str(d.f.rating)} onChange={(v) => up(withF({ rating: Number(v) }))}
            options={["1", "2", "3", "4", "5"].map((n): [string, string, Icon] => [n, n, Star])} />
          <div className="stack brew-pair">
            <Segmented label="Taste balance" value={str(d.f.taste_balance)} onChange={(v) => up(withF({ taste_balance: v }))} full
              options={[["sour", "Sour"], ["balanced", "Balanced"], ["bitter", "Bitter"]]} />
            <SelectField label="Body" value={bodyLevel(d.f.taste_strength)} placeholder="Not set" options={BODY_LEVELS}
              onChange={(v) => up(withF({ taste_strength: v }))} />
          </div>
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
  const grinderName = db.gear.find((g) => g.id === d.f.grinder_id)?.name;
  const extrasSet = db.fields.filter((x) => x.method === m.id && str(d.f[x.key]) !== "").length;
  const summary: Record<string, string> = {
    "Bean and date": [str(bean?.name), d.date.slice(0, 10)].filter(Boolean).join(", "),
    Grind: mode === "pretentious" ? (num(d.f.grind_um) != null ? `${num(d.f.grind_um)} µm` : "") : [str(d.f.grind_setting), grinderName].filter(Boolean).join(" on "),
    "Recipe": [dose != null && liquid != null ? `${dose} to ${liquid} g` : "", ratio != null ? `1:${ratio}` : "", num(rec.temp_c) != null ? `${num(rec.temp_c)} °C` : ""].filter(Boolean).join(", "),
    [`${m.label} details`]: extrasSet ? `${extrasSet} set` : "",
    "Water used": [str(d.f.water_type), num(d.f.water_gh_ppm) != null ? `GH ${num(d.f.water_gh_ppm)}` : "", num(d.f.water_kh_ppm) != null ? `KH ${num(d.f.water_kh_ppm)}` : ""].filter(Boolean).join(", "),
    Milk: [str(d.f.milk_drink), num(d.f.milk_g) != null ? `${num(d.f.milk_g)} g` : ""].filter(Boolean).join(", "),
    Black: num(d.f.serve_water_g) != null ? `${num(d.f.serve_water_g)} g water` : "Straight",
    "Dripper and paper": [str(dripper?.name), str(d.f.paper)].filter(Boolean).join(", "),
    "Pour phases": d.pours.length ? `${d.pours.length} pours` : "",
    "Press phases": d.presses.length ? `${d.presses.length} presses` : "",
    Chilling: str(d.f.chill_method),
    "Tasting notes": str(d.f.tasting_notes).slice(0, 28),
    [VERDICT]: num(d.f.rating) != null ? `${num(d.f.rating)}/5` : "",
  };
  const fold = {
    isOpen: (t: string) => opened[t] ?? t === VERDICT,
    toggle: (t: string, open: boolean) => setOpened((o) => (o[t] === open || (o[t] == null && open === (t === VERDICT)) ? o : { ...o, [t]: open })),
    meta: (t: string) => summary[t] ?? "",
  };
  return (
    <div className="brew">
      <style href="et-brew" precedence="default">{CSS}</style>
      <div className="brew-form">
        <div className="stack">
          <h1>{editing ? "Edit brew" : "Brew"}</h1>
          <div className="brew-methods">
            <Segmented label="Method" value={m.id} onChange={pickMethod}
              options={methods.map((x): [string, string, Icon] => [x.id, x.label, ICONS[x.id] ?? Flask])} />
          </div>
          {/* Saved recipes: load one into the form, or save this one under a name. */}
          <div className="brew-recipes">
            <SelectField label="Saved recipe" value="" placeholder={db.settings.recipes.length ? "Load a saved recipe" : "No saved recipes yet"}
              options={db.settings.recipes.map((r, i): [string, string] => [String(i), `${r.name} (${methods.find((x) => x.id === r.method)?.label ?? r.method})`])}
              onChange={(v) => { const r = db.settings.recipes[Number(v)]; if (r) { setD((o) => applyRecipe(o, r)); notify(`Loaded ${r.name}`, "success"); } }} />
            <IconButton icon={BookmarkSimple} label="Save as recipe" onClick={() => setNaming(true)} />
          </div>
          <Dialog open={naming} onClose={() => setNaming(false)} title="Save as recipe">
            <div className="stack">
              <TextField label="Recipe name" value={recipeName} maxLength={40} placeholder="For example 4:6 V60, 92 °C" onChange={setRecipeName} />
              <p className="meta">Saves the method and recipe. The coffee, date and tasting notes are not part of it. A recipe with the same name is replaced.</p>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <Button ghost onClick={() => setNaming(false)}>Cancel</Button>
                <Button icon={BookmarkSimple} disabled={!recipeName.trim() || busy} onClick={async () => {
                  const r = toRecipe(d, recipeName);
                  const ok = await update((x) => saveSettings(x, { ...x.settings, recipes: [...x.settings.recipes.filter((y) => y.name !== r.name), r] }), `Saved ${r.name}`);
                  if (ok) { setNaming(false); setRecipeName(""); }
                }}>Save</Button>
              </div>
            </div>
          </Dialog>
          {/* The two choices that decide which sections show: hot or iced, and (espresso style) black or milk. */}
          <div className="grid-2 brew-switches">
            {m.chill !== "required" && m.id !== "coldbrew" && layoutKeys.includes("chill") && (
              <Segmented label="Drink" full value={iced ? "iced" : "hot"} options={[["hot", "Hot", Flame], ["iced", "Iced", Snowflake]]}
                onChange={(v) => up(withF({ iced: v === "iced" }))} />
            )}
            {espressoStyle(m) && layoutKeys.includes("milk") && (
              <Segmented label="Served" full value={serve} options={[["black", "Black", Coffee], ["milk", "Milk", Drop]]}
                onChange={(v) => up(withF(v === "milk"
                  ? { serve: "milk", milk_drink: str(d.f.milk_drink) || MILK_DRINKS[0], milk_g: num(d.f.milk_g) ?? MILK_DEFAULT_G[str(d.f.milk_drink) || MILK_DRINKS[0]] ?? null }
                  : { serve: "black", milk_drink: "", milk_g: null }))} />
            )}
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
        <FoldCtx.Provider value={fold}>{blocks.map(section)}</FoldCtx.Provider>
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
          <Button icon={FloppyDisk} onClick={save} disabled={busy || saving}>
            {editing ? (saving ? "Saving..." : "Save changes") : saving ? "Logging..." : "Log brew"}
          </Button>
        </div>
        <div className="brew-preview">
          <Timeline items={[{ label: "This brew", method: m, brew: rec, phases }]} />
        </div>
      </aside>
      <Dialog open={!!pending} onClose={() => setPending(undefined)} title="Replace your unsaved draft?">
        <p>
          {pending?.brew
            ? `Brew again loads the brew from ${ymd(pending.brew.brew_date)} over the edits you have not logged.`
            : `Switching to ${str(db.beans.find((x) => x.id === pending?.beanId)?.name) || "this coffee"} loads its last recipe over the edits you have not logged.`}
        </p>
        <div className="row">
          <span className="spacer" />
          {pending?.beanId
            ? <Button ghost onClick={() => { setD(withF({ bean_id: pending.beanId })); setPending(undefined); }}>Keep my edits</Button>
            : <Button ghost onClick={() => setPending(undefined)}>Keep draft</Button>}
          <Button onClick={() => {
            if (pending?.brew) setD(again(db, pending.brew, methods[0].id));
            else if (pending?.beanId) setD((o) => beanRecipe(db, o, pending.beanId!));
            setPending(undefined);
          }}>Load recipe</Button>
        </div>
      </Dialog>
    </div>
  );
}

// Phone and tablet: one column, the summary bar sticks to the bottom (above the phone tab bar).
// Laptop: form left, sticky preview right.
const CSS = `
.brew { display: grid; gap: 32px; }
.brew-form { display: grid; gap: 0; min-width: 0; }
.brew-form > .stack:first-child { margin-bottom: 24px; }
.brew-recipes { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; }
.brew-form > .section:not(.fold-section) { margin-bottom: 32px; }
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
