// Google Identity Services token flow + a fetch wrapper. No backend, no client secret.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface Gsi {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}
declare global { interface Window { google?: Gsi } }

export class AuthError extends Error {
  constructor() { super("Google session expired. Sign in again."); }
}

let client: TokenClient | null = null;
let token: string | null = null;
let expires = 0;
let pending: { resolve: () => void; reject: (e: Error) => void } | null = null;

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
    client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        const p = pending;
        pending = null;
        if (r.error || !r.access_token) return p?.reject(new Error(r.error_description || r.error || "Sign-in failed"));
        token = r.access_token;
        expires = Date.now() + ((r.expires_in ?? 3600) - 60) * 1000;
        p?.resolve();
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
export function signIn(): Promise<void> {
  if (!client) return Promise.reject(new Error("Google sign-in is still loading. Try again in a moment."));
  return new Promise((resolve, reject) => {
    pending?.reject(new Error("Superseded by a new sign-in"));
    pending = { resolve, reject };
    client!.requestAccessToken({ prompt: "" });
  });
}

export function signOut() {
  if (token) window.google?.accounts.oauth2.revoke(token);
  token = null;
  expires = 0;
  // Drop data tied to this account. AI keys stay: they are a per-device choice.
  for (const k of ["et.draft", "et.sheetId"]) {
    try { localStorage.removeItem(k); } catch { /* storage blocked */ }
  }
}

export async function api<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  if (!hasToken()) throw new AuthError();
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (r.status === 401) {
    token = null;
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
