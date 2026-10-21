# Extraction Theory

Log every coffee brew and dial in faster. Espresso, filter, ice brew, cold brew, moka pot and Aeropress, with pour phases, chilling, grind settings, a draggable flavour radar and a brew timeline.

Your data lives in **your own Google Sheet**. There is no server: the site signs in with Google (`drive.file` scope, so it only sees the sheet it creates) and talks to the Sheets API from your browser.

Live at https://extractiontheory.liewjiaen.com

## Run locally

```bash
npm install
cp .env.example .env   # set VITE_GOOGLE_CLIENT_ID
npm run dev
```

`npm run check` runs the brew maths self-check. `npm run deploy` builds and deploys to Firebase Hosting.

See [plan.md](plan.md) for the full spec and [style.md](style.md) for the design rules.

## Flavour AI (optional)

Paste your own Claude, OpenAI or Gemini key in Settings and each tasting note gets a colour picked from the palette (cheapest model by default). AI does nothing else: you shape the radar yourself. The key stays in your browser's local storage and is sent only to that provider.

## License

MIT, by [Jia En](https://liewjiaen.com).
