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

export const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
