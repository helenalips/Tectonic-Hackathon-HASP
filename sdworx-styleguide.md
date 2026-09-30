# SD Worx house style (for the Figma one-pager)

Extracted on 2026-09-30 from the public SD Worx website and its "Ignite" design system CSS
(`cdn.sdworx.com/ignite/styling/v2/2.2.0/website/system.css`, `.../assets/v2/fonts/all.css`,
and the compiled sdworx.com stylesheet). These are the values the live site uses, not an official
brand-guideline PDF. Check the official guidelines if we need strict compliance.

## 1. Brand colors

| Role | Name | Hex | Notes |
|---|---|---|---|
| Primary | SD Worx Blue | `#006DD8` | Main brand blue, CTAs, links, dataviz brand 1 |
| Primary dark | Blue (pressed) | `#005BBF` | Hover/pressed and link text |
| Primary deep | Navy | `#001C52` / `#000D3A` | Strong text and dark backgrounds on blue |
| Primary light | Sky | `#9ED2FF` / `#D9F1FF` / `#EFFAFF` | Soft and subtle blue backgrounds |
| Accent | SD Worx Red | `#F1002F` | Brand red, used in the blue-to-red gradient |
| Accent (alt red) | Red (UI) | `#E4003A` | Red used in the UI |
| Accent | Magenta / Plum | `#870B58` (also `#880A5D`) | Deep pink-purple |
| Accent | Pink | `#B72280` | Dataviz brand 2 |
| Accent | Orange | `#E94E0F` | Campaign/illustration accent |
| Accent | Yellow | `#F8AD07` | Campaign/illustration accent |

**Signature gradient:** `linear-gradient(209deg, #006DD8 27%, #F1002F)` (blue to red)

### Neutrals

| Name | Hex | Use |
|---|---|---|
| Ink | `#040D14` | Darkest text, dark sections |
| Dark slate | `#1D2830` | Headings, dark UI |
| Charcoal | `#303642` | Most-used text color |
| Grey text | `#555D71` | Secondary text |
| Mid grey | `#7783A0` | Muted text, icons |
| Border grey | `#D9DBDD` | Dividers, borders |
| Light grey | `#F4F5F6` / `#F4F5F8` / `#F6F6F6` | Section backgrounds |
| White | `#FFFFFF` | Page background |

### Semantic colors (status / trust signals)

| State | Bold | Soft background | Subtle background |
|---|---|---|---|
| Success | `#007900` | `#D6FAD6` | `#F1FCF0` |
| Warning | `#F3B01D` | `#FFCF77` | `#FFF7EA` |
| Danger | `#E90040` | `#FFE3E3` | `#FFF3F4` |
| Info | `#006AFF` | `#DDF0FF` | `#F1F9FF` |

Useful for this challenge: map them to trust signals (current = success, outdated = warning,
conflicting = danger, scope/info = info).

### Data visualisation palette (categorical, in order)

`#006DD8` · `#75001C` · `#00A38C` · `#003F6C` · `#AC77FA` · `#710037` · `#F05B93` · `#533300` · `#E67600` · `#5E2B9A`

Sequential blue: `#001C52` `#003A86` `#005BBF` `#0087F3` `#72BCFF` `#C2E5FF`
Sequential pink: `#4B0030` `#880A5D` `#B72280` `#DA489E` `#F27DBC` `#FFBBE4`

## 2. Typography

| Use | Font | Weights | Source |
|---|---|---|---|
| Headings / display | **SD Worx Display** (variable: "SD Worx Display VF") | Light 300, Regular 400, Semibold 600, Bold 700 | Proprietary, served from SD Worx CDN |
| Body / UI / captions | **Inter** | 100 to 900 (variable) | Google Fonts, free |

**Figma note:** SD Worx Display is proprietary and will not be in Figma by default. Use **Inter**
for everything, or a close geometric substitute for headings (for example *Inter Display* or
*Plus Jakarta Sans*). Only use the real font if we get the files from SD Worx.

### Type scale (from the design system, 1rem = 16px)

| Style | Size | px |
|---|---|---|
| Display 1 (expressive) | 7.5rem | 120 |
| Display 2 (expressive) | 4.5rem | 72 |
| Heading XXL | 3rem | 48 |
| Heading XL | 2.5rem | 40 |
| Heading L | 2rem | 32 |
| Heading M | 1.75rem | 28 |
| Heading S | 1.5rem | 24 |
| Heading XS | 1.25rem | 20 |
| Heading XXS | 1.125rem | 18 |
| Body large | 1.25rem | 20 |
| Body | 1.125rem | 18 |
| Body small | 1rem | 16 |
| Body XS | 0.875rem | 14 |
| Caption | 0.75rem | 12 |

## 3. Shape and UI details

- Border radius: 4px default (inputs, buttons), 2px small, 8px large (cards)
- Clean, light backgrounds (white / `#F4F5F6`) with `#303642` text
- Blue for primary actions, red/magenta/orange/yellow only as accents
- Dark mode exists in the system (navy `#000D3A` backgrounds, light-blue `#9ED2FF` accents)

## 4. Quick palette for the one-pager

```
Primary    #006DD8   Accent red   #F1002F   Plum     #870B58
Navy       #001C52   Orange       #E94E0F   Yellow   #F8AD07
Text       #303642   Muted        #555D71   Border   #D9DBDD
Background #FFFFFF   Surface      #F4F5F6
Success    #007900   Warning      #F3B01D   Danger   #E90040
Fonts      Headings: SD Worx Display (fallback Inter)   Body: Inter
```
