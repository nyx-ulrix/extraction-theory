# Extraction Theory import guide

Use this to add coffees and brews to Extraction Theory in one go. You can fill the JSON by hand, or give this whole file to an AI chat (with photos of your bags or your brew notes) and ask it to produce the JSON. Then open **Settings → Import**, paste the JSON or choose the file, and press Import.

## Prompt for an AI

> Using the rules in this guide, turn my coffee bags and brew notes into one JSON object for Extraction Theory. Use only what I give you: leave a field out rather than guess. Reply with the JSON only.

## Template

```json
{
  "beans": [
    {
      "ref": "chelbesa",
      "name": "Chelbesa",
      "product": "Chelbesa #3 Organic",
      "roastery": "Sweet Blossom",
      "origin": "Ethiopia, Gedeo",
      "farm": "Chelbesa washing station",
      "altitude_low_m": 1900,
      "altitude_high_m": 2100,
      "variety": "Heirloom",
      "process": "Natural",
      "roast_level": "Light",
      "roast_date": "2026-05-25",
      "roaster_notes": "Fresh mango, strawberry, peach",
      "flavour": {
        "layers": [
          { "note": "Fresh mango", "color": "#E0B85A", "v": { "sweetness": 8, "aroma": 7, "bitterness": 1, "body": 5, "acidity": 5, "finish": 5 } },
          { "note": "Strawberry", "color": "#B85543", "v": { "sweetness": 7, "aroma": 7, "bitterness": 1, "body": 5, "acidity": 6, "finish": 4 } }
        ]
      }
    }
  ],
  "brews": [
    {
      "import_key": "2026-10-23-chelbesa-espresso-1",
      "bean_ref": "chelbesa",
      "brew_date": "2026-10-23T08:30",
      "method": "espresso",
      "grind_setting": "25",
      "dose_g": 15,
      "yield_g": 40,
      "temp_c": 92,
      "total_s": 28,
      "tasting_notes": "Mango, juicy, a little sharp",
      "rating": 4,
      "taste_balance": "sour",
      "changed": "Try 24 clicks"
    },
    {
      "import_key": "2026-10-23-chelbesa-filter-1",
      "bean_ref": "chelbesa",
      "method": "filter",
      "grind_setting": "50",
      "dose_g": 15,
      "water_g": 220,
      "temp_c": 93,
      "phases": [
        { "kind": "pour", "n": 1, "start_s": 0, "water_g": 30, "note": "Bloom" },
        { "kind": "pour", "n": 2, "start_s": 40, "water_g": 80 },
        { "kind": "pour", "n": 3, "start_s": 75, "water_g": 60 },
        { "kind": "pour", "n": 4, "start_s": 105, "water_g": 50 }
      ]
    }
  ]
}
```

## Rules

### Overall

- One JSON object with two lists: `beans` and `brews`. Either list can be empty or left out.
- Up to 500 beans and 2000 brews per import.
- Use only the field names listed below, in lower case exactly as written. Any other field name becomes a new column in your sheet, so don't invent fields.
- Never include `id`, `created`, `days_off_roast`, `grind_clicks` or any `f_` field. The app sets those.
- Values are plain text, numbers or true/false. Text longer than 2000 characters is cut.
- Leave a field out when you don't know it. Don't write "unknown", "N/A" or 0 for missing values.

### Beans

| Field | What it holds |
|---|---|
| `ref` | Your short label for this bean, used only inside this import to link brews to it (for example `chelbesa`). Not saved. |
| `name` | **Required.** The coffee's name: usually the farm, lot or station. |
| `product` | The roaster's own name for it, as printed on the bag. |
| `roastery` | The roaster. |
| `origin` | Country first, then region: `"Ethiopia, Gedeo"`. |
| `farm` | Farm, producer or washing station. |
| `altitude_low_m`, `altitude_high_m` | Numbers in metres. Use the same number twice for a single altitude. |
| `variety` | For example `"Heirloom"`, `"Gesha"`. |
| `process` | One of `Washed`, `Natural`, `Honey`, `Anaerobic`, `Carbonic maceration`, `Wet hulled`, or the roaster's own wording. |
| `roast_level` | One of `Super light`, `Light`, `Medium light`, `Medium`, `Medium dark`, `Dark`. |
| `roast_date` | `YYYY-MM-DD`. Many bags print day and month only: use the most recent past date that fits. |
| `roaster_notes` | The printed tasting notes, comma separated. |
| `frozen`, `frozen_date` | `true` and `YYYY-MM-DD` if the beans were frozen; days off roast then counts only up to that date. |
| `finished` | `true` if the bag is used up. |
| `flavour` | The coffee's spider chart (see Flavour below). One chart per coffee. |

**Updating a coffee that already exists:** add `"match": { "name": "...", "roastery": "..." }` with its current name and roastery (case doesn't matter). The fields you give replace the old ones; fields you leave out stay as they are. Without `match`, a bean whose name and roastery already exist is skipped, never duplicated.

### Flavour (the spider chart)

- `layers`: one layer per tasting note, up to 12. Each has `note` (up to 40 characters), `color` and `v`.
- `v` scores each axis from 0 to 10 in half steps (7, 7.5, 8). The default axes are `sweetness`, `aroma`, `bitterness`, `body`, `acidity`, `finish`.
- **Bitterness and body describe the whole cup, so give every layer the same `bitterness` and the same `body`.**
- `color` is a hex colour like `"#B85543"`. Pick one people link to that flavour; a few that work well:

  | Flavour | Colour |
  |---|---|
  | Red fruit, berries | `#B85543` |
  | Dark berries, plum, grape | `#6F5070` |
  | Floral, jasmine | `#CBAAC3` |
  | Citrus, mango, honey | `#E0B85A` |
  | Peach, apricot, caramel | `#E9AE80` |
  | Chocolate, cocoa | `#4A382B` |
  | Nutty, brown sugar | `#8C7056` |
  | Tea, clean finish | `#3F6E8C` |

- Optional `axes` to use the roaster's own chart instead of the defaults: a list of 3 to 12 `{ "key": "clarity", "label": "Clarity", "color": "#3F6E8C" }`, clockwise from the top. Keys are lower case with underscores. The layers' `v` must then use these keys.

### Brews

| Field | What it holds |
|---|---|
| `import_key` | **Required for every brew.** Any text unique to this brew, for example `"2026-10-23-chelbesa-espresso-1"`. Importing the same key twice is skipped, so re-importing a file never duplicates brews. |
| `bean_ref` | The `ref` of a bean in this same import. |
| `brew_date` | `YYYY-MM-DDTHH:MM` local time. Left out = now. |
| `method` | One of `espresso`, `filter`, `ice` (ice brew), `coldbrew`, `moka`, `aeropress`. |
| `grinder_id` | Leave out: the brew gets the grinder of that coffee's last brew, or your default grinder. |
| `grind_setting` | As text, the way your grinder shows it: `"25"`, or `"2.4.1"` for rotation dials. |
| `grind_um` | Grind size in microns, only if you measured it. |
| `dose_g` | Coffee in, grams. |
| `yield_g` | Espresso only: drink out, grams. |
| `water_g` | Other methods: total water, grams. |
| `ratio` | Optional; the app works it out from dose and yield or water. |
| `temp_c` | Water temperature, °C. |
| `total_s` | Shot or brew time in seconds (2:45 is 165). |
| `paper` | Filter paper as "Brand Model", for example `"Sibarist FAST Cone M"`, `"CAFEC Abaca+ Cone 1 Cup"`, `"Hario V60 02 White"`. |
| `dripper_id` | Leave out; pick the dripper in the app. |
| `water_type` | For example `"K2"`, `"Third Wave Water"`. |
| `serve` | `espresso`, `black` or `milk`. With `black`: `serve_iced` true/false and `serve_water_g`. With `milk`: `milk_drink` (one of `Dirty`, `Cold milk`, `Cold milk with ice`, `Flat white`, `Latte`, `Cappuccino`) and `milk_g`. |
| `chill_method` | `Ice drip`, `Hyperchiller` or `Shaken`. Ice brew: `ice_g` grams of ice, or `ice_max` true for "as much as fits". |
| `tasting_notes` | What you tasted, as text. Brews have no chart of their own. |
| `rating` | 1 to 5. |
| `taste_balance` | `sour`, `balanced` or `bitter`. |
| `taste_strength` | Body of the cup: `low`, `medium_low`, `mid`, `medium_high` or `high`. |
| `changed` | What to change next time. |
| `notes` | Anything else. |
| `dialed_in` | `true` if this is the recipe you settled on. |
| `phases` | Pours and presses, in order (see below). |

Method extras, only for that method: espresso `presoak_s` and `hold_s` (seconds of pre-soak, then hold), `pressure`, `basket`, `puck_prep`; cold brew `cb_method` (`Immersion` or `Slow drip`), `steep_location` (`Fridge` or `Room`), `steep_h`, `drip_rate`, `cb_filter`, `dilution`; moka `pot_size`, `starting_water` (`Preheated` or `Cold`), `heat_level`, `first_flow_s`, `off_heat`, `base_cooled`; Aeropress `orientation` (`Standard` or `Inverted`), `ap_filter` (`Paper x1`, `Paper x2`, `Metal`), `accessory`, `bypass_g`.

### Phases (pours and presses)

- `kind`: `pour` or `press` (Aeropress). `n`: 1, 2, 3 in order.
- `water_g` is the water added in that pour, not the scale reading. Scale readings of 30, 110, 170, 220 mean pours of 30, 80, 60, 50.
- `start_s` seconds from the start; `temp_c`; `duration_s` for presses.
- `agitation`: `None`, `Swirl`, `Stir`, `Rao spin` or `Tap`, with `agitation_timing` `before`, `during` or `after`.
- `valve`: `open` or `closed` (for switch drippers). `note`: short text, for example `"Bloom"`.

### Changing or removing brews you imported before

- Same `import_key` plus `"update": true` changes that brew: the fields you give replace the old ones. Phases can't be changed this way.
- Same `import_key` plus `"delete": true` removes that brew and its phases. To replace a brew completely, delete it and add it again with the same key, in the same import.

### Not allowed

- Inventing values the bag or notes don't give (altitudes, farms, dates, scores).
- Fields not listed in this guide, nested objects other than `flavour`, `match` and `phases`, or lists other than `beans`, `brews`, `layers`, `axes` and `phases`.
- Different `bitterness` or `body` values on layers of the same coffee.
- Scores outside 0 to 10, more than 12 layers, or notes longer than 40 characters.
- Two brews with the same `import_key` in one file, unless the first one is a delete.
