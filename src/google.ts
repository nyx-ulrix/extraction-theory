// Google sign-in (Identity Services code flow) + a fetch wrapper. The sign-in code goes to a small
// Cloudflare Worker (auth-worker/) that keeps a refresh token in an HttpOnly cookie, so access
// tokens renew silently instead of ending the session every hour.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const AUTH = (import.meta.env.VITE_AUTH_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

interface CodeResponse { code?: string; error?: string; error_description?: string }
interface CodeClient { requestCode(): void }
interface Gsi {
  accounts: {
    oauth2: {
      initCodeClient(c: {
        client_id: string;
        scope: string;
        ux_mode: "popup";
        callback: (r: CodeResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): CodeClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}
declare global { interface Window { google?: Gsi } }

export class AuthError extends Error {
  constructor() { super("Google session expired. Sign in again."); }
}

let client: CodeClient | null = null;
let token: string | null = null;
let expires = 0;
let pending: { resolve: (code: string) => void; reject: (e: Error) => void } | null = null;

// Keep the 1-hour access token across reloads so a reload needs no network round trip. The scope
// is drive.file only, so a leaked token reaches just the app's own sheet. The long-lived refresh
// token never touches the page: it stays in the Worker's HttpOnly cookie.
const SESSION = "et.session";
const KNOWN = "et.known";
function saveSession() {
  try {
    localStorage.setItem(SESSION, JSON.stringify({ t: token, e: expires }));
    localStorage.setItem(KNOWN, "1");
  } catch { /* storage blocked: session lasts this tab only */ }
}
function clearSession() {
  try { localStorage.removeItem(SESSION); } catch { /* storage blocked */ }
}
try {
  const s = JSON.parse(localStorage.getItem(SESSION) ?? "null") as { t?: string; e?: number } | null;
  if (s?.t && typeof s.e === "number" && Date.now() < s.e) {
    token = s.t;
    expires = s.e;
  }
} catch { /* bad or blocked storage: start signed out */ }

/** True when this browser signed in before, so a single tap can bring the session back. */
export function hadSession() {
  try { return localStorage.getItem(KNOWN) === "1"; } catch { return false; }
}

async function gsi(): Promise<Gsi> {
  for (let i = 0; i < 100 && !window.google?.accounts?.oauth2; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.google?.accounts?.oauth2) throw new Error("Google sign-in script did not load. Check your connection.");
  return window.google;
}

export const hasToken = () => !!token && Date.now() < expires;

const GIS_ERRORS: Record<string, string> = {
  popup_closed: "Sign-in window was closed.",
  popup_failed_to_open: "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
};

let ready: Promise<void> | null = null;
/** Load the GIS script and build the token client ahead of time, so `signIn` needs no await before the popup. */
export function preload(): Promise<void> {
  return (ready ??= (async () => {
    if (!CLIENT_ID) throw new Error("VITE_GOOGLE_CLIENT_ID is not set.");
    const g = await gsi();
    if (!AUTH) throw new Error("VITE_AUTH_URL is not set.");
    client = g.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ux_mode: "popup",
      callback: (r) => {
        const p = pending;
        pending = null;
        if (r.error || !r.code) return p?.reject(new Error(r.error_description || r.error || "Sign-in failed"));
        p?.resolve(r.code);
      },
      error_callback: (e) => {
        const p = pending;
        pending = null;
        p?.reject(new Error(GIS_ERRORS[e.type] || e.message || e.type));
      },
    });
  })().catch((e) => { ready = null; throw e; }));
}

/**
 * Call from a click handler after `preload` resolved. Opens the popup synchronously,
 * because browsers only allow it during the user gesture.
 */
function setToken(r: { access_token: string; expires_in?: number }) {
  token = r.access_token;
  expires = Date.now() + ((r.expires_in ?? 3600) - 60) * 1000;
  saveSession();
}

async function worker<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(`${AUTH}${path}`, {
    method: "POST", credentials: "include", keepalive: path === "/logout",
    // A slow renew must not use up the tap: browsers allow Google's window only ~5 s after it.
    signal: path === "/refresh" ? AbortSignal.timeout(3000) : undefined,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
  });
  return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as T };
}

let inflight: Promise<boolean> | null = null;
/**
 * Google's sign-in window, then the code goes to the Worker. Resolves true when the session can now
 * renew by itself (the Worker got a refresh token). Call from a click: the window needs the gesture.
 */
export function signIn(): Promise<boolean> {
  if (!client) return Promise.reject(new Error("Google sign-in is still loading. Try again in a moment."));
  // One tap can ask twice (renew-on-tap plus a save): share the one window instead of opening two.
  return (inflight ??= new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    client!.requestCode();
  }).then(async (code) => {
    const r = await worker<{ access_token?: string; expires_in?: number; stay?: boolean; error?: string }>("/exchange", { code });
    if (!r.ok || !r.data.access_token) throw new Error(`Sign-in failed (${r.data.error ?? r.status}). Try again.`);
    setToken(r.data as { access_token: string; expires_in?: number });
    return !!r.data.stay;
  }).finally(() => { inflight = null; }));
}

let resuming: Promise<boolean> | null = null;
/** New access token from the Worker's cookie, no window. False means a real sign-in is needed. */
export function resume(): Promise<boolean> {
  return (resuming ??= worker<{ access_token?: string; expires_in?: number }>("/refresh").then(
    (r) => {
      if (!r.ok || !r.data.access_token) return false;
      setToken(r.data as { access_token: string; expires_in?: number });
      return true;
    },
    () => false, // offline or Worker unreachable
  ).finally(() => { resuming = null; }));
}

export function signOut() {
  if (token) window.google?.accounts.oauth2.revoke(token);
  worker("/logout").catch(() => { /* offline: the cookie still expires on its own */ });
  token = null;
  expires = 0;
  // Drop data tied to this account. AI keys stay: they are a per-device choice.
  for (const k of ["et.draft", "et.sheetId", "et.cache", SESSION, KNOWN]) {
    try { localStorage.removeItem(k); } catch { /* storage blocked */ }
  }
}

export async function api<T = unknown>(url: string, init: RequestInit = {}, retried = false): Promise<T> {
  // Expired: renew through the Worker before giving up on the session.
  if (!hasToken() && !(await resume())) throw new AuthError();
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (r.status === 401) {
    token = null;
    clearSession();
    if (!retried && (await resume())) return api<T>(url, init, true);
    throw new AuthError();
  }
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      msg = ((await r.json()) as { error?: { message?: string } }).error?.message || msg;
    } catch { /* non-JSON error body */ }
    throw new Error(`Google API error: ${msg}`);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}
