# Branding notes

How TrustGrid applies the SD Worx house style, and where we had to fill gaps.
Tokens live in `frontend/src/theme/tokens.ts`. Nothing in the UI hard-codes a colour.

## Sources

| File | What we took from it |
|---|---|
| `branding/tokens.md` | Core palette, neutrals, status colours, accent ramp (primary source for colours) |
| `branding/website-style.md` | Type scale, radius, spacing, shadows, components, copy patterns |
| `sdworx-styleguide.md` | Semantic success/warning/danger/info sets, brand-idea colours |
| `branding/README.md` | Brand voice, logo rules, "Connect with an expert" pattern |
| `branding/logo/` | Three PNG logos (colour horizontal, colour vertical, black) |

## Decisions and gaps

1. **Two sources disagree on text and success colours.** `branding/tokens.md` gives text `#323334` and
   success `#009559`. `sdworx-styleguide.md` gives `#303642` and `#007900`. We use `#323334` for text
   (the Ignite token) and `#007900` for success, because `#009559` reaches only 3.86:1 on white and fails WCAG AA.
2. **Warning amber `#F3B01D` cannot carry text** (too light). It is used only for the icon and left border;
   warning text stays in body text colour `#323334` on `#FFF7EA`.
3. **`#88898B` (muted)** fails AA as text (3.5:1). It is used for icons and disabled states only;
   secondary text uses `#5A5B5C` (6.8:1).
4. **Fonts.** SD Worx Display is proprietary and not licensed to us. Inter is used for everything
   (as `branding/tokens.md` advises), loaded from Google Fonts.
5. **Logo.** Only PNGs of the older mark were supplied; there is no SVG and no white/inverse variant.
   So the logo only appears on white or `#F4F5F6`, never on a dark or blue surface. We copy the files
   unchanged to `frontend/public/brand/` with URL-safe names and never recolour, stretch or redraw them.
6. **Dimension accents.** "This client record" uses brand blue; "Across clients" uses magenta `#B72280`
   (the official dataviz secondary). This is our own mapping, not an SD Worx rule.
7. **Signature blue-to-red gradient** (`sdworx-styleguide.md`) is not used; the Ignite brand gradient
   (light blue to blue) is reserved for the login panel only.

8. **mysdworx dashboard direction (team input, 2026-09-30).** The team shared a photo of the 2026
   mysdworx product slide (Pay / Time / HR). We follow its look: a card-grid dashboard with a greeting,
   navy headings (`#001C52`), blue primary actions and round blue icon badges, white cards with 12px radius
   on a pale canvas, pill-shaped chips and tags, green/blue progress bars and navy/blue donut rings.
   Headings use Plus Jakarta Sans as a stand-in for the proprietary SD Worx Display; body stays Inter.
   Exact hex values can't be read from a projector photo (it adds a warm tint), so colours stay on the
   Ignite tokens. The new lowercase "mysdworx" wordmark is not in `branding/logo/`, so it is **not** recreated;
   the supplied logo is used.
   **How we applied it (frontend):** the landing page after login is a dashboard ("Hi Sofie," + KPI row, one card
   per client with a navy/blue donut and green/blue progress bars, "Your clients" and "Recent activity" sidebar).
   Every screen uses white 12px cards on the `#F6F7F9` canvas, navy Plus Jakarta Sans headings, round blue icon
   badges on section headers (magenta for "Across clients") and outlined pill chips for quick actions and tabs.
   Progress colours (`progress.good` `#009559`, `progress.brand`) are only used for bars and rings; the numbers
   and captions next to them stay navy or body text, so the green never carries text.

## Status language

| Meaning | Tone | Icon | Label |
|---|---|---|---|
| Trust ≥ 75 | success | shield-check | Reliable |
| Trust 50-74 | warning | alert-triangle | Verify |
| Trust < 50 | danger | shield-alert | Uncertain |
| Conflict high / medium / low | danger / warning / info | – | High / Medium / Low |
| Linked duplicate | info | link | Confirmed / Already in record |
| Record consistent | success | check-circle | Consistent |

Colour is never the only signal: every status has an icon and a text label.

## How it's applied in the UI

**Logo placement.** Colour horizontal logo top-left in the 64px white app header, 32px high, followed by a
hairline divider and the product name "TrustGrid"; padding keeps the clear space. The vertical logo sits on white
on the login screen (112px). The brand gradient is used only for the left panel of the login screen, and the logo
never sits on it. The black logo is not used on screen.

**Screens.** Login · Dashboard (landing) · Client record (summary, record health donut, open conflicts,
timeline, facts, dossier items, who to ask, people) · Capture new event (three result panels: Duplicates /
Consistency in this record / Consistency across clients) · Ask a question (answer with numbered citation chips,
sources with expandable trust factors, uncertainties, experts) · Build solution (two consistency checks, draft,
"Built on", "Backed by"). Every client screen shares one header: name, country, sector, the neutral "Demo data"
tag and the consistency banner, so consistency status, experts and sources are visible everywhere.

**Layout.** Max width 1280px, 24px gutter, 8px spacing grid, one solid blue primary button per view; secondary
actions are outlined buttons or pill chips. Buttons and inputs keep 4px corners; cards 12px; tags and chips are
pills. Focus ring is 2px navy on every interactive element. Tested down to 768px.

**Dimensions.** "This client record" = brand blue (top border, icon badge, label); "Across clients" = magenta
`#B72280` (precedents, across-records conflicts, problem expert label).

**Status language in the UI.**

| Where | Copy |
|---|---|
| Consistency banner | "Consistent · 0 conflicts · 0 duplicates" / "Needs review · 1 open conflict · 3 duplicates linked" |
| Trust badge | icon + "Reliable 83" / "Verify 72" / "Uncertain 41" (band from score: ≥ 75 / 50-74 / < 50) |
| Duplicate | "Already known in this record, confirmed by [document] from [person] on [date]. Linked as confirmation." |
| Open item match | "This question is already open in [item], handled by [person]." + "Create separate item" (reason required) |
| Conflict choices | "Update the record" · "Update my information" · "Both are valid" (note required) |
| Solution checks | "Consistent within this record" / "Consistent across clients" with a check or cross and the reasons |
| Human fallback | "Connect with an expert" (mailto link on every expert card and under uncertainties) |
| Errors | Generic only: "Email or password is incorrect", "Something went wrong. Try again in a moment." |

## v3: team one-pager and the "assistant in every channel" (2026-09-30)

The team's one-pager now drives the look. Where it conflicts with the notes above, it wins.

**Decisions**
- **Grid language everywhere.** Horizontal = the client record, SD Worx blue `#006DD8`, arrow **↔**, label "Horizontal · checked against the record". Vertical = across all clients, SD Worx plum `#870B58` (replaces magenta `#B72280` for this dimension), arrow **↕**, label "Vertical · checked against all clients". The new item (your email, message or question) is red `#E4003A`. Every result view is split into these two lanes.
- **TrustGrid mark.** Our own product mark, drawn inline as SVG (`TrustGridMark`): a 3×3 grid of rounded squares, top and bottom rows grey-plum-grey, middle row blue-red-blue, followed by the bold word "TrustGrid". It is not the SD Worx logo, which is no longer shown in the app header.
- **Type.** Inter everywhere (self-hosted). Big headlines are Inter 800, near-black `#0B1220`, tracking -0.02em. Headings are navy `#001C52`, Inter 700.
- **Signature rule.** A 3px rule from blue through plum to red sits under page titles.
- **Lane cards** follow the one-pager side cards: a soft fill (`#E6F1FC`/`#F3F8FE` or `#F6E6EF`/`#FBF4F8`), a 4px left border in the dimension colour, and an uppercase, letter-spaced eyebrow with the arrow.
- **GridMap.** Rows are clients. The current client's row sits in a light-blue band with blue dots (division labels above them), and the red "New item" sits where it crosses the plum column. Plum dots on other clients' rows mean "same problem, already solved". Conflicting documents are red; confirming ones have a green ring. Colour is never the only signal: each dot has a text label, and a legend sits under the grid.
- **Main screen = Ask TrustGrid** (a chat). The Outlook and Slack mockups show the same assistant as a side panel. ⌘K opens the same assistant as an overlay on every page.

**Tokens added to `frontend/src/theme/tokens.ts`**

| Token | Value | Use |
|---|---|---|
| `color.ink` | `#0B1220` | Display headlines |
| `status.dimension.*` | blue / plum / red with `soft` and `subtle` | Dimension accents |
| `grid.horizontal` / `grid.vertical` | `#006DD8` + `#E6F1FC`/`#F3F8FE`; `#870B58` + `#F6E6EF`/`#FBF4F8` | Tailwind `hz-*` / `vt-*` |
| `grid.newItem` | `#E4003A` | The new item and conflicting dots (never small text) |
| `grid.rowLine` | `#C9CDD2` | Other clients' rows (decorative) |
| `gradient.signature` | blue → plum → red | 3px rule (`bg-signature`) |
| `radius.xl` / `radius.2xl` | 16px / 20px | Panels, lanes, chat cards (24px via Tailwind `rounded-3xl` for the chat window) |
| `shadow.0` / `shadow.soft` / `shadow.pop` | hairline / panel / overlay | Cards, panels, palette and drawers |
| `motion.*` | 150 / 200 / 250 ms, one easing curve | Fades and slides; switched off under `prefers-reduced-motion` |
| `fontWeight.extrabold` | 800 | Headlines |
| `fontSize.display-xl` / `display-l` | 52px / 40px | Landing and page headlines |
| `layout.railWidth` / `topbarHeight` | 76px / 56px | App shell |

**Contrast.** Plum `#870B58` on `#F6E6EF` and blue `#006DD8` on `#E6F1FC` both pass AA for text. Red `#E4003A` is used only for dots, the new-item circle and borders, never for small text. Conflict text uses `danger.text` `#CF0038` on `#FFF3F4`.
