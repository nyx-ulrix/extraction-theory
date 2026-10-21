# Extraction Theory: Style

Based on the Caffalyst UI design system brief (tokens, type and geometry; its bloom graphic is not used): minimalist editorial, Swiss-brutalist. A clean poster: tiny tracked labels, monospace voice, square boxes.

## 1. Principles
1. **Colour lives in the data.** Only graphics carry colour: the radar and cup fingerprint use the axis and note colours; the timeline uses the graphic series. UI chrome is ink and paper. No hero image on the sign-in screen; the small coffee-flower logo sits in the wordmark.
2. **Square geometry.** `border-radius: 0` everywhere. No shadows.
3. **Flat contrast.** 1px borders and solid fills only.
4. **Tracked caps for labels only.** Never for paragraphs.
5. **One typeface.** Space Mono is the primary font everywhere; hierarchy comes from size, weight and tracking, not a second family.
6. **Short copy.** Plain functional sentences. No em dashes or en dashes anywhere in the UI; use a hyphen. Empty values show `-`.
7. **No decoration for its own sake.** No numbered section eyebrows, no status dots, no scroll cues.

## 2. Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#FFFFFF` Paper | `#131312` Carbon |
| `--bg-subtle` | `#FAFAF8` | `#1B1A19` Charcoal |
| `--surface` | `#F3F2EF` Bone | `#262523` Graphite |
| `--border` | `#0A0A0A` Ink | `#F3F2EF` Bone |
| `--border-soft` | `#E8E6E1` Fog | `#444240` Stone 700 |
| `--text-strong` | `#0A0A0A` | `#FFFFFF` |
| `--text` | `#7A766E` Stone 500 (4.5:1) | `#B8B4AB` Stone 300 |
| `--text-muted` | `#9A968D` Stone 400 (decorative only) | `#7A766E` |
| `--accent` | `#8F3326` Ember 500 | `#D17B6B` Ember 300 |
| `--btn-bg` / `--btn-text` | Ink / Paper | Bone / Ink |
| `--btn-hover` | Ember 500 | Gold 300 |
| `--focus` | Ember 500 | Gold 300 |

Graphic series (timeline, compare overlays): Ember, Gold, Plum, Copper. Light: `#B85543`, `#C99A3C`, `#8E6A8C`, `#C27040`. Dark: `#D17B6B`, `#F2D275`, `#B088A8`, `#E9AE80`. Fills at 0.35 opacity, strokes solid.

Status: Success `#4F7F52` / dark `#7FB083`, Warning `#D99A1E` / `#E8B454`, Error `#C0392B` / `#E5776A`, Info `#3F6E8C` / `#6FA3C4` (also used for chilling bands).

Theme: saved choice, else `prefers-color-scheme`. Set as `data-theme` on `<html>`.

## 3. Typography

| Role | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Wordmark | Space Mono | 16px | 700 | 0.02em |
| View title | Space Mono | 28px (40px laptop) | 700 | 0 |
| Section heading | Space Mono | 18px | 700 | 0 |
| Tagline / eyebrow | Space Mono, caps, `--text` grey | 16px | 400 | 0.2em |
| Field label | Space Mono, caps | 11px | 400 | 0.2em |
| Body / inputs | Space Mono | 15px (16px on phone inputs, avoids iOS zoom) | 400 | 0.02em |
| Buttons | Space Mono, caps | 13px | 700 | 0.2em |
| Numbers | Space Mono, tabular | as body | | |

**Space Mono is the only typeface** (primary font for everything: wordmark, headings, body, labels, buttons, numbers). Self-hosted through `@fontsource/space-mono` (400/700). Fallback stack: `"Space Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`. Reference: the brief's tagline style, wide-tracked grey caps.

## 4. Layout

| Width | Layout |
|---|---|
| < 768 (phone) | Single column, 16px gutters, bottom tab bar, sticky Log bar above it |
| 768 to 1023 (tablet) | Single column max 720px, top nav |
| >= 1024 (laptop) | Top nav, two-column brew form: form left (minmax 0, 1fr), sticky preview column right (420px) with ratio summary, radar and timeline |

The brew form shows only the sections and fields chosen for that mode in Settings, in the saved order (bean, recipe and ice-brew chilling always shown).

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Sections separate with a 1px `--border-soft` top rule and 32px gap, not cards. Nav height 56px.

## 5. Components
- **Input / select**: 1px `--border`, `--bg` fill, 44px min height (touch), 12px padding, focus `2px solid var(--focus)` offset 2px. Label above, helper or error below.
- **Number input**: `type=number`, `inputmode=decimal`, unit shown as a suffix inside the box.
- **Time input**: text `m:ss`, numeric keypad.
- **Combo (dropdown + Other)**: native select; choosing "Other..." reveals a text input or a dialog when more fields are needed (new dripper asks for a style, new grinder asks for dial type).
- **Segmented toggle**: row of square buttons, the active one ink filled.
- **Style slider**: 3 stop range Immersion, Hybrid, Percolation. A new dripper starts unset and cannot be saved until a stop is picked.
- **Footer credit** (Settings): "Created by Jia En" with links to `https://liewjiaen.com`, `https://github.com/nyx-ulrix`, `https://www.linkedin.com/in/malcolmliewjiaen/`.
- **Icon button**: default for every action that is not the primary one. Phosphor icon only, 44px square, 1px border, `aria-label` plus a tooltip with the same text.
- **Tooltip**: ink fill, paper text, Space Mono 11px caps, square, shown on hover and keyboard focus.
- **Primary button**: the only text button in a view. Ink fill, paper text, hover Ember, active `translateY(1px)`, 150ms ease (Log brew, Save bean, Save settings).
- **Ghost button**: 1px border, transparent fill.
- **Dialog**: native `<dialog>`, square, 1px border, backdrop 60% `--bg`.
- **Toast / inline messages**: tint background + 1px status border.
- **Empty states**: one sentence and the action that fills it.
- **Loading**: skeleton blocks matching layout, no spinners.

## 6. Flavour radar
Reference: coloured dots per axis with labels set around the ring.

| Axis (clockwise from the top) | Colour |
|---|---|
| Sweetness | `#FF99FF` |
| Aroma | `#D2B9CA` |
| Bitterness | `#7F3F00` |
| Body | `#0A0A0A` (outlined in dark) |
| Acidity | `#E4F28C` |
| Finish | `#2E3A87` |

- 3 to 12 axes. The template is set in Settings; each bean and brew can carry its own labels, colours and count.
- Five concentric rings (2, 4, 6, 8, 10) in `--border-soft`, spokes to each axis, a filled dot in the axis colour at the outer end, caps label outside it.
- Values 0 to 10 in half steps, so points sit between rings.
- Each tasting note is its own layer: fill at 0.35 opacity, 2px solid stroke, in a colour from the 64-colour palette (AI picked, or a stable palette colour from the note name), overridable per note.
- Layer points are draggable along their axis by mouse, touch and keyboard (arrow keys move half a step), with a visible focus ring on the active point.
- Legend below: square swatch and note name per layer.

## 7. Brew timeline
Horizontal time axis from 0 to total (hours for cold brew) with tick labels in mono. Lanes top to bottom, each with a caps label: Water, Agitation, Valve, Press, Chill, Events. Water bars width = time to next pour, height = grams, fill by temperature (Plum cool to Ember hot), running total as a line. Approximate positions (espresso chill by yield) show a `~` prefix. Compare stacks two timelines on the same axis.

## 8. Cup fingerprint
Each logged cup's own small shape, drawn from its spider chart once it exists: every note layer as a smooth closed curve through its axis values (minimum radius so flat notes still show), fill at 35% in the note colour, 1.5px stroke, no grid or labels. 96px at the top of a brew's detail, 40px beside each brew in History. Nothing is drawn for a brew without layers.

## 9. App icon
The user's coffee-flower line art: two coffee blossoms, black line drawing. Used as favicon, header logo and home-screen icon. Inverted in dark mode. Not uploaded to the Google consent screen (a logo there would trigger Google verification).

## 10. Icons
Phosphor (`@phosphor-icons/react`), regular weight, 20px. Icon-only buttons with tooltips wherever possible.

## 11. Accessibility
WCAG AA for all text. Stone 400 only for decorative text. Every input has a visible label. Focus ring always visible. Touch targets 44px. Motion respects `prefers-reduced-motion`.

## 12. Do and don't
| Do | Don't |
|---|---|
| Keep colour in graphics | Colour buttons or backgrounds with the accent families |
| Square corners | Rounded corners or shadows |
| Tracked caps on labels | Tracked caps on paragraphs |
| One primary text button per view | Two buttons with the same intent |
| Icon buttons with tooltips | Text buttons for secondary actions |
| Hyphen for ranges and empties | Em or en dashes |
