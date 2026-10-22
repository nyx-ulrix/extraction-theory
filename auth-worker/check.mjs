// Self-check for the sign-in redirect flow: node auth-worker/check.mjs. Google's token endpoint is stubbed.
import assert from "node:assert/strict";
import worker from "./index.js";

const APP = "https://extractiontheory.liewjiaen.com";
const W = "https://et-auth.liewjiaen.com";
const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", ALLOWED_ORIGINS: `${APP}, http://localhost:5180` };
let google = {};
globalThis.fetch = async () => new Response(JSON.stringify(google));

const get = (path, cookie = "") => worker.fetch(new Request(W + path, { headers: cookie ? { Cookie: cookie } : {} }), env);
const loc = (r) => r.headers.get("Location");
const cookies = (r) => r.headers.getSetCookie();

// /login: only the app's origins, and a state cookie scoped to /callback.
assert.equal((await get(`/login?return=${encodeURIComponent("https://evil.example")}`)).status, 403);
const start = await get(`/login?return=${encodeURIComponent(APP)}`);
assert.equal(start.status, 302);
const g = new URL(loc(start));
assert.equal(g.origin + g.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
assert.equal(g.searchParams.get("redirect_uri"), `${W}/callback`);
assert.equal(g.searchParams.get("access_type"), "offline");
assert.equal(g.searchParams.get("prompt"), null);
const state = g.searchParams.get("state");
const st = cookies(start)[0];
assert.match(st, /^et_st=.+; Path=\/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
const jar = st.split(";")[0];

// Without the state cookie, or with someone else's state, nothing is exchanged.
assert.equal(loc(await get(`/callback?state=${state}&code=c`)), `${APP}/?auth=expired`);
assert.equal(loc(await get(`/callback?state=forged&code=c`, jar)), `${APP}/?auth=expired`);
assert.equal(loc(await get(`/callback?state=${state}&error=access_denied`, jar)), `${APP}/?auth=cancelled`);

// Refresh token: into the cookie, state cookie cleared, back to the app.
google = { access_token: "at", refresh_token: "rt" };
const ok = await get(`/callback?state=${state}&code=c`, jar);
assert.equal(loc(ok), `${APP}/?auth=ok`);
assert.ok(cookies(ok).some((c) => c.startsWith("et_rt=rt;") && c.includes("HttpOnly") && c.includes("Partitioned")));
assert.ok(cookies(ok).some((c) => c.startsWith("et_st=;") && c.includes("Max-Age=0")));

// No refresh token (approved before): ask once more with consent, then give up.
google = { access_token: "at" };
const again = await get(`/callback?state=${state}&code=c`, jar);
const g2 = new URL(loc(again));
assert.equal(g2.searchParams.get("prompt"), "consent");
assert.equal(g2.searchParams.get("state"), `${state}.c`);
assert.equal(loc(await get(`/callback?state=${state}.c&code=c`, jar)), `${APP}/?auth=failed`);

// Google error on exchange, and a mangled cookie.
google = { error: "invalid_grant" };
assert.equal(loc(await get(`/callback?state=${state}&code=c`, jar)), `${APP}/?auth=failed`);
assert.equal(loc(await get(`/callback?state=x&code=c`, "et_st=%E0%A4%A")), `${APP}/?auth=server_error`);

// The token endpoints still refuse other sites.
const post = (path, origin, cookie = "") => worker.fetch(new Request(W + path, { method: "POST", headers: { Origin: origin, ...(cookie && { Cookie: cookie }) } }), env);
assert.equal((await post("/refresh", "https://evil.example", "et_rt=rt")).status, 403);
assert.equal((await post("/exchange", APP)).status, 404);
google = { access_token: "at2", expires_in: 3599 };
const fresh = await post("/refresh", APP, "et_rt=rt");
assert.equal(fresh.status, 200);
assert.equal((await fresh.json()).access_token, "at2");

console.log("auth-worker check: ok");
