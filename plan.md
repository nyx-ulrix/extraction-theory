# Extraction Theory: Plan

A personal brew log and calibration history. Every brew, bean and setting lives in **your own Google Sheet**. The app is a static React site on Firebase Hosting at `https://extractiontheory.liewjiaen.com` (also `https://extraction-theory.web.app`).

Public repo `nyx-ulrix/extraction-theory`, MIT licence. Commits never credit Claude.

## 1. Architecture

| Piece | Choice | Why |
|---|---|---|
| Front end | React 19 + TypeScript + Vite, plain CSS tokens | Small, fast, no UI framework to fight the brutalist design |
| Hosting | Firebase Hosting (static `dist/`), project id `extraction-theory` | Free tier, HTTPS, custom domain |
| Domain | `extractiontheory.liewjiaen.com` (Cloudflare DNS, proxy off) | Root `liewjiaen.com` is the portfolio on GitHub Pages and stays untouched |
| Auth | Google Identity Services token client, scope `drive.file` | The app can only see files it created. No backend, no secrets in the bundle |
| Storage | Google Sheets API v4 + Drive API v3 (find the sheet on any device) | Sheet is human readable and yours |
| Flavour AI | User key for Claude, OpenAI or Gemini, called from the browser | Key stays in that browser's local storage, never in the sheet or repo |

There is no server. The OAuth web client ID is public by design and is the only config value (`VITE_GOOGLE_CLIENT_ID` in `.env`). The client secret is unused.

### Credentials and Google setup (done)
1. Firebase project `extraction-theory`.
2. Google Cloud console for that project:
   - **Google Sheets API** and **Google Drive API** enabled.
   - Google Auth Platform: Audience **External**, **published to production**. No verification needed because the only scope is `.../auth/drive.file` and the consent screen has no logo. Adding a consent-screen logo or any sensitive scope would trigger Google verification.
   - Branding: home page `https://extractiontheory.liewjiaen.com`, privacy `/privacy.html`, terms `/terms.html` (both on the subdomain). Authorized domains: `liewjiaen.com`, `extraction-theory.web.app`, `extraction-theory.firebaseapp.com`.
   - Clients, Web application. Authorized JavaScript origins: `https://extractiontheory.liewjiaen.com`, `https://extraction-theory.web.app`, `https://extraction-theory.firebaseapp.com`, `http://localhost:5173`.
3. Firebase console, Hosting, Add custom domain `extractiontheory.liewjiaen.com`, then add the records it shows in Cloudflare DNS with **proxy off** (grey cloud) so Firebase can issue the certificate (pending, see section 11).

## 2. Spreadsheet: "Extraction Theory"

All writes use `valueInputOption=RAW` (no formula injection, numbers stay numbers). Dates are written as Sheets serial numbers and the columns are formatted as dates. Columns are matched **by header name**, so you can reorder or add columns in the sheet without breaking the app; missing columns are appended automatically. Column lists live in `src/schema.ts` (`TABS`).

| Tab | Purpose |
|---|---|
| Beans | One row per bag |
| Gear | Grinders, drippers, filter papers (`DEFAULT_GEAR` seeded, "Other" entries appended) |
| Methods | Extra simple fields per mode (add rows to add fields or a whole new mode) |
| Brews | One row per brew. Append-only calibration history |
| Phases | One row per pour phase or press phase, linked by `brew_id` |
| Settings | Key / value app preferences (not the API key) |

Radar data: Beans and Brews each have a JSON column `flavour` holding `{axes, layers}`, plus `f_<axis key>` columns with the overall profile (max across layers) so the sheet can be charted. Custom axes add their own `f_` columns.

## 3. Modes (built in)

Espresso, Filter, Ice brew, Cold brew, Moka Pot, Aeropress. A custom mode can be added by adding rows to the Methods tab; it gets the common fields plus a water ratio.

## 4. Parameters

### Beans
Bean name, Roastery (column `roastery`), origin, farm / producer, altitude low and high (m), variety, process (dropdown + Other), roast level, roast date, roaster's tasting notes, flavour radar (own axes and note layers, see section 6).

### Common to every brew
Brew date and time (defaults to now), bean, grinder (dropdown + Other), grind setting (decimal, or `r.n.c` on rotation dials) or grind size in microns (see Grinders), dose (g), ratio (any two of dose, water or yield and ratio fill the third), water temp (C), total time, water used (optional), days off roast (calculated), tasting notes, flavour radar, taste balance (sour / balanced / bitter), strength (weak / balanced / strong), rating 1-5, what changed, notes, dialed in.

### Grinders
Seeded in `DEFAULT_GEAR`:

| Brand | Models | um per step |
|---|---|---|
| Comandante | C40 MK4, C40 MK3 | 30 per click (retailer-quoted) |
| Comandante | C40 + Red Clix | 15 per click (retailer-quoted) |
| 1Zpresso | J-Ultra, J-Max, JX-Pro, JX, K-Ultra, K-Max, K-Plus, K-Pro, ZP6 Special, X-Ultra, X-Pro, Q2, Q Air | Official figures, rotation dial geometry (`r.n.c` input) |
| Timemore | Chestnut C2, C3, C3S, C3 ESP Pro, S3 | Blank (no official figures, sources conflict) |
| Timemore | Sculptor 064, Sculptor 078 | Stepless |

Micron estimate = zero point + clicks x um per step. Both are editable per grinder in Settings.

### Espresso
Yield (g), shot time, preinfusion (s), pressure / profile, basket, puck prep, optional extract chilling.

### Filter
Dripper (dropdown + Other), dripper style (Immersion / Hybrid / Percolation), filter paper (dropdown + Other), pour phases, drain at (immersion, or hybrid ending closed), optional extract chilling, total time.

Drippers: a new dripper must be given a style on a 3-stop slider (Immersion, Hybrid, Percolation) that starts unset. Defaults: Percolation: V60, Kalita Wave, Origami, Chemex, April, Orea, Melitta, Kono. Hybrid: Hario Switch, NextLevel Pulsar, Orea Switch. Immersion: Clever Dripper.

### Ice brew
Everything in Filter plus required chilling, ice amount or "as much ice as possible", brew ratio (hot water / dose) and final ratio ((hot water + ice) / dose). Ratio assist splits a final ratio into hot water and ice by ice percentage.

### Cold brew
Method (immersion / slow drip), starting steep temp (C), steep location (fridge / room), steep time (h), drip rate (drops per 10 s, slow drip only), filter, dilution (concentrate : water).

### Moka Pot
Pot size (cups), water (g), starting water (preheated / cold), heat level, time to first flow, total time, taken off heat (at first sputter / before sputter), base cooled.

### Aeropress
Orientation, filter (paper x1 / paper x2 / metal / Other), cap accessory, pour phases, press phases (count, start, duration, note), steep time (derived: first press start), total time (derived: end of last press), bypass water (g).

### Pour phase row (Filter, Ice brew, Aeropress)
Start time, water (entered per pour or as a target weight, stored as grams per pour), water temp (defaults to the brew temp), agitation (none / swirl / stir / Rao spin / tap / Other), agitation timing (before / during / after pour / at a time), agitation count, valve open or closed (hybrid drippers). Phase 1 is the bloom.

### Chilling (Ice brew required, Espresso and Filter optional)
Method (Ice drip / Hyperchiller / Shaken / Other), ice (g) or "as much ice as possible", chill start and chill stop stage: brew start, start of phase N, a time, a yield in grams (espresso), end of brew, after brew.

## 5. Assists
- **Ratio solver**: the two most recently edited of dose, liquid and ratio set the third.
- **Pour splitter**: pattern like `4:6`, `1:2:3:3`, `2:2:2:2:2`, decimals allowed. Whole grams, leftover on the last pour. The pattern's first part is the bloom (no separate bloom setting). Optional pour interval for start times. Named presets in Settings.
- **Prefill**: picking a bean and mode loads your last brew of that pair, minus notes and rating.
- **Draft autosave**: the brew form is saved to local storage until it is logged.

## 6. Visuals
- **Flavour radar**:
  - Default axis template, clockwise from the top: Sweetness `#E5A396` (Ember 200), Aroma `#CBAAC3` (Plum 200), Bitterness `#7A4025` (Copper 600), Body `#0A0A0A` (Ink), Acidity `#FBE8A6` (Gold 100), Finish `#3F6E8C` (Info); all from the 64-colour palette. Coloured dot per axis, labels set around the ring.
  - Template editable in Settings (labels, colours, 3 to 12 axes). Each bean and each brew can carry its own axes (different labels and count per coffee).
  - Every tasting note typed becomes its own see-through layer automatically (fill 35% opacity, solid stroke). Starter values: 5 on an axis whose label matches the note, 2 elsewhere, else 3 everywhere. The user sets the real shape by dragging. Colour comes from the 64-colour Caffalyst palette: AI picked when a key is set, otherwise a stable palette colour from the note name. The user can override any colour; a hand-picked colour is never auto-replaced.
  - Five concentric rings (2, 4, 6, 8, 10). Values 0 to 10 in half steps, so points can sit between rings.
  - Each layer's points can be dragged along the axes (mouse, touch, keyboard) to show which way a note leans.
  - Overlay roaster vs brew or brew vs brew.
  - Shared axes (Bitterness and Body by default, toggled per axis with the link button): they describe the whole cup, so dragging one moves every note layer together, and new notes start at the shared value. Toggling the link in Settings also updates every existing bean and brew that carries its own copy of that axis (a newly linked axis takes the first note's value); the link button in a coffee's own Edit axes changes only that coffee.
  - Chart style (Settings > Flavour chart), set separately for Home and Library cards, coffee pages, and brews and note editors: spider or blob (cards and coffee pages), sharp or rounded shape, chart lines on or off. Coffee pages can also switch these on the page itself. A chart with no notes always shows its empty rings and axis dots.
- **Brew timeline**: lanes for water (bars per phase, colour by temp, running total line), agitation, valve, press, chilling, events. Two brews can be stacked on one time axis for comparison.
- **Cup fingerprint**: once a brew's spider chart exists, its note layers are redrawn as small smooth see-through shapes, a visual fingerprint of that cup, at the top of the brew detail and beside each brew in History. No AI is involved. The sign-in screen has no hero image (logo only in the wordmark).

## 7. AI (your own key) and bulk import
AI does one small job: reading a bean bag's label from up to two photos (front and back) to fill the bean form, with the user's own key (Claude `claude-haiku-5-5` thinking off, OpenAI `gpt-5-nano`, or Gemini `gemini-2.5-flash-lite`, all with a structured-JSON schema). It never sets radar values or colours: note colours come from the 64-colour palette (a stable colour per note name) and the user's own picks.

Bulk import: Settings, Import shows the JSON format and offers `src/import-guide.md` as a download. The guide is written so any AI chat can turn bag photos or notes into valid import JSON (allowed fields, values, dates, flavour layers with shared bitterness and body, phases as added water, match / update / delete, and what is not allowed).

## 8. Settings
- Pour entry style (per pour / target weight; stored per pour either way).
- Grind input shown first (setting / microns).
- Split presets: 4:6 Kasuya (`2:2:2:2:2`), `1:2:3:3`, even thirds.
- Radar axis template.
- Brew form mode (every account starts on Normal human):
  - Normal human: the essentials per method (grind, dose and ratio, temperature; pour-overs add pours, dripper and paper; espresso adds shot time), with starting-number placeholders and plain hints.
  - I'm a snob: the "Variables to log" checklist (TDS and extraction yield, pour durations, RDT and grinder RPM, astringency, water GH/KH, espresso first drops, pressures, tamp, puck screen, WDT, and more) and the layout below.
  - Pretentious: every variable on, grind in microns only, no brew logged without water, GH and KH. Unticking anything asks "Not pretentious enough": step down to I'm a snob or Normal human, and Pretentious stays locked for 24 hours.
- Brew form layout per method: choose visible sections / fields and their order. Bean, recipe and (ice brew) chilling are required.
- Drippers and their style sliders.
- Grinders: um per step and zero point.
- Flavour AI: provider, model, key.
- Theme.
- Sign out.
- Footer credit "Created by Jia En" linking `https://liewjiaen.com`, `https://github.com/nyx-ulrix`, `https://www.linkedin.com/in/malcolmliewjiaen/`.

## 9. UI
Staying signed in: Google gives a browser-only app a 1-hour access token and no refresh token, so sign-in uses Google's code flow and a small Cloudflare Worker (`auth-worker/`, at et-auth.liewjiaen.com, free plan). The Worker trades the sign-in code for a refresh token with the client secret (a Worker secret, never in the repo), keeps it in an HttpOnly, Secure, partitioned cookie, and hands the app fresh access tokens on `/refresh`; only the app's own origins may call it. The app also keeps the last copy of the sheet on the device (`et.cache`, cleared on sign out), so it always opens straight into your coffees; if the Worker can't renew, the next tap opens Google's window instead (the code flow shows Google's consent screen each time). The cookie is first-party on extractiontheory.liewjiaen.com (same site as the Worker); on the Firebase web.app address it relies on partitioned cookies (Chrome 114+, Firefox 131+, Safari 18.4+). The OAuth consent screen must stay In production: in Testing, Google expires refresh tokens after 7 days.
Home and Library shelves: card or list view, a Filters panel (roaster, origin, process, and Available / Finished in the Library) and a Sort panel (last brewed, name, date added, date roasted; dates newest first), each opened from the bar above the cards. View and sort are remembered per shelf on the device.
Swiss-brutalist Caffalyst tokens (see `style.md`). Icon-only buttons with tooltips wherever possible (Phosphor), one primary text button per view. Bottom tab bar on phones, top nav on tablet and laptop, two-column brew form with sticky preview on laptop. App icon is the coffee-flower line art (favicon, header logo, home-screen icon), not uploaded to the Google consent screen.
Installable as an app (PWA): the service worker passes page loads through (network only, offline notice), so Chrome offers its install prompt; an Install app button shows on Home when it does. Startup screen follows the theme (logo on white, or white logo on black) before the app loads. The Android launch splash can only have one colour, so it is dark: #131312 with the white-flower icon.

## 10. Process
- Each finished feature is audited by a Fable model agent (code).
- The UI flow is audited against the taste skill.
- graphify knowledge graph in `graphify-out/` (gitignored).

## 11. Build steps and status
- [x] Brew maths and self-check (`npm run check`)
- [x] Firebase project `extraction-theory`
- [x] Sheets API and Drive API enabled
- [x] OAuth consent published to production
- [x] Sheet schema, Google auth, Sheets and AI layer
- [ ] UI: brew form, phases, chilling, radar, timeline, history, compare, beans, settings (in progress)
- [ ] Audits: Fable code audit and taste-skill UI audit
- [ ] Browser test on phone, tablet and laptop widths
- [ ] Push to public GitHub repo
- [ ] Firebase deploy and custom domain

## 12. Known limits
- Online only. A failed save keeps the draft (autosaved locally); offline queueing can come later.
- No in-app delete; delete the row in the sheet.
- Grinder micron figures are nominal burr travel from manufacturer or retailer specs, not particle size.
