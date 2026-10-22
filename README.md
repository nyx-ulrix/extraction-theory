# Extraction Theory

Log every coffee brew and dial in faster. Espresso, filter, ice brew, cold brew, moka pot and Aeropress, with pour phases, chilling, grind settings, a draggable flavour radar and a brew timeline.

Your data lives in **your own Google Sheet**. The site signs in with Google (`drive.file` scope, so it only sees the sheet it creates) and talks to the Sheets API from your browser. The only server piece is a tiny Cloudflare Worker that keeps you signed in (below); it never sees your data.

Live at https://extractiontheory.liewjiaen.com

## Run locally

```bash
npm install
cp .env.example .env   # set VITE_AUTH_URL
npm run dev
```

`npm run check` runs the brew maths self-check. `npm run deploy` builds and deploys to Firebase Hosting.

See [plan.md](plan.md) for the full spec and [style.md](style.md) for the design rules.

## Staying signed in (auth-worker/)

Google only gives a browser app a 1-hour token. `auth-worker/` is a Cloudflare Worker (free plan) that runs Google's full-page sign-in (`/login`, `/callback`), keeps the refresh token in an HttpOnly cookie, and hands the app fresh access tokens. The OAuth client must list `https://<worker>/callback` as an authorized redirect URI. The cookie belongs to the Worker's site, so sign-in only sticks on an app origin on the same site (extractiontheory.liewjiaen.com with et-auth.liewjiaen.com). Deploy it once:

```bash
cd auth-worker
npx wrangler deploy                              # set GOOGLE_CLIENT_ID, ALLOWED_ORIGINS and the route in wrangler.toml first
npx wrangler secret put GOOGLE_CLIENT_SECRET     # the OAuth client's secret from Google Cloud
```

## Bulk import and AI (optional)

Settings, Import takes JSON. Download the import guide there (`src/import-guide.md`) and give it to any AI chat with photos of your bags or your notes; it writes the JSON for you. In the app itself, AI only fills a new bean from bag photos, with your own Claude, OpenAI or Gemini key (stored in your browser, sent only to that provider). You shape the radar and pick colours yourself.

## License

MIT, by [Jia En](https://liewjiaen.com).
