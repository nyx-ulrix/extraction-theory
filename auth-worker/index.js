// Extraction Theory sign-in helper (Cloudflare Worker).
// Google gives a browser-only app a 1-hour access token and nothing to renew it with. This Worker
// holds the one thing that can: it runs Google's full-page sign-in, keeps the refresh token in an
// HttpOnly cookie the page can never read, and hands the app fresh access tokens on request.
// A redirect, not a popup: on Android the popup's tab can outlive the app's tab, and the code is lost.
// Secrets (wrangler secret put): GOOGLE_CLIENT_SECRET. Vars (wrangler.toml): GOOGLE_CLIENT_ID, ALLOWED_ORIGINS.
// Google console: the OAuth client lists https://<this worker>/callback as a redirect URI.

const COOKIE = "et_rt";
const STATE = "et_st";
const MAX_AGE = 180 * 24 * 3600; // Google drops refresh tokens unused for 6 months
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    // Full-page steps of sign-in: plain navigations, so no CORS.
    if (req.method === "GET" && path === "/login") return login(req, env);
    if (req.method === "GET" && path === "/callback") return callback(req, env).catch(() => back(origins(env)[0], "server_error"));

    const origin = req.headers.get("Origin") ?? "";
    const allowed = origins(env).includes(origin);
    const cors = allowed
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
      : { Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    // Only the app's own pages may call this; browsers always send Origin on these cross-origin POSTs.
    if (!allowed || req.method !== "POST") return json({ error: "forbidden" }, 403, cors);

    try {
      if (path === "/refresh") return await refresh(req, env, cors);
      if (path === "/logout") return await logout(req, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch {
      return json({ error: "server_error" }, 502, cors);
    }
  },
};

const origins = (env) => (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const redirectUri = (req) => new URL("/callback", req.url).href;

/** /login?return=<app origin>: off to Google, with a one-time state cookie tying the reply to this browser. */
function login(req, env) {
  const to = new URL(req.url).searchParams.get("return") ?? "";
  if (!origins(env).includes(to)) return json({ error: "forbidden" }, 403, {});
  const state = crypto.randomUUID();
  return redirect(authUrl(req, env, state, false), [stateCookie(`${state}|${to}`, 600)]);
}

function authUrl(req, env, state, consent) {
  const q = { client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: "code", scope: SCOPE, access_type: "offline", state };
  return `${GOOGLE_AUTH}?${new URLSearchParams(consent ? { ...q, prompt: "consent" } : q)}`;
}

/** Google's reply: code -> refresh token into the cookie, then back to the app, which renews from it. */
async function callback(req, env) {
  const q = new URL(req.url).searchParams;
  const [state, to] = decodeURIComponent(readCookie(req, STATE)).split("|");
  // Missing or stale state (over 10 minutes, another tab, a forged link): start over from the app.
  if (!state || !origins(env).includes(to)) return back(origins(env)[0], "expired");
  const retried = q.get("state") === `${state}.c`;
  if (q.get("state") !== state && !retried) return back(to, "expired");
  const code = q.get("code");
  if (!code) return back(to, q.get("error") === "access_denied" ? "cancelled" : "failed");
  const g = await google(env, { grant_type: "authorization_code", code, redirect_uri: redirectUri(req) });
  if (!g.refresh_token) {
    if (!g.access_token) return back(to, "failed");
    // Google sends a refresh token only on first approval (another device, a cleared cookie): ask again once, with consent.
    if (!retried) return redirect(authUrl(req, env, `${state}.c`, true), [stateCookie(`${state}|${to}`, 600)]);
    return back(to, "failed");
  }
  return back(to, "ok", [cookie(g.refresh_token, MAX_AGE)]);
}

const back = (to, result, cookies = []) => redirect(`${to}/?auth=${result}`, [...cookies, stateCookie("", 0)]);

function redirect(location, cookies) {
  const h = new Headers({ Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
}

/** Fresh access token from the cookie, no window. 401 means sign in again. */
async function refresh(req, env, cors) {
  const rt = readCookie(req, COOKIE);
  if (!rt) return json({ error: "no_session" }, 401, cors);
  const g = await google(env, { grant_type: "refresh_token", refresh_token: rt });
  if (!g.access_token) {
    // Revoked or expired at Google: drop the cookie so the app shows sign-in.
    const gone = g.error === "invalid_grant";
    return json({ error: g.error ?? "refresh_failed" }, gone ? 401 : 502, gone ? { ...cors, "Set-Cookie": cookie("", 0) } : cors);
  }
  // Each use pushes the cookie's expiry out again.
  return json({ access_token: g.access_token, expires_in: g.expires_in }, 200, { ...cors, "Set-Cookie": cookie(rt, MAX_AGE) });
}

async function logout(req, cors) {
  const rt = readCookie(req, COOKIE);
  if (rt) await fetch(GOOGLE_REVOKE, { method: "POST", body: new URLSearchParams({ token: rt }) }).catch(() => {});
  return json({ ok: true }, 200, { ...cors, "Set-Cookie": cookie("", 0) });
}

async function google(env, params) {
  const r = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  return r.json().catch(() => ({}));
}

// Partitioned: set during the redirect (top level liewjiaen.com) and read by the app's fetches from
// the same site, so it lands in the same jar and survives browsers that block third-party cookies.
const cookie = (v, age) => `${COOKIE}=${v}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=None; Partitioned`;
// Lax: sent on Google's top-level redirect back to /callback, never on cross-site requests.
const stateCookie = (v, age) => `${STATE}=${encodeURIComponent(v)}; Path=/callback; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
function readCookie(req, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.get("Cookie") ?? "");
  return m ? m[1] : "";
}
const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });
