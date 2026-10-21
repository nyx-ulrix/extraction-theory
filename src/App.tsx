import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowClockwise, ClockCounterClockwise, Coffee, GearSix, GoogleLogo, Moon, Plant, SignIn, Sun, Table, X, type Icon,
} from "@phosphor-icons/react";
import { Ctx, type AppCtx, type View } from "./ctx.ts";
import { AuthError, hadSession, hasToken, preload, signIn } from "./google.ts";
import { sheetUrl } from "./sheets.ts";
import { loadDb, type Db } from "./store.ts";
import { Button, Dialog, IconButton, Msg } from "./ui.tsx";
import Brew from "./views/Brew.tsx";
import History from "./views/History.tsx";
import Beans from "./views/Beans.tsx";
import Settings from "./views/Settings.tsx";

/** Black line art on transparent. Inverted in dark mode by CSS. */
export const LOGO_SRC = "/logo.png";

// ---- Theme: saved choice in localStorage, else the system preference ----
export type ThemeChoice = "system" | "light" | "dark";
const THEME_KEY = "et.theme";
const mq = window.matchMedia("(prefers-color-scheme: dark)");
let choice: ThemeChoice = (() => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
})();
const subs = new Set<() => void>();
function applyTheme() {
  const dark = choice === "dark" || (choice === "system" && mq.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#131312" : "#ffffff");
  subs.forEach((f) => f());
}
applyTheme();
mq.addEventListener("change", applyTheme);

export function setTheme(c: ThemeChoice) {
  choice = c;
  try {
    if (c === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, c);
  } catch { /* storage blocked: choice lasts this session */ }
  applyTheme();
}
export function useTheme(): { choice: ThemeChoice; dark: boolean } {
  const snap = useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => `${choice}:${document.documentElement.dataset.theme}`,
  );
  const [c, t] = snap.split(":");
  return { choice: c as ThemeChoice, dark: t === "dark" };
}

/** Icon-only external link styled like IconButton. */
export function IconLink({ href, icon: I, label, tipAlign }: { href: string; icon: Icon; label: string; tipAlign?: "end" }) {
  return (
    <a className="icon-btn" href={href} target="_blank" rel="noopener noreferrer" data-tip={label} data-tip-align={tipAlign} aria-label={label}>
      <I size={20} aria-hidden />
    </a>
  );
}

const NAV: [View, string, Icon][] = [
  ["brew", "Brew", Coffee],
  ["history", "History", ClockCounterClockwise],
  ["beans", "Beans", Plant],
  ["settings", "Settings", GearSix],
];
const VIEW_KEY = "et.view";
function initialView(): View {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    if (NAV.some(([n]) => n === v)) return v as View;
  } catch { /* storage blocked */ }
  return "brew";
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Kind = "info" | "error" | "success";
interface Toast { msg: string; kind: Kind; auth?: boolean }

function Brand({ big }: { big?: boolean }) {
  return (
    <span className={`brand${big ? " big" : ""}`}>
      <img className="logo" src={LOGO_SRC} alt="" width={big ? 48 : 28} height={big ? 48 : 28} />
      {big ? <h1 className="wordmark">Extraction Theory</h1> : <span className="wordmark">Extraction Theory</span>}
    </span>
  );
}

function ThemeButton() {
  const { dark } = useTheme();
  return <IconButton icon={dark ? Sun : Moon} label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(dark ? "light" : "dark")} tipAlign="end" />;
}

export default function App() {
  const [phase, setPhase] = useState<"out" | "loading" | "error" | "in">("out");
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState("");
  const [db, setDb] = useState<Db | null>(null);
  const dbRef = useRef<Db | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [arg, setArg] = useState<string>();
  const [gisReady, setGisReady] = useState(false);
  const dirty = useRef(false);
  const [leaving, setLeaving] = useState<[View, string | undefined] | null>(null);

  useEffect(() => {
    preload().then(() => setGisReady(true), (e) => setErr(errMsg(e)));
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = ""; // older Chromium needs this to show the prompt
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const notify = useCallback((msg: string, kind: Kind = "info") => setToast({ msg, kind }), []);
  useEffect(() => {
    if (!toast || toast.kind === "error") return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const start = async () => {
    setErr("");
    setSigning(true);
    try {
      if (!hasToken()) await signIn();
    } catch (e) {
      setErr(errMsg(e));
      setPhase("out");
      return;
    } finally {
      setSigning(false);
    }
    await load();
  };

  // A token saved from an earlier visit is still valid: skip the sign-in screen.
  useEffect(() => {
    if (hasToken()) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setPhase("loading");
    try {
      const d = await loadDb();
      dbRef.current = d;
      setDb(d);
      setPhase("in");
    } catch (e) {
      setErr(errMsg(e));
      setPhase("error");
    }
  };

  const update = useCallback<AppCtx["update"]>(async (fn, done) => {
    const cur = dbRef.current;
    if (!cur) return false;
    setBusy(true);
    try {
      // Token ran out while the app was open: saves come from a click, so the popup is allowed here.
      if (!hasToken()) await signIn();
      const next = await fn(cur);
      dbRef.current = next;
      setDb(next);
      if (done) notify(done, "success");
      return true;
    } catch (e) {
      if (e instanceof AuthError) setToast({ msg: "Google session expired. Sign in again, then retry. Nothing was lost.", kind: "error", auth: true });
      else notify(errMsg(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const reauth = async () => {
    try {
      await signIn();
      notify("Signed in again. Try that once more.", "success");
    } catch (e) {
      notify(errMsg(e), "error");
    }
  };

  const navigate = useCallback((v: View, a?: string) => {
    dirty.current = false;
    setLeaving(null);
    setView(v);
    setArg(a);
    window.scrollTo(0, 0);
    try { sessionStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  }, []);
  // Same view and arg keeps the page mounted, so nothing is lost and no need to ask.
  const go = useCallback((v: View, a?: string) => {
    if (dirty.current && !(v === view && a === arg)) setLeaving([v, a]);
    else navigate(v, a);
  }, [navigate, view, arg]);
  const setDirty = useCallback((d: boolean) => { dirty.current = d; }, []);

  const ctx = useMemo<AppCtx | null>(
    () => (db ? { db, update, busy, notify, go, arg, setDirty } : null),
    [db, update, busy, notify, go, arg, setDirty],
  );

  const toastEl = toast && (
    <div className="toast">
      <Msg kind={toast.kind}>
        <span className="toast-text">{toast.msg}</span>
        {toast.auth && <IconButton icon={SignIn} label="Sign in again" onClick={reauth} />}
        <IconButton icon={X} label="Close" variant="bare" onClick={() => setToast(null)} />
      </Msg>
    </div>
  );

  if (phase === "out") {
    return (
      <>
        <style>{CSS}</style>
        <main className="hero wrap">
          <div className="stack-lg">
            <Brand big />
            <p className="lede">Log every brew and dial in faster. Your data lives in your own Google Sheet.</p>
            <div>
              <Button icon={GoogleLogo} onClick={start} disabled={signing || !gisReady}>{hadSession() ? "Continue with Google" : "Sign in with Google"}</Button>
            </div>
            {err && <Msg kind="error">{err}</Msg>}
            <nav className="row legal" aria-label="Legal">
              <a href="/privacy.html">Privacy</a>
              <a href="/terms.html">Terms</a>
            </nav>
          </div>
        </main>
        <footer className="credit wrap">Created by Jia En</footer>
      </>
    );
  }

  const head = (
    <header className="app-head">
      <div className="wrap">
        <Brand />
        {ctx && (
          <nav className="nav-top" aria-label="Main">
            {NAV.map(([v, label, I]) => (
              <button key={v} type="button" aria-current={view === v ? "page" : undefined} onClick={() => go(v)}>
                <I size={20} aria-hidden />{label}
              </button>
            ))}
          </nav>
        )}
        <span className="spacer" />
        <ThemeButton />
        {db && <IconLink href={sheetUrl(db.id)} icon={Table} label="Open Google Sheet" tipAlign="end" />}
      </div>
    </header>
  );

  if (!ctx) {
    return (
      <>
        <style>{CSS}</style>
        {head}
        {phase === "error" ? (
          <main className="wrap app-main">
            <div className="page">
              <Msg kind="error">
                <span className="toast-text">Could not load your sheet. {err}</span>
                <IconButton icon={ArrowClockwise} label="Retry" onClick={start} />
              </Msg>
            </div>
          </main>
        ) : (
          <main className="wrap app-main" aria-busy="true" aria-label="Loading your sheet">
            <div className="page">
              <div className="skel" style={{ height: 40, width: 220 }} />
              <div className="grid-2">
                <div className="skel" style={{ height: 44 }} />
                <div className="skel" style={{ height: 44 }} />
              </div>
              <div className="skel" style={{ height: 160 }} />
              <div className="skel" style={{ height: 44, width: "60%" }} />
              <div className="skel" style={{ height: 44, width: "80%" }} />
            </div>
          </main>
        )}
        {toastEl}
      </>
    );
  }

  const Page = { brew: Brew, history: History, beans: Beans, settings: Settings }[view];
  return (
    <Ctx.Provider value={ctx}>
      <style>{CSS}</style>
      {head}
      <main className="wrap app-main" key={`${view}:${arg ?? ""}`}>
        <Page />
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map(([v, label, I]) => (
          <button key={v} type="button" aria-current={view === v ? "page" : undefined} onClick={() => go(v)}>
            <I size={22} aria-hidden />{label}
          </button>
        ))}
      </nav>
      {toastEl}
      <Dialog open={!!leaving} onClose={() => setLeaving(null)} title="Discard unsaved changes?">
        <p>Your changes on this page have not been saved.</p>
        {/* Confirm dialog: the one place a ghost text button sits beside the primary. */}
        <div className="row confirm">
          <Button ghost onClick={() => setLeaving(null)}>Keep editing</Button>
          <Button onClick={() => leaving && navigate(...leaving)}>Discard</Button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

// App shell and shared view layout. ponytail: lives here because styles.css belongs to another agent; move it there when merging.
const CSS = `
.app-head { position: sticky; top: 0; z-index: 30; background: var(--bg); border-bottom: 1px solid var(--border-soft); }
.app-head > .wrap { height: var(--nav-h); display: flex; align-items: center; gap: 8px; }
.brand { display: flex; align-items: center; gap: 10px; margin-right: 16px; }
.wordmark { font: 700 16px/1 var(--mono); letter-spacing: 0.02em; color: var(--text-strong); white-space: nowrap; }
.brand.big .wordmark { font-size: 28px; }
@media (min-width: 1024px) { .brand.big .wordmark { font-size: 40px; } }
:root[data-theme="dark"] .logo { filter: invert(1); }
.nav-top { display: none; height: 100%; }
.nav-top button, .tabbar button {
  background: none; border: 0; color: var(--text); cursor: pointer;
  font: 400 11px/1 var(--mono); letter-spacing: 0.2em; text-transform: uppercase;
}
.nav-top button { display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 14px; border-bottom: 1px solid transparent; margin-bottom: -1px; }
.nav-top button:hover, .tabbar button:hover { color: var(--text-strong); }
.nav-top button[aria-current="page"] { color: var(--text-strong); border-bottom-color: var(--border); }
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: grid; grid-template-columns: repeat(4, 1fr);
  background: var(--bg); border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom);
}
.tabbar button { height: var(--nav-h); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.tabbar button[aria-current="page"] { color: var(--text-strong); background: var(--surface); }
@media (max-width: 767px) { body:has(.tabbar) { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom)); } }
@media (min-width: 768px) { .nav-top { display: flex; } .tabbar { display: none; } }
/* Tablet: logo only, tighter tabs, so the nav stays on one line at 768. */
@media (min-width: 768px) and (max-width: 1023px) { .app-head .wordmark { display: none; } .nav-top button { padding: 0 10px; } }
/* Header sits at the top edge: tooltips open below. */
.app-head .icon-btn[data-tip]::after { bottom: auto; top: calc(100% + 6px); }
.confirm { justify-content: flex-end; }
.app-main { padding-top: 24px; padding-bottom: 64px; }
.page { max-width: 880px; display: grid; gap: 32px; }
.page-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.toast-text { flex: 1; align-self: center; }
.toast .msg { align-items: center; }

.hero { min-height: calc(100dvh - 72px); display: grid; gap: 48px; align-content: center; padding-top: 48px; padding-bottom: 48px; }
.lede { color: var(--text-strong); max-width: 34ch; font-size: 17px; }
.legal { gap: 16px; font-size: 12px; }
.legal a { display: inline-flex; min-height: 44px; align-items: center; }
.credit { padding-top: 16px; padding-bottom: 24px; border-top: 1px solid var(--border-soft); font-size: 12px; display: flex; align-items: center; gap: 8px; }

.list { display: grid; }
.item { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border-soft); }
.item-main {
  flex: 1; min-width: 0; display: grid; gap: 4px; padding: 14px 0; min-height: 44px;
  background: none; border: 0; color: var(--text); font: inherit; letter-spacing: inherit; text-align: left; cursor: pointer;
}
.item-main:hover .item-title { color: var(--accent); }
.item-title { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; color: var(--text-strong); }
.meta { display: flex; flex-wrap: wrap; gap: 2px 16px; font-size: 13px; color: var(--text); }
.kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; margin: 0; }
.kv > div { min-width: 0; display: grid; gap: 2px; align-content: start; }
.kv dd { margin: 0; color: var(--text-strong); overflow-wrap: anywhere; white-space: pre-wrap; }
.kv .wide { grid-column: 1 / -1; }
.split { display: grid; gap: 24px; }
@media (min-width: 768px) { .split { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.diff { width: 100%; border-collapse: collapse; font-size: 13px; }
.diff th, .diff td { text-align: left; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--border-soft); vertical-align: top; overflow-wrap: anywhere; }
.diff th { font-weight: 400; color: var(--text); }
.diff td { color: var(--text-strong); }
.inline { display: flex; gap: 8px; align-items: center; }
.inline > .input { flex: 1; min-width: 0; }

.stops { display: grid; grid-template-columns: repeat(3, 1fr); }
.stops span:nth-child(2) { text-align: center; }
.stops span:last-child { text-align: right; }
input[type="range"].unset { opacity: 0.4; }
.gear { display: grid; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-soft); align-items: end; }
.gear.grinder { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 44px; }
.gear.grinder > :first-child { grid-column: 1 / -1; }
@media (min-width: 768px) {
  .gear.grinder { grid-template-columns: minmax(0, 1fr) 150px 150px 44px; }
  .gear.grinder > :first-child { grid-column: auto; align-self: center; }
  .gear.dripper { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); align-items: center; }
}
.preset { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 44px; gap: 12px; align-items: start; }
.preset > .icon-btn { margin-top: 23px; }
.lrow { display: flex; align-items: center; gap: 8px; min-height: 52px; border-bottom: 1px solid var(--border-soft); }
.lrow > span { flex: 1; min-width: 0; color: var(--text-strong); }
.lrow.off > span { color: var(--text); }
`;
