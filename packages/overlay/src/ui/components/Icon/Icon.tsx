import type { JSX } from "preact";

/** The 12×12 container frame of the layout icons (justify-content, align-items). */
const FRAME = "M12 0V12H0V0H12ZM1 11H11V1H1V11Z";

/** A box of content in a layout icon, in px. */
type Item = { x: number; y: number; w?: number; h?: number };

/**
 * A layout icon: the container (the frame, contrast-high at 20%) and accent
 * items where the content goes. Items sit flush on the frame's edges (over
 * its border), as in the designed justify-start icon. `extra` is drawn under
 * the items (e.g. align-items' baseline). Colors are tokens, not currentColor:
 * the design uses two.
 */
const layout = (items: Item[], extra?: JSX.Element) => ({
  size: 12,
  body: (
    <>
      <path d={FRAME} fill="var(--plt-color-contrast-high)" fill-opacity="0.2" />
      {extra}
      {items.map(({ x, y, w = 2, h = 2 }) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} fill="var(--plt-color-accent)" />
      ))}
    </>
  ),
});

/** justify-content: two items in a row, at `xs` (vertically centered). */
const justify = (xs: [number, number]) => layout(xs.map((x) => ({ x, y: 5 })));

/** align-items: two items side by side (horizontally centered), placed vertically. */
const ALIGN_XS = [3.5, 6.5];
const align = (y: number, h = 2) => layout(ALIGN_XS.map((x) => ({ x, y, h })));

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
  // justify-content: start is the designed icon; the others move its items.
  "justify-start": justify([0, 3]),
  "justify-end": justify([7, 10]),
  "justify-center": justify([3.5, 6.5]),
  "justify-between": justify([0, 10]),
  "justify-around": justify([2, 8]),
  // Equal space before, between and after: 8px free, a third each.
  "justify-evenly": justify([8 / 3, 2 + (2 * 8) / 3]),
  // align-items: the same items, on the vertical axis.
  "align-start": align(0),
  "align-center": align(5),
  "align-end": align(10),
  "align-stretch": align(0, 12),
  // A tall and a short item whose bottoms sit on one line, drawn faintly.
  "align-baseline": layout(
    [
      { x: 3.5, y: 3, h: 4 },
      { x: 6.5, y: 5, h: 2 },
    ],
    <rect x="1" y="7" width="10" height="1" fill="var(--plt-color-contrast-high)" fill-opacity="0.2" />,
  ),
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
