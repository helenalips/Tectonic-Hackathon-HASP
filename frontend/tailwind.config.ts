import type { Config } from "tailwindcss";
import { color, fontSize, font, fontWeight, spacing, radius, shadow, focusRing, layout } from "./src/theme/tokens";

// Brand tokens are the single source of truth. This file only maps them onto Tailwind.
const toTailwindFontSize = Object.fromEntries(
  Object.entries(fontSize).map(([k, [size, lineHeight]]) => [k, [size, { lineHeight }]]),
) as Record<string, [string, { lineHeight: string }]>;

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: JSON.parse(JSON.stringify(color)) as Record<string, string | Record<string, string>>,
      fontFamily: { sans: [...font.sans], display: [...font.display], mono: [...font.mono] },
      fontSize: toTailwindFontSize,
      fontWeight: Object.fromEntries(Object.entries(fontWeight).map(([k, v]) => [k, String(v)])),
      spacing: { ...spacing },
      borderRadius: { ...radius },
      boxShadow: { ...shadow, focus: focusRing },
      maxWidth: { content: layout.maxContentWidth },
      height: { header: layout.headerHeight },
      letterSpacing: { body: font.letterSpacingBody },
    },
  },
};

export default config;
