import type { JSX } from "preact";

/** The 12×12 container frame of the layout icons (justify-content, align-items). */
const FRAME = "M12 0V12H0V0H12ZM1 11H11V1H1V11Z";

/** A box of content in a layout icon, in px. */
type Item = { x: number; y: number; w?: number; h?: number };

/**
 * A layout icon: the container (the frame, contrast-high at 20%) and accent
 * items where the content goes. Items sit flush on the frame's edges (over
 * its border), as in the designed icons. Colors are tokens, not currentColor:
 * the design uses two.
 */
const layout = (items: Item[]) => ({
  size: 12,
  body: (
    <>
      <path d={FRAME} fill="var(--plt-color-contrast-high)" fill-opacity="0.2" />
      {items.map(({ x, y, w = 2, h = 2 }) => (
        <rect key={`${x},${y},${w},${h}`} x={x} y={y} width={w} height={h} fill="var(--plt-color-accent)" />
      ))}
    </>
  ),
});

/**
 * A box side icon (padding, margin…): the frame, and an accent bar (2px)
 * along each side it stands for, flush on the frame's edge.
 */
const BARS = {
  top: { x: 0, y: 0, w: 12, h: 2 },
  right: { x: 10, y: 0, w: 2, h: 12 },
  bottom: { x: 0, y: 10, w: 12, h: 2 },
  left: { x: 0, y: 0, w: 2, h: 12 },
} as const;
const sides = (...names: Array<keyof typeof BARS>) => layout(names.map((n) => BARS[n]));

/**
 * A gap icon: the cell (a 12×12 square, contrast-high at 20%) and an accent
 * bar (2px) through its middle for each gap it stands for: a horizontal one
 * for the gap between rows, a vertical one for the gap between columns.
 */
const GAP_BARS = { row: "M12 5V7H0V5H12Z", column: "M5 0H7V12H5V0Z" } as const;
const gap = (...bars: Array<keyof typeof GAP_BARS>) => ({
  size: 12,
  body: (
    <>
      <path d="M12 0V12H0V0H12Z" fill="var(--plt-color-contrast-high)" fill-opacity="0.2" />
      {bars.map((b) => (
        <path key={b} d={GAP_BARS[b]} fill="var(--plt-color-accent)" />
      ))}
    </>
  ),
});

/**
 * flex-wrap: no-wrap is three items (3px) in one row running out of a frame
 * that's open on the right; wrap is the closed frame with the third item
 * moved down to a second line; wrap-reverse is wrap flipped (the second line
 * above the first).
 */
const NOWRAP_FRAME = "M12 3H11V1H1V11H11V9H12V12H0V0H12V3Z";
const item3 = (x: number, y: number) => ({ x, y, w: 3, h: 3 });

/**
 * flex-direction: three items (accent, fading to 66% and 33% in the order
 * they run) and an arrow (contrast-high at 50%) along the main axis. Row and
 * column are designed; their reverses mirror them (items from the other end,
 * the arrow pointing back).
 */
type Box = { x: number; y: number; w: number; h: number };
const direction = (items: [Box, Box, Box], line: string, head: string) => ({
  size: 12,
  body: (
    <>
      {items.map(({ x, y, w, h }, i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="var(--plt-color-accent)" opacity={[1, 0.66, 0.33][i]} />
      ))}
      <g opacity="0.5" stroke="var(--plt-color-contrast-high)" stroke-linecap="round" stroke-linejoin="round">
        <path d={line} />
        <path d={head} />
      </g>
    </>
  ),
});

/** justify-content: two items in a row, at `xs` (vertically centered). */
const justify = (xs: [number, number]) => layout(xs.map((x) => ({ x, y: 5 })));

/**
 * align-items: a short item (2px) and a tall one (4px) side by side, at `y`
 * (short) and `tallY` (tall). Stretch makes both full height.
 */
const align = (y: number, tallY: number, h = 2, tallH = 4) =>
  layout([
    { x: 3.5, y, h },
    { x: 6.5, y: tallY, h: tallH },
  ]);

/**
 * Pilot's icons. Single-color ones are drawn in `currentColor`, so they take
 * the color of the text around them; multi-color ones (the layout icons)
 * use tokens. Each has its own size (its viewBox, in px). Add new ones here.
 */
const ICONS = {
  "chevron-down": {
    size: 8,
    body: <path d="M2 3.5L4 5.5L6 3.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />,
  },
  check: {
    size: 8,
    body: <path d="M1.5 4L3.25 6L6.5 1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />,
  },
  // Toolbar (Nucleo UI, filled, 18px): Clear changes.
  eraser: {
    size: 18,
    body: (
      <>
        <path
          d="M16,16h-7.374c-.414,0-.75-.336-.75-.75s.336-.75,.75-.75h7.374c.414,0,.75,.336,.75,.75s-.336,.75-.75,.75Z"
          fill="currentColor"
          data-color="color-2"
        />
        <path
          d="M16.056,5.691l-3.712-3.713c-.851-.85-2.333-.848-3.182,0L1.944,9.197c-.425,.425-.659,.99-.659,1.591s.234,1.167,.659,1.591l3.401,3.402c.141,.141,.331,.22,.53,.22h2.743c.199,0,.39-.079,.53-.22l6.906-6.907c.425-.425,.659-.99,.659-1.591s-.234-1.167-.659-1.591Zm-7.747,8.809h-2.122l-3.182-3.183c-.142-.141-.22-.33-.22-.53s.078-.389,.22-.53l3.078-3.078,4.773,4.773-2.548,2.548Z"
          fill="currentColor"
        />
      </>
    ),
  },
  // Box sides: all four (one value for every side), then one each.
  "sides-all": sides("top", "right", "bottom", "left"),
  "side-top": sides("top"),
  "side-right": sides("right"),
  "side-bottom": sides("bottom"),
  "side-left": sides("left"),
  // Gaps: both (the designed icon), then the row gap and the column gap alone.
  "gap-all": gap("column", "row"),
  "gap-row": gap("row"),
  "gap-column": gap("column"),
  // flex-direction: row and column are designed; the reverses mirror them.
  "flex-row": direction(
    [
      { x: 0, y: 3, w: 2, h: 2 },
      { x: 3, y: 3, w: 2, h: 2 },
      { x: 6, y: 3, w: 2, h: 2 },
    ],
    "M0.5 8H11.5",
    "M10 6.5L11.5 8L10 9.5",
  ),
  "flex-row-reverse": direction(
    [
      { x: 10, y: 3, w: 2, h: 2 },
      { x: 7, y: 3, w: 2, h: 2 },
      { x: 4, y: 3, w: 2, h: 2 },
    ],
    "M0.5 8H11.5",
    "M2 6.5L0.5 8L2 9.5",
  ),
  "flex-col": direction(
    [
      { x: 0, y: 1, w: 7, h: 2 },
      { x: 0, y: 4.5, w: 7, h: 2 },
      { x: 0, y: 8, w: 7, h: 2 },
    ],
    "M10 0.5L10 11.5",
    "M11.5 10L10 11.5L8.5 10",
  ),
  "flex-col-reverse": direction(
    [
      { x: 0, y: 9, w: 7, h: 2 },
      { x: 0, y: 5.5, w: 7, h: 2 },
      { x: 0, y: 2, w: 7, h: 2 },
    ],
    "M10 0.5L10 11.5",
    "M8.5 2L10 0.5L11.5 2",
  ),
  // flex-wrap: no-wrap and wrap are designed; wrap-reverse flips wrap.
  "flex-nowrap": {
    size: 12,
    body: (
      <>
        <path d={NOWRAP_FRAME} fill="var(--plt-color-contrast-high)" fill-opacity="0.2" />
        {[1, 5, 9].map((x) => (
          <rect key={x} x={x} y={4.5} width={3} height={3} fill="var(--plt-color-accent)" />
        ))}
      </>
    ),
  },
  "flex-wrap": layout([item3(1, 2.5), item3(5, 2.5), item3(1, 6.5)]),
  "flex-wrap-reverse": layout([item3(1, 6.5), item3(5, 6.5), item3(1, 2.5)]),
  // justify-content: start is the designed icon; the others move its items.
  "justify-start": justify([0, 3]),
  "justify-end": justify([7, 10]),
  "justify-center": justify([3.5, 6.5]),
  "justify-between": justify([0, 10]),
  "justify-around": justify([2, 8]),
  // Equal space before, between and after: 8px free, a third each.
  "justify-evenly": justify([8 / 3, 2 + (2 * 8) / 3]),
  // align-items: the designed icons, a short and a tall item.
  "align-start": align(0, 0),
  "align-center": align(5, 4),
  "align-end": align(10, 8),
  "align-stretch": align(0, 0, 12, 12),
  // Bottoms on one line (y 7), the tall item rising above it.
  "align-baseline": align(5, 3),
  // Nothing set (any layout property): the container, crossed out.
  "layout-empty": {
    size: 12,
    body: (
      <g opacity="0.2">
        <path
          d="M12 12H0V0H12V12ZM1.70703 11H10.293L6 6.70703L1.70703 11ZM6.70703 6L11 10.293V1.70703L6.70703 6ZM1 10.293L5.29297 6L1 1.70703V10.293ZM6 5.29297L10.293 1H1.70703L6 5.29297Z"
          fill="var(--plt-color-contrast-high)"
        />
      </g>
    ),
  },
} satisfies Record<string, { size: number; body: JSX.Element }>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** Extra class names, for positioning. */
  class?: string;
}

/** An icon at its own size. Decorative: hidden from assistive tech. */
export function Icon({ name, class: className }: IconProps) {
  const { size, body } = ICONS[name];
  return (
    <svg
      class={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
