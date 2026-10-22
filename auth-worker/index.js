// Extraction Theory sign-in helper (Cloudflare Worker).
// Google gives a browser-only app a 1-hour access token and nothing to renew it with. This Worker
// holds the one thing that can: it trades the sign-in code for a refresh token, keeps that token in
// an HttpOnly cookie the page can never read, and hands the app fresh access tokens on request.
// Secrets (wrangler secret put): GOOGLE_CLIENT_SECRET. Vars (wrangler.toml): GOOGLE_CLIENT_ID, ALLOWED_ORIGINS.

const COOKIE = "et_rt";
const MAX_AGE = 180 * 24 * 3600; // Google drops refresh tokens unused for 6 months
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).includes(origin);
    const cors = allowed
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
      : { Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    // Only the app's own pages may call this; browsers always send Origin on these cross-origin POSTs.
    if (!allowed || req.method !== "POST") return json({ error: "forbidden" }, 403, cors);

    const path = new URL(req.url).pathname;
    try {
      if (path === "/exchange") return await exchange(req, env, cors);
      if (path === "/refresh") return await refresh(req, env, cors);
      if (path === "/logout") return await logout(req, cors);
      return json({ error: "not_found" }, 404, cors);
    } catch {
      return json({ error: "server_error" }, 502, cors);
    }
  },
};

/** Sign-in code from Google's popup -> access token for the app, refresh token into the cookie. */
async function exchange(req, env, cors) {
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== "string" || !code) return json({ error: "bad_request" }, 400, cors);
  const g = await google(env, { grant_type: "authorization_code", code, redirect_uri: "postmessage" });
  if (!g.access_token) return json({ error: g.error ?? "exchange_failed" }, 400, cors);
  // Google only sends a refresh token on a fresh offline grant; keep any cookie already set otherwise.
  const headers = g.refresh_token ? { ...cors, "Set-Cookie": cookie(g.refresh_token, MAX_AGE) } : cors;
  return json({ access_token: g.access_token, expires_in: g.expires_in, stay: !!g.refresh_token || !!readCookie(req) }, 200, headers);
}

/** Fresh access token from the cookie, no popup. 401 means sign in again. */
async function refresh(req, env, cors) {
  const rt = readCookie(req);
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
  const rt = readCookie(req);
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

// Partitioned: the cookie lives in the app site's own jar, so it works from both app domains and
// survives browsers that block ordinary third-party cookies.
const cookie = (v, age) => `${COOKIE}=${v}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=None; Partitioned`;
function readCookie(req) {
  const m = /(?:^|;\s*)et_rt=([^;]+)/.exec(req.headers.get("Cookie") ?? "");
  return m ? m[1] : "";
}
const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });
