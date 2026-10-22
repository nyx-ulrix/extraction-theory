// Google sign-in: a full-page redirect through a small Cloudflare Worker (auth-worker/), which keeps a
// refresh token in an HttpOnly cookie, so access tokens renew silently instead of ending every hour.

const AUTH = (import.meta.env.VITE_AUTH_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** Back from sign-in: the Worker's ?auth= result ("ok", "cancelled", ...), taken off the address bar. */
export const returned = (() => {
  const u = new URL(location.href);
  const r = u.searchParams.get("auth");
  if (r === null) return null;
  u.searchParams.delete("auth");
  history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  return r;
})();

export class AuthError extends Error {
  constructor() { super("Google session expired. Sign in again."); }
}

let token: string | null = null;
let expires = 0;

// The access token lives only in this page's memory, never on the device; a reload renews it from the
// Worker. The refresh token never touches the page: it stays in the Worker's HttpOnly cookie. Only a
// "signed in before" flag is stored. Tokens saved by older versions are wiped on load.
const KNOWN = "et.known";
try { localStorage.removeItem("et.session"); } catch { /* storage blocked */ }
function markKnown() {
  try { localStorage.setItem(KNOWN, "1"); } catch { /* storage blocked */ }
}

/** True when this browser signed in before, so a single tap can bring the session back. */
export function hadSession() {
  try { return localStorage.getItem(KNOWN) === "1"; } catch { return false; }
}

export const hasToken = () => !!token && Date.now() < expires;

/** Leave for Google's sign-in page; the Worker brings the browser back to this site with ?auth=. */
export function signIn() {
  if (!AUTH) throw new Error("VITE_AUTH_URL is not set.");
  location.assign(`${AUTH}/login?return=${encodeURIComponent(location.origin)}`);
}

function setToken(r: { access_token: string; expires_in?: number }) {
  token = r.access_token;
  expires = Date.now() + ((r.expires_in ?? 3600) - 60) * 1000;
  markKnown();
}

async function worker<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(`${AUTH}${path}`, {
    method: "POST", credentials: "include", keepalive: path === "/logout",
    // A hung renew must not hold the app on its loading screen.
    signal: path === "/refresh" ? AbortSignal.timeout(3000) : undefined,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
  });
  return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as T };
}

let resuming: Promise<boolean> | null = null;
/** New access token from the Worker's cookie. False means a real sign-in is needed. */
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
  // Revoking the refresh token at Google ends this app's access tokens too.
  worker("/logout").catch(() => { /* offline: the cookie still expires on its own */ });
  token = null;
  expires = 0;
  // Drop data tied to this account. AI keys stay: they are a per-device choice.
  for (const k of ["et.draft", "et.form.bean", "et.form.settings", "et.sheetId", "et.cache", KNOWN]) {
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
