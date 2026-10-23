# Handover

Where Extraction Theory stands, for whoever picks it up next. The full spec is [plan.md](plan.md); the design rules are [style.md](style.md).

## What it is

A coffee brew log and dial-in tracker. React 19, TypeScript and Vite, with no app server. Each person's data lives in their own Google Sheet (scope `drive.file`, so the app only sees the sheet it created), read and written from the browser.

| Piece | Where |
|---|---|
| Live site | https://extractiontheory.liewjiaen.com (also extraction-theory.web.app; sign-in only sticks on the custom domain) |
| Hosting | Firebase Hosting, project `extraction-theory` (`npm run deploy`) |
| Sign-in Worker | Cloudflare Worker `extraction-theory-auth` at et-auth.liewjiaen.com (`auth-worker/`) |
| Repo | https://github.com/nyx-ulrix/extraction-theory (public, MIT) |
| Portfolio entry | liewjiaen.com, slot 1 (repo nyx-ulrix/liewjiaen.com) |

## How it fits together

- **Sign-in**: a full-page redirect. The app goes to the Worker's `/login`, then Google, then the Worker's `/callback`. The Worker keeps the refresh token in an HttpOnly cookie, and the app gets 1-hour access tokens from `/refresh`. The client secret is a Worker secret only. When a change touches both, deploy the Worker first, then the site.
- **Data**: `src/store.ts` and `src/sheets.ts` (tabs Beans, Brews, Phases, Gear, Methods, Settings; writes use `RAW`, so nothing becomes a formula). The schema is `src/schema.ts`. `loadDb` runs one-off migrations, guarded by Settings rows such as `fields_v2`.
- **Brew form**: `src/views/Brew.tsx` with `src/components/brew/*`. `layoutFor` and `shows()` in `schema.ts` decide what each mode shows.
- **Modes**:
  - *I have a life* (`basic`): the default for every account, with starting numbers and hints.
  - *I'm a snob* (`advanced`): a checklist of variables to log.
  - *Pretentious*: everything on, microns only, water GH and KH required. Unticking anything asks to step down and locks Pretentious for 24 hours (`pretentious_lock`).
- **Charts**: risograph radar and blob (`Radar.tsx`, `Fingerprint.tsx`, `palette.ts` `ink()`). Tap a legend note to see it alone. PNG export is in `ExportChart.tsx`.
- **AI** (`src/ai.ts`): fills a new bean from up to two bag photos with the user's own key (Claude, OpenAI or Gemini; kept in memory only). It also charts the notes: the roaster's printed axes if the bag has them, otherwise scored on the coffee's axes, with a palette colour per note.
- **Roaster QR codes** (`src/share.ts`, `src/components/qr.ts`, `src/views/Share.tsx`):
  - A coffee plus a recommended recipe travels in the link's `#s=` fragment as deflated, compacted JSON. No backend is involved.
  - The QR is drawn in the site's dot style with accent finder eyes, at medium error correction.
  - The scanner uses BarcodeDetector (Chrome on Android), with a paste-a-link fallback.
  - Decoded codes are untrusted: lengths are capped and recipe fields are whitelisted.

## Sign-in and what stays on the device

Rebuilt on 2026-10-22/23, after a tester on Android needed three taps to sign up: the old Google popup's tab could outlive the app's, and the sign-in was lost.
- **State check:** `/login` sets a one-time cookie, so a forged or replayed `/callback` is ignored and only sends you back to the app with `?auth=expired`.
- **Another device:** if Google sends no refresh token (the user approved the app before, say elsewhere), the Worker asks once more with the consent screen, so every device stays signed in.
- **Google console:** the "Extraction Theory web" OAuth client lists `https://et-auth.liewjiaen.com/callback`. The consent screen must stay In production: in Testing, Google expires refresh tokens after 7 days.
- **Kept on the device:** theme, display preferences, the sheet ID, a copy of the sheet's coffee data, and unsaved brew, bean or settings edits (`et.draft`, `et.form.bean`, `et.form.settings`). Those edits come back after a reload or the trip to Google's sign-in page, and are dropped on save or discard.
- **Never stored:** anything that can sign someone in. The access token and AI keys live only in the open page, and older versions' stored keys and tokens are wiped on load. The refresh token is in the Worker's HttpOnly, partitioned cookie.
- **Sheet lookup:** the app finds its sheet without filtering on the name, so renaming it in Drive is safe. A sheet whose first-time setup was cut short gets its headers and starting rows on the next load.
- **Check a deploy:** `curl -s -X POST -H "Origin: https://extractiontheory.liewjiaen.com" https://et-auth.liewjiaen.com/refresh` should answer `{"error":"no_session"}`.
- **Test signed-in screens without signing in:** in the dev server, set `et.known=1` and a fake `et.cache` (`{id, headers, beans, gear, fields, brews, phases, settings}`) in localStorage, then reload.
- **Logins are the owner's:** a login-manager hook blocks Claude from `firebase login`, `wrangler login` and account switches. `GOOGLE_CLIENT_SECRET` is only a Wrangler secret.

## Working rules (from the owner)

- Commit, push and deploy after each change. Commits never credit Claude.
- Run a Fable audit after each finished feature, and keep plan.md and style.md current.
- Prefer dropdowns: put as much detail as possible into selects of past values plus "Other", and into closed folds with a one-line summary.
- Several Claude sessions may work in this folder at once. Stage only your own files (never `git add -A` without checking `git status`), and don't deploy someone else's unfinished change.

## Open items

- Taste-skill UI audit of the latest screens.
- Real-device sign-in test: Android first-time sign-up, iPhone home-screen app.
- The privacy page's AI paragraph still says keys are used only to pick note colours. AI now reads bag photos and charts the notes, so that sentence needs rewriting.
- AI keys are forgotten on every reload, including the trip to Google's sign-in page (the "never store keys on the device" rule). If that proves annoying, a key kept for the browser session is the alternative, but it would sit on the device, so it's the owner's call.
- On web.app and firebaseapp.com, sign-in doesn't stick: the cookie belongs to liewjiaen.com. Redirecting those addresses to the custom domain would fix it. Left on purpose.
- Expected behaviour: while offline, a tap shows "Google session expired" rather than an offline notice. Two tabs signing up a brand-new account at the same moment can create two sheets; the app uses the oldest.
- The in-app QR scanner only works where BarcodeDetector exists. Elsewhere people use the phone camera, which opens the link anyway.
- Pour notes are deliberately left out of shared codes (they're the brewer's own).

## Checks

- `npm run check`: brew maths and sign-in Worker self-checks.
- `npx tsc --noEmit -p .` and `npm run build` before every deploy.
