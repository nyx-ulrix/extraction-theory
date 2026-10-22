# Extraction Theory

Log every coffee brew and dial in faster. Espresso, filter, ice brew, cold brew, moka pot and Aeropress, with pour phases, chilling, grind settings, a draggable flavour radar and a brew timeline.

Your data lives in **your own Google Sheet**. The site signs in with Google (`drive.file` scope, so it only sees the sheet it creates) and talks to the Sheets API from your browser. The only server piece is a tiny Cloudflare Worker that keeps you signed in (below); it never sees your data.

Live at https://extractiontheory.liewjiaen.com

## Run locally

```bash
npm install
cp .env.example .env   # set VITE_GOOGLE_CLIENT_ID and VITE_AUTH_URL
npm run dev
```

`npm run check` runs the brew maths self-check. `npm run deploy` builds and deploys to Firebase Hosting.

See [plan.md](plan.md) for the full spec and [style.md](style.md) for the design rules.

## Staying signed in (auth-worker/)

Google only gives a browser app a 1-hour token. `auth-worker/` is a Cloudflare Worker (free plan) that trades the sign-in code for a refresh token, keeps it in an HttpOnly cookie, and hands the app fresh access tokens. Deploy it once:

```bash
cd auth-worker
npx wrangler deploy                              # set GOOGLE_CLIENT_ID, ALLOWED_ORIGINS and the route in wrangler.toml first
npx wrangler secret put GOOGLE_CLIENT_SECRET     # the OAuth client's secret from Google Cloud
```

## Flavour AI (optional)

Paste your own Claude, OpenAI or Gemini key in Settings and each tasting note gets a colour picked from the palette (cheapest model by default). AI does nothing else: you shape the radar yourself. The key stays in your browser's local storage and is sent only to that provider.

## License

MIT, by [Jia En](https://liewjiaen.com).
