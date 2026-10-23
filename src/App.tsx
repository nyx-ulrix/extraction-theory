import { Scan, ShareCoffee, SharedCoffee } from "./views/Share.tsx";
import { codeFrom } from "./share.ts";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowClockwise, Books, Coffee, GearSix, GoogleLogo, House, Moon, SignIn, Sun, Table, X, type Icon,
} from "@phosphor-icons/react";
import { Ctx, type AppCtx, type View } from "./ctx.ts";
import { AuthError, forgetAccount, hadSession, hasToken, resume, returned, signIn } from "./google.ts";
import { sheetUrl } from "./sheets.ts";
import { loadDb, type Db } from "./store.ts";
import { DEFAULT_SETTINGS } from "./schema.ts";
import { Button, Dialog, IconButton, Msg } from "./ui.tsx";
import Home from "./views/Home.tsx";
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
  ["home", "Home", House],
  ["brew", "Brew", Coffee],
  ["beans", "Library", Books],
  ["settings", "Settings", GearSix],
];
const VIEW_KEY = "et.view";
const INCOMING = "et.incoming";
function pendingShare(): string | null {
  try { return sessionStorage.getItem(INCOMING); } catch { return null; }
}
// The page this tab was on, so a reload or a trip to Google's sign-in page comes back to it (a Settings
// section or a bean's form, say). Not the brew form's arg: that is a one-time prefill, and the brew draft has its own.
function initialPage(): { v: View; a?: string } {
  try {
    const p = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? "null") as { v?: string; a?: unknown } | null;
    if (p && NAV.some(([n]) => n === p.v)) return { v: p.v as View, a: p.v !== "brew" && typeof p.a === "string" ? p.a : undefined };
  } catch { /* storage blocked or an older plain value */ }
  return { v: "home" };
}
const RETURN_MSG: Record<string, string> = {
  ok: "Signed in, but this browser didn't keep the sign-in. Allow cookies for this site and try again.",
  cancelled: "Sign-in was cancelled.",
  expired: "Sign-in took too long or started in another tab. Try again.",
};

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

// Last copy of the sheet on this device, so the app opens straight into your coffees even after
// Google's 1-hour access token has run out. Cleared on sign out.
const CACHE = "et.cache";
function readCache(): Db | null {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE) ?? "null") as Db | null;
    if (!d?.id || !Array.isArray(d.beans) || !Array.isArray(d.brews) || !d.settings) return null;
    // A copy saved by an older version may lack newer settings: fill them with defaults.
    return { ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  } catch { return null; }
}
function writeCache(d: Db) {
  try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* storage full or blocked: next start loads from the sheet */ }
}

export default function App() {
  const [phase, setPhase] = useState<"out" | "loading" | "error" | "in">("out");
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState("");
  const [db, setDb] = useState<Db | null>(null);
  const dbRef = useRef<Db | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [incoming, setIncoming] = useState<string | null>(pendingShare);
  const [first] = useState(initialPage);
  const [view, setView] = useState<View>(first.v);
  const [arg, setArg] = useState<string | undefined>(first.a);
  const dirty = useRef(false);
  // The page on screen, for a link opened in this tab: its #hash entry stands in for this page.
  const here = useRef<{ v: View; a?: string; depth: number }>({ v: view, a: arg, depth: 0 });
  here.current = { v: view, a: arg, depth: (window.history.state as { depth?: number } | null)?.depth ?? 0 };
  const [leaving, setLeaving] = useState<[View, string | undefined] | null>(null);

  useEffect(() => {
    // Back from Google's page with the browser's back button: the page may be restored as it was left.
    const shown = (e: PageTransitionEvent) => { if (e.persisted) setSigning(false); };
    window.addEventListener("pageshow", shown);
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = ""; // older Chromium needs this to show the prompt
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("pageshow", shown);
      window.removeEventListener("beforeunload", warn);
    };
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
    // A cookie still valid at the Worker (storage cleared, say) needs no trip to Google.
    if (hasToken() || (await resume())) {
      setSigning(false);
      return load();
    }
    try {
      signIn(); // leaves the page; the button stays disabled until it does
    } catch (e) {
      setErr(errMsg(e));
      setSigning(false);
    }
  };

  const setData = useCallback((d: Db) => {
    // Another sheet under the open page (another account signed in from another tab): start the page
    // afresh, so a draft held on screen can't be saved into the new account's sheet.
    if (dbRef.current && dbRef.current.id !== d.id) {
      forgetAccount();
      writeCache(d);
      dirty.current = false;
      location.reload();
      return;
    }
    dbRef.current = d;
    setDb(d);
    writeCache(d);
  }, []);

  // Signed in before on this device: open straight into the cached coffees, then refresh from the
  // sheet in the background while the token is valid, or after the next tap renews it.
  const [authed, setAuthed] = useState(hasToken);
  useEffect(() => {
    // Back from Google's sign-in page: the Worker now holds the session, so renew from it like a known device.
    const known = hadSession() || returned === "ok";
    // Not the saved copy right after sign-in: it may have been another Google account's. Dropped, not
    // just skipped, so a load that fails now can't bring it back on the next open.
    if (returned === "ok") try { localStorage.removeItem(CACHE); } catch { /* storage blocked */ }
    const cached = known && returned !== "ok" ? readCache() : null;
    if (cached) {
      dbRef.current = cached;
      setDb(cached);
      setPhase("in");
    } else if (known) setPhase("loading");
    (async () => {
      // Expired token: the Worker renews it silently from its cookie.
      if (!hasToken() && known) await resume();
      if (hasToken()) return cached ? refresh() : load();
      setAuthed(false);
      if (returned) setErr(RETURN_MSG[returned] ?? "Sign-in failed. Try again.");
      if (!cached) setPhase("out");
    })();
    // Notice the token running out while the app stays open.
    const t = setInterval(() => setAuthed(hasToken()), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setPhase("loading");
    try {
      setData(await loadDb());
      setAuthed(true);
      setPhase("in");
    } catch (e) {
      // A saved session Google no longer accepts: back to the one-tap sign-in, not an error page.
      if (e instanceof AuthError) return setPhase("out");
      setErr(errMsg(e));
      setPhase("error");
    }
  };

  // Quiet reload behind the cached copy; nothing changes on screen unless the sheet did.
  const refresh = async () => {
    try {
      setData(await loadDb());
      setAuthed(true);
    } catch (e) {
      if (e instanceof AuthError) setAuthed(false);
      else notify(`Showing your saved copy. ${errMsg(e)}`, "error");
    }
  };

  // Token expired and the Worker couldn't renew it (offline, say): the next tap anywhere tries again.
  // Still no session: offer sign-in, which leaves the page, rather than leaving on a stray tap.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (phase !== "in" || authed) return;
    const renew = (e: MouseEvent) => {
      // Taps on the toast itself (Close, Sign in again) are its own; re-arm for the next one.
      if ((e.target as Element | null)?.closest?.(".toast")) return setRetry((n) => n + 1);
      resume().then((ok) => {
        if (ok) {
          setAuthed(true);
          refresh();
          return;
        }
        setToast({ msg: "Google session expired. Sign in again to sync.", kind: "error", auth: true });
        setRetry((n) => n + 1);
      });
    };
    window.addEventListener("click", renew, { capture: true, once: true });
    return () => window.removeEventListener("click", renew, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, authed, retry]);

  const update = useCallback<AppCtx["update"]>(async (fn, done) => {
    const cur = dbRef.current;
    if (!cur) return false;
    setBusy(true);
    try {
      // Token ran out while the app was open: renew silently, else the toast offers sign-in.
      if (!hasToken() && !(await resume())) throw new AuthError();
      setAuthed(true);
      setData(await fn(cur));
      if (done) notify(done, "success");
      return true;
    } catch (e) {
      if (e instanceof AuthError) setToast({ msg: "Google session expired. Sign in again, then retry.", kind: "error", auth: true });
      else notify(errMsg(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [notify, setData]);

  // Leaves the page; with unsaved edits the browser asks first.
  const reauth = () => {
    try { signIn(); } catch (e) { notify(errMsg(e), "error"); }
  };

  // Every page change is a browser history entry, so the back arrow and the phone's back gesture
  // both return to the page you came from.
  const navigate = useCallback((v: View, a?: string, push = true) => {
    dirty.current = false;
    setLeaving(null);
    setView(v);
    setArg(a);
    window.scrollTo(0, 0);
    if (push) {
      const depth = ((window.history.state as { depth?: number } | null)?.depth ?? 0) + 1;
      window.history.pushState({ v, a, depth }, "");
    }
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ v, a })); } catch { /* storage blocked */ }
  }, []);
  // Same view and arg keeps the page mounted, so nothing is lost and no need to ask.
  const go = useCallback((v: View, a?: string) => {
    if (dirty.current && !(v === view && a === arg)) setLeaving([v, a]);
    else navigate(v, a);
  }, [navigate, view, arg]);
  const back = useCallback(() => {
    if (((window.history.state as { depth?: number } | null)?.depth ?? 0) > 0) window.history.back();
    else go("home");
  }, [go]);
  useEffect(() => {
    if (!window.history.state?.v) window.history.replaceState({ v: view, a: arg, depth: 0 }, "");
    const onPop = (e: PopStateEvent) => {
      const s = e.state as { v?: View; a?: string } | null;
      if (!s?.v) return;
      if (dirty.current) {
        // Unsaved edits: stay put and ask first.
        window.history.pushState({ v: view, a: arg, depth: ((s as { depth?: number }).depth ?? 0) + 1 }, "");
        setLeaving([s.v, s.a]);
        return;
      }
      navigate(s.v, s.a, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate, view, arg]);
  const setDirty = useCallback((d: boolean) => { dirty.current = d; }, []);

  // A shared coffee link (#s=...): kept through sign-in, opened once the sheet is loaded.
  useEffect(() => {
    const take = () => {
      const code = location.hash.length > 3 ? codeFrom(location.hash) : null;
      if (!code) return;
      try { sessionStorage.setItem(INCOMING, code); } catch { /* storage blocked */ }
      history.replaceState(history.state?.v ? history.state : here.current, "", location.pathname + location.search);
      setIncoming(code);
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
  useEffect(() => {
    if (!db || !incoming) return;
    try { sessionStorage.removeItem(INCOMING); } catch { /* storage blocked */ }
    setIncoming(null);
    navigate("shared", incoming);
  }, [db, incoming, navigate]);

  const ctx = useMemo<AppCtx | null>(
    () => (db ? { db, update, busy, notify, go, back, arg, setDirty } : null),
    [db, update, busy, notify, go, back, arg, setDirty],
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
            <p className="lede">Log every brew and get to a cup you like, faster. Your data lives in your own Google Sheet.</p>
            <div>
              <Button icon={GoogleLogo} onClick={start} disabled={signing}>{hadSession() ? "Continue with Google" : "Sign in with Google"}</Button>
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

  const Page = { home: Home, brew: Brew, history: History, beans: Beans, settings: Settings, share: ShareCoffee, shared: SharedCoffee, scan: Scan }[view];
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
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  background: var(--bg); border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom);
}
.tabbar button { min-width: 0; letter-spacing: 0.06em; height: var(--nav-h); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
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
