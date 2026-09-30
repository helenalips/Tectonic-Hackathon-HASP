# Design tokens

Extracted from SD Worx's public design system ("Ignite"), the CSS the website loads: `cdn.sdworx.com/ignite/styling/v2/2.2.0/website/system.css`. These are the live website tokens, not a published brand guide, so check them against the brand team if you need exact brand specs.

## Core palette

| Role | Hex | Notes |
|---|---|---|
| **Primary (brand blue)** | `#006DD8` | Main actions and links (light mode). Dark mode uses `#9ED2FF`. |
| Primary hover | `#0087F3` | |
| Primary pressed | `#005BBF` | |
| Primary soft / tint | `#D9F1FF`, `#EFFAFF` | Backgrounds, highlights |
| Brand gradient | `linear-gradient(135deg, #9ED2FF 0%, #006DD8 100%)` | Design system's `gradients-brand-primary` token |
| Neutral gradient | `linear-gradient(135deg, #D9DBDD 0%, #737476 100%)` | |
| Deep navy | `#001C52`, `#000D3A` | Dark blue accents |
| **Brand secondary (data viz 2)** | `#B72280` | Magenta. Pair it with `#006DD8` in charts. |

## Neutrals

| Role | Hex |
|---|---|
| Text (bold) | `#323334` |
| Text strongest / pressed | `#212223` |
| Text secondary | `#5A5B5C` |
| Muted / disabled | `#88898B`, `#737476` |
| Borders | `#D9DBDD`, `#EAEBED` |
| Page background | `#F4F5F6`, `#FBFCFC` |
| Inverse text (on dark) | `#FFFFFF` |
| Dark mode text | `#F4F5F6` |

## Status colours

| Role | Hex (light mode) |
|---|---|
| Danger / error | `#E90040` (text `#CF0038`, soft bg `#FFE3E3`) |
| Success / green | `#009559` (soft bg `#EEFDF4`) |
| Warning / amber | `#F3B01D` (approximate; appears in the stylesheet, not checked against a named token) |

These map well onto our trust signals (fresh, conflicting, outdated).

## Accent ramp (bold / subtle)

Orange `#FFA659`/`#FFF6EB` · Olive `#8E7A00`/`#FBF9EA` · Lime `#B2CB5C`/`#F6FBEC` · Green `#009559`/`#EEFDF4` · Teal `#23DBC1`/`#EBFDF9` · Purple `#9051E1`/`#FAF6FF` · Lilac `#E59FF6`/`#FFF4FF` · Magenta `#CB2F90`/`#FFF3FB` · Pink `#FF95BA`/`#FFF3F8`

## Logo colours

The logo files in [logo/](logo/) show the slanted-bar mark in slate blue, red and amber, with a dark slate and grey wordmark. The logo PNGs I looked at show the older mark. The 2026 refresh introduced new colours and a flexible logo system, so check that the files you added are the current version. I haven't taken hex values from the logo files.

## Typography

| Use | Font |
|---|---|
| Display / headings | **SD Worx Display** (proprietary, variable version `SD Worx Display VF`) |
| Body / UI | **Inter** (free, Google Fonts) |

For the prototype, use Inter for everything. SD Worx Display is not publicly licensed, so don't copy the font files.

## CSS starter

```css
:root {
  --sdw-primary: #006dd8;
  --sdw-primary-hover: #0087f3;
  --sdw-primary-pressed: #005bbf;
  --sdw-primary-tint: #d9f1ff;
  --sdw-secondary: #b72280;
  --sdw-navy: #001c52;
  --sdw-text: #323334;
  --sdw-text-muted: #5a5b5c;
  --sdw-border: #d9dbdd;
  --sdw-bg: #f4f5f6;
  --sdw-danger: #e90040;
  --sdw-success: #009559;
  --sdw-warning: #f3b01d;
  --sdw-gradient: linear-gradient(135deg, #9ed2ff 0%, #006dd8 100%);
  font-family: "Inter", system-ui, sans-serif;
}
```
