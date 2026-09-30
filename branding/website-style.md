# SD Worx website style

How sdworx.com looks and feels, so the prototype feels like it belongs to the same family.

Sources: the homepage at sdworx.com/en-en, and the design-system CSS it loads ("Ignite" v2.2.0). Measurements marked *(CSS)* come straight from that stylesheet. Layout and imagery notes are a description of the homepage, not a spec. Colours are in [tokens.md](tokens.md).

## In one sentence

A calm, enterprise-grade, white-and-blue interface: lots of air, big declarative headlines, small 4px-rounded controls, soft cool-blue shadows, and quiet photography. It reads as reliable and trustworthy rather than flashy.

## Overall feel

- **Professional, reassuring, uncluttered.** The design gets out of the way of the content. Nothing shouts.
- **Light-first.** White (`#FFFFFF`) and very pale grey (`#F4F5F6`, `#FBFCFC`) backgrounds. The design system also has a full dark mode, but the marketing site is primarily light.
- **Blue does the talking.** One strong blue (`#006DD8`) marks everything interactive. Everything else stays neutral grey. Magenta and the accent colours appear sparingly, mostly in charts and small highlights.
- **Structured and modular.** Content sits in distinct card-based sections, alternating between full-width bands and a contained grid.
- **Confident but plain copy.** Short, declarative, benefit-first sentences (see Copy below).

## Layout

- **Hero:** a full-width image backdrop with a large, confident headline split over two lines ("HR, Pay" / "& Time"), a one-line positioning statement ("Built for how Europe works") and a clear call to action.
- **Sections:** stacked bands. Some are white, some pale grey, with generous vertical padding. A contained grid of cards sits inside each band.
- **Navigation:** a wide header with rich dropdown (mega) menus organised hierarchically (About, Solutions, Customers, News & Research). Promotional tiles with images sit inside the dropdowns.
- **Trust strips:** customer logos, certification and credential badges. Social proof is a recurring element.
- **Backgrounds:** subtle SVG illustrations (map outlines, quote-section graphics) behind content, never competing with it.
- **Responsive:** grid collapses to a single column on mobile. The design system ships a separate mobile stylesheet.

## Typography

| Use | Font | Notes |
|---|---|---|
| Headings | SD Worx Display (proprietary) | Geometric, modern display face. Letter-spacing 0. |
| Body, UI, captions | Inter | Letter-spacing −0.2px on body text |
| Code | Consolas | |

Weights: light 300, regular 400, medium 500, semi-bold 600, bold 700.

Type scale *(CSS)*, size / line height:

| Style | Size | Line height |
|---|---|---|
| Expressive display 1 | 7.5rem (120px) | 6.75rem |
| Expressive display 2 | 4.5rem (72px) | 4rem |
| Heading XXL | 3rem (48px) | 3.25rem |
| Heading XL | 2.5rem (40px) | 2.75rem |
| Heading L | 2rem (32px) | 2.25rem |
| Heading M | 1.75rem (28px) | 1.875rem |
| Heading S | 1.5rem (24px) | 1.75rem |
| Heading XS | 1.25rem (20px) | 1.5rem |
| Body L | 1.25rem (20px) | 1.75rem |
| **Body (default)** | **1.125rem (18px)** | **1.5rem** |
| Body S | 1rem (16px) | 1.375rem |
| Caption | 0.75rem (12px) | 1rem |

Body text is relatively large (18px). Headlines are big and sparse, with line height about 1.1 to 1.2.

## Shape, spacing and depth

**Radius** *(CSS)*: small 2px · default and inputs 4px · large (cards and panels) 8px. Corners are only slightly rounded. There are no pills or heavy rounding.

**Spacing scale** *(CSS)*: 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128 · 160px. Section padding is typically 64px or more vertically.

**Shadows (elevation)** *(CSS)* are soft and tinted a navy-blue (`#042941`), not neutral black:
- Level 1 (resting cards): `0 0 3px rgba(4,41,65,.08), 0 2px 6px -1px rgba(4,41,65,.20)`
- Level 2: `0 1px 8px rgba(4,41,65,.11), 0 5px 8px rgba(4,41,65,.10)`
- Level 3: `0 1px 8px rgba(4,41,65,.12), 0 6px 12px rgba(4,41,65,.17)`
- Level 4 (popovers, dropdowns): `0 8px 24px rgba(4,41,65,.20), 0 3px 8px rgba(4,41,65,.12)`

**Borders:** hairline `#D9DBDD` (medium) in light mode. Focus ring is a 2px solid deep navy `#001C52` (`#0087F3` in dark mode) with a 4px radius, visible and accessible.

## Components

- **Primary button:** solid `#006DD8`, white text, 4px radius, medium/semi-bold label. Hover `#0087F3`, pressed `#005BBF`.
- **Secondary button:** outlined or soft-tinted (`#D9F1FF` fill, blue text).
- **Text links with direction:** plain blue links with directional wording ("Read the case study", "Discover our credentials"). They are used a lot and often replace buttons for tertiary actions.
- **Inputs:** 4px radius, 1px `#D9DBDD` border, blue focus ring.
- **Cards:** white surface on a pale grey band, 8px radius, elevation level 1, optional image on top, headline, short text, link at the bottom.
- **Tags / status boxes:** soft tinted backgrounds (`-subtle` colours) with a bold icon in the matching hue. Used for info (blue), success (green), warning (amber) and danger (red).
- **Icons:** simple, line-based, in the bold colour of their tint.

## Imagery and graphics

- **Photography:** modern, clean, professional. Real workplaces, people at work, and product dashboards and UI screenshots. Soft, neutral colour grading, uncluttered compositions, natural light.
- **Product UI is shown, not hidden.** Interface screenshots appear as proof of what the product does.
- **Graphics:** restrained, geometric, abstract. Subtle SVG line art (for example a map of Europe) used as a quiet backdrop.
- **Brand gradient:** soft light-blue to brand-blue diagonal (135°, `#9ED2FF` to `#006DD8`) for hero accents and feature panels.
- **Logo:** top-left of the header, clear space around it. See [logo/](logo/).

## Copy on the site

Patterns to copy in our prototype:
- **Headlines state a transformation:** "Move from complexity to confidence."
- **Positioning lines are short and factual:** "Built for how Europe works."
- **CTAs are verbs:** "Work ahead with SD Worx", "Connect with an expert".
- **Active voice, benefit-led, no hype.** Sentence case, not Title Case or ALL CAPS.
- **Human fallback is explicit:** "Connect with an expert". This matches our "who can help" trust signal.

## Design checklist for our PoC

1. White or `#F4F5F6` background, `#323334` text, Inter at 16 to 18px.
2. One primary action per view in `#006DD8`. Everything else neutral.
3. Cards with 8px radius, hairline border and the soft blue-tinted shadow.
4. Headlines large and short, sentence case, declarative.
5. Trust signals as small tinted tags (green fresh, amber ageing, red conflicting or outdated), each with an icon, never colour alone.
6. Generous whitespace. Do not fill every gap.
7. Visible blue focus ring and real contrast. Don't remove outlines.
8. A plain "Ask an expert" link wherever the answer is uncertain.

## CSS starter (layout and shape)

```css
:root {
  --radius: 4px;
  --radius-card: 8px;
  --shadow-1: 0 0 3px rgba(4,41,65,.08), 0 2px 6px -1px rgba(4,41,65,.20);
  --shadow-4: 0 8px 24px rgba(4,41,65,.20), 0 3px 8px rgba(4,41,65,.12);
  --focus: 0 0 0 2px #001c52;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;
}
body { font: 400 1.125rem/1.5rem Inter, system-ui, sans-serif; letter-spacing: -.2px; color: #323334; background: #fff; }
.card { background:#fff; border:1px solid #d9dbdd; border-radius:var(--radius-card); box-shadow:var(--shadow-1); padding:var(--space-6); }
.btn-primary { background:#006dd8; color:#fff; border:0; border-radius:var(--radius); padding:.5625rem 1.25rem; font-weight:600; }
.btn-primary:hover { background:#0087f3; } .btn-primary:active { background:#005bbf; }
:focus-visible { outline:none; box-shadow:var(--focus); }
```
