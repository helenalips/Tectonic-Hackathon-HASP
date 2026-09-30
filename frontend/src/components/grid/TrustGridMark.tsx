import { grid } from "../../theme/tokens";

const GREY = "#D9DBDD";
const PLUM = grid.vertical.color;
const BLUE = grid.horizontal.color;
const RED = grid.newItem;

/** 3×3 rows: grey-plum-grey / blue-red-blue / grey-plum-grey (team one-pager). */
const CELLS: string[][] = [
  [GREY, PLUM, GREY],
  [BLUE, RED, BLUE],
  [GREY, PLUM, GREY],
];

/** TrustGrid product mark (our own mark, not the SD Worx logo). Decorative unless a title is given. */
export function TrustGridMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {CELLS.flatMap((row, r) =>
        row.map((fill, c) => <rect key={`${r}-${c}`} x={c * 8 + 0.5} y={r * 8 + 0.5} width={7} height={7} rx={1.8} fill={fill} />),
      )}
    </svg>
  );
}

/** Mark + bold word "TrustGrid". */
export function TrustGridLogo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <TrustGridMark size={size} />
      <span className="font-display text-heading-xxs font-extrabold tracking-tightest text-ink">TrustGrid</span>
    </span>
  );
}

/** 3px signature rule: blue → plum → red. */
export function SignatureRule({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`h-[3px] w-full rounded-full bg-signature ${className}`} />;
}
