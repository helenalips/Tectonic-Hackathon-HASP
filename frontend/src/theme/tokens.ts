/**
 * TrustGrid brand tokens — the single source for colors, type, spacing, radius and shadows.
 * Values come from branding/tokens.md, branding/website-style.md and sdworx-styleguide.md
 * (SD Worx "Ignite" design system v2.2.0). Deviations are logged in docs/BRANDING_NOTES.md.
 * tailwind.config.ts imports this file; components never hard-code hex values.
 */

export const color = {
  // Brand
  primary: "#006DD8", // SD Worx Blue: primary actions, links, focus accents (5.03:1 on white)
  primaryHover: "#0087F3",
  primaryPressed: "#005BBF",
  primaryTint: "#D9F1FF",
  primarySubtle: "#EFFAFF",
  navy: "#001C52", // focus ring, strong headings on tint
  secondary: "#B72280", // magenta: used sparingly (dataviz 2, the "across records" dimension)
  secondarySubtle: "#FFF3FB",

  // Neutrals
  heading: "#001C52", // mysdworx look: headings and key numbers in navy
  text: "#323334", // body text (11.6:1 on #F4F5F6)
  textStrong: "#212223",
  textMuted: "#5A5B5C", // secondary text (6.8:1 on white)
  iconMuted: "#88898B", // icons and disabled only; fails AA as text
  border: "#D9DBDD",
  borderSubtle: "#EAEBED",
  surface: "#FFFFFF",
  background: "#F6F7F9", // page canvas behind the card grid (mysdworx dashboard)
  backgroundAlt: "#FBFCFC",

  // Status (bold = icon/border, text = AA-safe text on the soft background, soft/subtle = fills)
  success: { bold: "#007900", text: "#007900", soft: "#D6FAD6", subtle: "#F1FCF0" },
  warning: { bold: "#F3B01D", text: "#323334", soft: "#FFCF77", subtle: "#FFF7EA" },
  danger: { bold: "#E90040", text: "#CF0038", soft: "#FFE3E3", subtle: "#FFF3F4" },
  info: { bold: "#006DD8", text: "#005BBF", soft: "#D9F1FF", subtle: "#EFFAFF" },

  // Data display (mysdworx dashboard): progress bars and donut rings, never text
  progress: { track: "#EAEBED", good: "#009559", brand: "#006DD8", ink: "#001C52" },
  iconBadge: { bg: "#006DD8", fg: "#FFFFFF" }, // round blue section icons
} as const;

/** Semantic mapping used by TrustBadge, ConflictModal, DuplicateNotice and ConsistencyStatus. */
export const status = {
  trust: {
    Reliable: { tone: "success", icon: "shield-check", label: "Reliable" }, // score ≥ 75
    Verify: { tone: "warning", icon: "alert-triangle", label: "Verify" }, // 50-74
    Uncertain: { tone: "danger", icon: "shield-alert", label: "Uncertain" }, // < 50
  },
  severity: {
    high: { tone: "danger", icon: "octagon-alert", label: "High" },
    medium: { tone: "warning", icon: "alert-triangle", label: "Medium" },
    low: { tone: "info", icon: "info", label: "Low" },
  },
  link: {
    confirmed: { tone: "info", icon: "link", label: "Confirmed" }, // duplicate linked as confirmation
    duplicate: { tone: "info", icon: "copy-check", label: "Already in record" },
    consistent: { tone: "success", icon: "check-circle", label: "Consistent" },
    conflict: { tone: "danger", icon: "x-circle", label: "Conflict" },
    suspicious: { tone: "danger", icon: "shield-x", label: "Suspicious content" },
  },
  // The two TrustGrid dimensions get a stable accent so users learn them at a glance.
  dimension: {
    withinRecord: { accent: "#006DD8", label: "This client record" },
    acrossRecords: { accent: "#B72280", label: "Across clients" },
  },
} as const;

export const font = {
  // SD Worx Display is proprietary and not licensed to us. Plus Jakarta Sans is the geometric
  // stand-in for headings (suggested in sdworx-styleguide.md); Inter stays the body/UI font.
  // Self-hosted via @fontsource-variable (no requests to Google: GDPR).
  display: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', '"Inter Variable"', "system-ui", "sans-serif"],
  sans: ['"Inter Variable"', '"Inter"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  mono: ["Consolas", "ui-monospace", "monospace"],
  letterSpacingBody: "-0.2px",
} as const;

/** [size, lineHeight] from the Ignite type scale (1rem = 16px). */
export const fontSize = {
  "heading-xl": ["2.5rem", "2.75rem"],
  "heading-l": ["2rem", "2.25rem"],
  "heading-m": ["1.75rem", "1.875rem"],
  "heading-s": ["1.5rem", "1.75rem"],
  "heading-xs": ["1.25rem", "1.5rem"],
  "heading-xxs": ["1.125rem", "1.5rem"],
  "body-l": ["1.25rem", "1.75rem"],
  body: ["1.125rem", "1.5rem"],
  "body-s": ["1rem", "1.375rem"],
  "body-xs": ["0.875rem", "1.25rem"],
  caption: ["0.75rem", "1rem"],
} as const;

export const fontWeight = { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/** 8px-based scale with the Ignite in-between steps. Keys are px. */
export const spacing = {
  0: "0px", 1: "4px", 1.5: "6px", 2: "8px", 3: "12px", 4: "16px", 5: "20px", 6: "24px",
  8: "32px", 10: "40px", 12: "48px", 16: "64px", 20: "80px", 24: "96px",
} as const;

// mysdworx 2026 look: softer cards, pill chips/tags. Buttons and inputs keep 4px.
export const radius = { sm: "2px", DEFAULT: "4px", md: "8px", lg: "12px", full: "9999px" } as const;

export const shadow = {
  1: "0 0 3px rgba(4,41,65,.08), 0 2px 6px -1px rgba(4,41,65,.20)", // resting cards
  2: "0 1px 8px rgba(4,41,65,.11), 0 5px 8px rgba(4,41,65,.10)",
  3: "0 1px 8px rgba(4,41,65,.12), 0 6px 12px rgba(4,41,65,.17)",
  4: "0 8px 24px rgba(4,41,65,.20), 0 3px 8px rgba(4,41,65,.12)", // modals, popovers
} as const;

export const focusRing = "0 0 0 2px #001C52";

export const gradient = {
  brand: "linear-gradient(135deg, #9ED2FF 0%, #006DD8 100%)", // hero accents only
} as const;

/** Logo files are copied from branding/logo/ to frontend/public/brand/ (never recolored or redrawn). */
export const logo = {
  horizontal: { src: "/brand/sdworx-logo-color.png", use: "App header, top-left, on white", minHeightPx: 24 },
  vertical: { src: "/brand/sdworx-logo-vertical.png", use: "Login screen", minHeightPx: 96 },
  mono: { src: "/brand/sdworx-logo-black.png", use: "Print / monochrome exports only", minHeightPx: 24 },
  clearSpace: "Keep clear space ≥ the height of the 'x' in 'sdworx' on every side",
} as const;

export const layout = {
  maxContentWidth: "1280px",
  headerHeight: "64px",
  gutter: "24px",
  sectionPaddingY: "64px",
} as const;
