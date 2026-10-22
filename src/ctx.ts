import { createContext, useContext } from "react";
import type { Db } from "./store.ts";

export type View = "home" | "brew" | "history" | "beans" | "settings" | "share" | "shared" | "scan";

export interface AppCtx {
  db: Db;
  /**
   * Run a save. Shows errors (including an expired Google session) as a toast and
   * returns false on failure, so the caller keeps its draft.
   */
  update: (fn: (db: Db) => Promise<Db>, done?: string) => Promise<boolean>;
  busy: boolean;
  notify: (msg: string, kind?: "info" | "error" | "success") => void;
  /** Switch view. `arg` is a brew id (history detail, or brew form prefill), a bean id, or a shared code. */
  go: (view: View, arg?: string) => void;
  /** Return to the page you came from (browser history), or Home if there is none. */
  back: () => void;
  arg?: string;
  /** Mark the current view as holding unsaved edits. While true, `go` asks before leaving and the tab warns on close. Navigating clears it. */
  setDirty: (dirty: boolean) => void;
}

// Unsaved form edits kept on this device while the form is open, so leaving for Google's sign-in page
// (or a reload) loses nothing; closing the form drops them. Coffee and settings only: never API keys or tokens.
export const BEAN_FORM = "et.form.bean";
export const SETTINGS_FORM = "et.form.settings";
export function readForm<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; }
}
export function keepForm(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage blocked or full: edits last this page only */ }
}

export const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
