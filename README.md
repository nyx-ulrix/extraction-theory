# Extraction Theory

Log every coffee brew and dial in faster. Espresso, filter, ice brew, cold brew, moka pot and Aeropress, with pour phases, chilling, grind settings, a draggable risograph flavour radar and a brew timeline.

- **Three brew-form modes.** *I have a life* (the default for every account) shows only the essentials with starting numbers and plain hints. *I'm a snob* lets you tick which variables to log (TDS and extraction yield, pour durations, water GH/KH, puck prep, pressures and more). *Pretentious* logs everything, takes grind in microns only and needs the water's makeup; untick anything and it locks for 24 hours.
- **Roaster QR codes.** A coffee's page makes a printable card with a QR code holding the coffee, its flavour chart and a recommended recipe. Scanning it (any phone camera, or the in-app scanner) adds both to the scanner's own library. Everything rides in the link's `#fragment`, so nothing is uploaded.
- **Flavour charts.** Tap a note in a chart's legend to see it alone. Export a chart as a PNG.

Your data lives in **your own Google Sheet**. The site signs in with Google (`drive.file` scope, so it only sees the sheet it creates) and talks to the Sheets API from your browser. The only server piece is a tiny Cloudflare Worker that keeps you signed in (below); it never sees your data.

Live at https://extractiontheory.liewjiaen.com

## Run locally

```bash
npm install
cp .env.example .env   # set VITE_AUTH_URL
npm run dev
```

`npm run check` runs the brew maths and sign-in Worker self-checks. `npm run deploy` builds and deploys to Firebase Hosting.

Sign-in on localhost needs the Worker running locally too, because the live Worker's cookie belongs to liewjiaen.com:

```bash
cd auth-worker
echo GOOGLE_CLIENT_SECRET=... > .dev.vars        # gitignored
npx wrangler dev --env dev                       # http://localhost:8787, allows only http://localhost:5180
```

Then run the app with `VITE_AUTH_URL=http://localhost:8787` in `.env`. Add `http://localhost:8787/callback` to the OAuth client's redirect URIs first (it isn't listed yet).

See [plan.md](plan.md) for the full spec, [style.md](style.md) for the design rules and [HANDOVER.md](HANDOVER.md) for where things stand.

## Staying signed in (auth-worker/)

Google only gives a browser app a 1-hour token. `auth-worker/` is a Cloudflare Worker (free plan) that runs Google's full-page sign-in (`/login`, `/callback`), keeps the refresh token in an HttpOnly cookie, and hands the app fresh access tokens (`/refresh`). Sign-in is a full-page redirect, not a popup, because on Android the popup's tab can outlive the app's and the sign-in is lost. The OAuth client must list `https://<worker>/callback` as an authorized redirect URI. The cookie belongs to the Worker's site, so sign-in only sticks on an app origin on the same site (extractiontheory.liewjiaen.com with et-auth.liewjiaen.com); on the Firebase web.app addresses it doesn't. Deploy it once:

```bash
cd auth-worker
npx wrangler deploy                              # set GOOGLE_CLIENT_ID, ALLOWED_ORIGINS and the route in wrangler.toml first
npx wrangler secret put GOOGLE_CLIENT_SECRET     # the OAuth client's secret from Google Cloud
```

When a change touches both, deploy the Worker first, then the site: a site build expects the Worker routes it calls.

What stays on the device: the theme, display preferences, the sheet's ID, a copy of the sheet's coffee data, and unsaved brew, bean or settings edits until they're saved or discarded. Nothing that can sign someone in is stored: the access token and AI keys live only in the open page, and the refresh token sits in the Worker's HttpOnly cookie.

## Bulk import and AI (optional)

Settings, Import takes JSON. Download the import guide there (`src/import-guide.md`) and give it to any AI chat with photos of your bags or your notes; it writes the JSON for you. In the app itself, AI only fills a new bean from bag photos, with your own Claude, OpenAI or Gemini key (kept only in the open page, never stored, sent only to that provider). It reads the label and charts the tasting notes: the roaster's printed flavour axes if the bag has them, otherwise each note scored on your chart's axes, each with a palette colour. Every value stays yours to drag and change.

## License

MIT, by [Jia En](https://liewjiaen.com).
