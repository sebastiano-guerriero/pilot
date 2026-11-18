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
 * An inset icon: the frame, and an accent bar (2px) from the side it stands
 * for to the center. Top is designed; the other sides rotate it.
 */
const INSET_BARS = {
  top: { x: 5, y: 0, w: 2, h: 6 },
  right: { x: 6, y: 5, w: 6, h: 2 },
  bottom: { x: 5, y: 6, w: 2, h: 6 },
  left: { x: 0, y: 5, w: 6, h: 2 },
} as const;
const insets = (...names: Array<keyof typeof INSET_BARS>) => layout(names.map((n) => INSET_BARS[n]));

/**
 * A gap icon: the cells (contrast-high at 20%) on either side of each gap,
 * and an accent bar (2px) through the middle for each gap it stands for: a
 * horizontal one for the gap between rows (gap-y), a vertical one for the
 * gap between columns (gap-x). Both and the row gap are designed; the column
 * gap rotates the row gap.
 */
type Rect = { x: number; y: number; w: number; h: number };
const GAP_ICONS = {
  all: {
    cells: [
      { x: 0, y: 0, w: 4, h: 4 },
      { x: 8, y: 0, w: 4, h: 4 },
      { x: 0, y: 8, w: 4, h: 4 },
      { x: 8, y: 8, w: 4, h: 4 },
    ],
    bars: [
      { x: 5, y: 0, w: 2, h: 12 },
      { x: 0, y: 5, w: 12, h: 2 },
    ],
  },
  row: {
    cells: [
      { x: 0, y: 0, w: 12, h: 4 },
      { x: 0, y: 8, w: 12, h: 4 },
    ],
    bars: [{ x: 0, y: 5, w: 12, h: 2 }],
  },
  column: {
    cells: [
      { x: 0, y: 0, w: 4, h: 12 },
      { x: 8, y: 0, w: 4, h: 12 },
    ],
    bars: [{ x: 5, y: 0, w: 2, h: 12 }],
  },
} satisfies Record<string, { cells: Rect[]; bars: Rect[] }>;
const gap = (kind: keyof typeof GAP_ICONS) => ({
  size: 12,
  body: (
    <>
      {GAP_ICONS[kind].cells.map(({ x, y, w, h }) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} fill="var(--plt-color-contrast-high)" fill-opacity="0.2" />
      ))}
      {GAP_ICONS[kind].bars.map(({ x, y, w, h }) => (
        <rect key={`${x},${y},${w}`} x={x} y={y} width={w} height={h} fill="var(--plt-color-accent)" />
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

/**
 * text-align: the frame, and three lines of text (accent, 1px, round caps):
 * two full ones and a short one in the middle, placed by the alignment
 * (`middle`: its x from–to). Center and justify are designed; left and right
 * move the short line to that side.
 */
const textAlign = (middle: [number, number]) => ({
  size: 12,
  body: (
    <>
      <path d={FRAME} fill="var(--plt-color-contrast-high)" fill-opacity="0.2" />
      <g stroke="var(--plt-color-accent)" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.5 3.5H9.5" />
        <path d={`M${middle[0]} 6H${middle[1]}`} />
        <path d="M2.5 8.5H9.5" />
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
  // Closing a panel (the DOM tree): an ×.
  close: {
    size: 8,
    body: (
      <g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 7L1 1" />
        <path d="M1 7L7 1" />
      </g>
    ),
  },
  // A pill's remove button: a small ×.
  "close-small": {
    size: 8,
    body: (
      <g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6L6 2" />
        <path d="M6 6L2 2" />
      </g>
    ),
  },
  // Show in DOM, on the selection: `< >`.
  code: {
    size: 12,
    body: (
      <g fill="currentColor">
        <path d="M7.81078 10.1891C7.61878 10.1891 7.42679 10.1161 7.28079 9.96908C6.98779 9.67608 6.98779 9.20108 7.28079 8.90808L10.1898 5.99908L7.28079 3.09008C6.98779 2.79708 6.98779 2.32208 7.28079 2.02908C7.57379 1.73608 8.04879 1.73608 8.34179 2.02908L11.7808 5.46808C12.0738 5.76108 12.0738 6.23608 11.7808 6.52908L8.34179 9.96808C8.19579 10.1141 8.00378 10.1881 7.81178 10.1881L7.81078 10.1891Z" />
        <path d="M4.18924 10.1891C3.99724 10.1891 3.80524 10.1161 3.65924 9.96905L0.220238 6.53005C-0.0727617 6.23705 -0.0727617 5.76205 0.220238 5.46905L3.65924 2.03005C3.95224 1.73705 4.42724 1.73705 4.72024 2.03005C5.01324 2.32305 5.01324 2.79805 4.72024 3.09105L1.81124 6.00005L4.72024 8.90905C5.01324 9.20205 5.01324 9.67705 4.72024 9.97005C4.57424 10.1161 4.38224 10.1901 4.19024 10.1901L4.18924 10.1891Z" />
      </g>
    ),
  },
  // Make responsive, on the selection: a window with a two-way arrow below it.
  responsive: {
    size: 12,
    body: (
      <>
        <path d="M3.25 4.5C3.66421 4.5 4 4.16421 4 3.75C4 3.33579 3.66421 3 3.25 3C2.83579 3 2.5 3.33579 2.5 3.75C2.5 4.16421 2.83579 4.5 3.25 4.5Z" fill="currentColor" />
        <path d="M5.75 4.5C6.16421 4.5 6.5 4.16421 6.5 3.75C6.5 3.33579 6.16421 3 5.75 3C5.33579 3 5 3.33579 5 3.75C5 4.16421 5.33579 4.5 5.75 4.5Z" fill="currentColor" />
        <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M0.75 9.25H11.25" />
          <path d="M2.5 7.5L0.75 9.25L2.5 11" />
          <path d="M9.5 7.5L11.25 9.25L9.5 11" />
          <path d="M11.25 5.5V3.25C11.25 2.14543 10.3546 1.25 9.25 1.25H2.75C1.64543 1.25 0.75 2.14543 0.75 3.25V5.5" />
        </g>
      </>
    ),
  },
  // An unresolved comment thread, on the element's corner (SelectionActions): a speech bubble.
  thread: {
    size: 12,
    body: (
      <path
        d="M1 6V10C1 10.5523 1.44772 11 2 11H6C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6Z"
        fill="currentColor"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    ),
  },
  // The comment box (Nucleo UI, outline, 12px): attach (paperclip), send (arrow-up).
  attach: {
    size: 12,
    body: (
      <path
        d="m4.75,3.75v3.75c0,.69.56,1.25,1.25,1.25h0c.69,0,1.25-.56,1.25-1.25V3.25c0-1.381-1.119-2.5-2.5-2.5h0c-1.381,0-2.5,1.119-2.5,2.5v4.25c0,2.071,1.679,3.75,3.75,3.75h0c2.071,0,3.75-1.679,3.75-3.75v-3.75"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    ),
  },
  "arrow-up": {
    size: 12,
    body: (
      <g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 11V1.25" />
        <path d="M9.25 4.25L6 1L2.75 4.25" />
      </g>
    ),
  },
  // Files dragged over the comment box (Nucleo UI paperclip-plus, outline, 18px): the clip in the text's color, the plus in the accent.
  "attach-add": {
    size: 18,
    body: (
      <g stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13.75 1.75V6.75M16.25 4.25H11.25" stroke="var(--plt-color-accent)" />
        <path
          d="M5.75,5v6.75c0,.828,.672,1.5,1.5,1.5h0c.828,0,1.5-.672,1.5-1.5V4.75c0-1.657-1.343-3-3-3h0c-1.657,0-3,1.343-3,3v7c0,2.485,2.015,4.5,4.5,4.5h0c2.485,0,4.5-2.015,4.5-4.5v-3"
          stroke="currentColor"
        />
      </g>
    ),
  },
  // Mark as solved, in the comment box: a check (8px).
  solved: {
    size: 8,
    body: <path d="M1 4.8203L2.59198 7L7 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />,
  },
  // The dialog's drag strip: three dots in a row (10×2).
  grip: {
    size: [10, 2],
    body: (
      <>
        {[1, 5, 9].map((cx) => (
          <circle key={cx} cx={cx} cy={1} r={1} fill="currentColor" />
        ))}
      </>
    ),
  },
  // Toolbar (Nucleo UI, filled, 18px): select (square-dashed-cursor), Send
  // (circle-arrow-up), jobs in progress (loader-4), quit (power-off).
  select: {
    size: 18,
    body: (
      <>
        <path
          d="m6.75,2h-2c-1.5166,0-2.75,1.2334-2.75,2.75v1.5c0,.4141.3359.75.75.75s.75-.3359.75-.75v-1.5c0-.6895.5605-1.25,1.25-1.25h2c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill="currentColor"
        />
        <path
          d="m11.25,3.5h2c.6895,0,1.25.5605,1.25,1.25v1.5c0,.4141.3359.75.75.75s.75-.3359.75-.75v-1.5c0-1.5166-1.2334-2.75-2.75-2.75h-2c-.4141,0-.75.3359-.75.75s.3359.75.75.75Z"
          fill="currentColor"
        />
        <path
          d="m6.75,14.5h-2c-.6895,0-1.25-.5605-1.25-1.25v-1.5c0-.4141-.3359-.75-.75-.75s-.75.3359-.75.75v1.5c0,1.5166,1.2334,2.75,2.75,2.75h2c.4141,0,.75-.3359.75-.75s-.3359-.75-.75-.75Z"
          fill="currentColor"
        />
        <path
          d="m16.2959,10.5693l-6.8545-2.5039q-.001,0-.002-.0005c-.3945-.1431-.8271-.0479-1.125.25s-.3936.7295-.249,1.1265l2.5049,6.8535c.1543.4243.5576.7056,1.0068.7056.0078,0,.0146-.0005.0215-.0005.459-.0093.8604-.3086,1-.7456l.8867-2.7686,2.7715-.8867c.4355-.1406.7344-.543.7432-1.0005.0088-.458-.2734-.8711-.7041-1.0293Z"
          fill="currentColor"
        />
      </>
    ),
  },
  // Toolbar (Nucleo UI msg-2, filled, 18px): the Comment tool.
  comment: {
    size: 18,
    body: (
      <path
        d="m9.1875,1.502c-1.9824-.0537-3.8535.7026-5.3003,2.1143-1.5171,1.4805-2.3872,3.5483-2.3872,5.6729v4.9609c0,1.2407,1.0078,2.25,2.2471,2.25h4.4766c2.4365,0,4.6426-.8862,6.2129-2.4951,1.377-1.4111,2.1089-3.2554,2.0615-5.1929-.0991-4.0005-3.3101-7.2114-7.3105-7.3101Z"
        fill="currentColor"
      />
    ),
  },
  send: {
    size: 18,
    body: (
      <path
        d="M9,1C4.589,1,1,4.589,1,9s3.589,8,8,8,8-3.589,8-8S13.411,1,9,1Zm3.03,7.78c-.146,.146-.338,.22-.53,.22s-.384-.073-.53-.22l-1.22-1.22v4.689c0,.414-.336,.75-.75,.75s-.75-.336-.75-.75V7.561l-1.22,1.22c-.293,.293-.768,.293-1.061,0s-.293-.768,0-1.061l2.5-2.5c.293-.293,.768-.293,1.061,0l2.5,2.5c.293,.293,.293,.768,0,1.061Z"
        fill="currentColor"
      />
    ),
  },
  /** Nucleo UI loader-4, filled, 12px: a job on the selected element (SelectionActions). */
  busy: {
    size: 12,
    body: (
      <g fill="currentColor">
        <path d="M7.25 1.25C7.25 1.94036 6.69036 2.5 6 2.5C5.30964 2.5 4.75 1.94036 4.75 1.25C4.75 0.559644 5.30964 0 6 0C6.69036 0 7.25 0.559644 7.25 1.25Z" />
        <path opacity="0.5" d="M7.25 10.75C7.25 11.4404 6.69036 12 6 12C5.30964 12 4.75 11.4404 4.75 10.75C4.75 10.0596 5.30964 9.5 6 9.5C6.69036 9.5 7.25 10.0596 7.25 10.75Z" />
        <path opacity="0.75" d="M10.75 7.25C10.0596 7.25 9.5 6.69036 9.5 6C9.5 5.30964 10.0596 4.75 10.75 4.75C11.4404 4.75 12 5.30964 12 6C12 6.69036 11.4404 7.25 10.75 7.25Z" />
        <path opacity="0.25" d="M1.25 7.25C0.559644 7.25 0 6.69036 0 6C0 5.30964 0.559644 4.75 1.25 4.75C1.94036 4.75 2.5 5.30964 2.5 6C2.5 6.69036 1.94036 7.25 1.25 7.25Z" />
        <path opacity="0.13" d="M3.52519 1.75736C4.01334 2.24551 4.01334 3.03697 3.52519 3.52513C3.03703 4.01328 2.24557 4.01328 1.75742 3.52513C1.26926 3.03697 1.26926 2.24551 1.75742 1.75736C2.24557 1.2692 3.03703 1.2692 3.52519 1.75736Z" />
        <path opacity="0.63" d="M10.2425 8.47487C10.7306 8.96303 10.7306 9.75449 10.2425 10.2426C9.75432 10.7308 8.96286 10.7308 8.4747 10.2426C7.98655 9.75449 7.98655 8.96303 8.4747 8.47487C8.96286 7.98672 9.75432 7.98672 10.2425 8.47487Z" />
        <path opacity="0.88" d="M10.2428 3.52512C9.75461 4.01328 8.96316 4.01328 8.475 3.52512C7.98685 3.03697 7.98685 2.24551 8.475 1.75736C8.96316 1.2692 9.75461 1.2692 10.2428 1.75736C10.7309 2.24551 10.7309 3.03697 10.2428 3.52512Z" />
        <path opacity="0.38" d="M3.525 10.2426C3.03684 10.7308 2.24539 10.7308 1.75723 10.2426C1.26907 9.75448 1.26907 8.96303 1.75723 8.47487C2.24539 7.98672 3.03684 7.98672 3.525 8.47487C4.01315 8.96303 4.01315 9.75448 3.525 10.2426Z" />
      </g>
    ),
  },
  loader: {
    size: 18,
    body: (
      <>
        <circle cx="9" cy="2.75" r="1.75" fill="currentColor" />
        <circle cx="15.25" cy="9" r="1.75" opacity=".75" fill="currentColor" />
        <circle cx="9" cy="15.25" r="1.75" opacity=".5" fill="currentColor" />
        <circle cx="2.75" cy="9" r="1.75" opacity=".25" fill="currentColor" />
        <path
          d="m13.4194,6.3296c.4482,0,.896-.1704,1.2373-.5117.6821-.6821.6821-1.7925,0-2.4746-.6826-.6826-1.792-.6826-2.4746,0-.6821.6821-.6821,1.7925,0,2.4746.3413.3413.7891.5117,1.2373.5117Z"
          opacity=".88"
          fill="currentColor"
        />
        <path
          d="m12.1821,12.1821c-.6821.6821-.6821,1.7925,0,2.4746.3413.3413.7891.5117,1.2373.5117s.896-.1704,1.2373-.5117c.6821-.6821.6821-1.7925,0-2.4746-.6826-.6826-1.792-.6826-2.4746,0Z"
          opacity=".63"
          fill="currentColor"
        />
        <path
          d="m3.3433,12.1821c-.6821.6821-.6821,1.7925,0,2.4746.3413.3413.7891.5117,1.2373.5117s.896-.1704,1.2373-.5117c.6821-.6821.6821-1.7925,0-2.4746-.6826-.6826-1.792-.6826-2.4746,0Z"
          opacity=".38"
          fill="currentColor"
        />
        <path
          d="m3.3433,3.3433c-.6821.6821-.6821,1.7925,0,2.4746.3413.3413.7891.5117,1.2373.5117s.896-.1704,1.2373-.5117c.6821-.6821.6821-1.7925,0-2.4746-.6826-.6826-1.792-.6826-2.4746,0Z"
          opacity=".13"
          fill="currentColor"
        />
      </>
    ),
  },
  power: {
    size: 18,
    body: (
      <>
        <path
          d="M9,16.5c-4.136,0-7.5-3.364-7.5-7.5,0-2.634,1.35-5.028,3.61-6.404,.352-.215,.814-.103,1.03,.25,.216,.354,.104,.815-.251,1.031-1.81,1.102-2.89,3.017-2.89,5.123,0,3.309,2.691,6,6,6s6-2.691,6-6c0-2.106-1.08-4.021-2.89-5.123-.354-.215-.467-.677-.251-1.031,.216-.354,.678-.466,1.03-.25,2.261,1.376,3.61,3.77,3.61,6.404,0,4.136-3.364,7.5-7.5,7.5Z"
          fill="currentColor"
        />
        <path
          d="M9,9c-.414,0-.75-.336-.75-.75V1.75c0-.414,.336-.75,.75-.75s.75,.336,.75,.75v6.5c0,.414-.336,.75-.75,.75Z"
          fill="currentColor"
        />
      </>
    ),
  },
  // Toolbar, copy mode (no agent): Copy prompt (Nucleo UI clone-2, filled,
  // 18px), which morphs into copied (Nucleo UI check, outline, 12px) once
  // the prompt is on the clipboard. The check's path has pathLength 1, so
  // CSS can draw it in (Toolbar.css).
  copy: {
    size: 18,
    body: (
      <>
        <path
          d="M3.5 12.8828V7.75C3.5 5.4067 5.4067 3.5 7.75 3.5H12.8829C12.554 2.3494 11.5048 1.5 10.25 1.5H4.25C2.7334 1.5 1.5 2.7334 1.5 4.25V10.25C1.5 11.5049 2.3494 12.5542 3.5 12.8828Z"
          fill="currentColor"
          data-color="color-2"
        />
        <path
          d="M13.75 5H7.75C6.23122 5 5 6.23122 5 7.75V13.75C5 15.2688 6.23122 16.5 7.75 16.5H13.75C15.2688 16.5 16.5 15.2688 16.5 13.75V7.75C16.5 6.23122 15.2688 5 13.75 5Z"
          fill="currentColor"
        />
      </>
    ),
  },
  copied: {
    size: 12,
    body: (
      <path
        d="m1.76,7.004l2.25,3L10.24,1.746"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        pathLength={1}
      />
    ),
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
  // Inset sides: top is designed; right, bottom, left and all four are derived.
  "inset-all": insets("top", "right", "bottom", "left"),
  "inset-top": insets("top"),
  "inset-right": insets("right"),
  "inset-bottom": insets("bottom"),
  "inset-left": insets("left"),
  // Gaps: both and the row gap (gap-y) are designed; the column gap (gap-x) rotates the row gap.
  "gap-all": gap("all"),
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
  // text-align: center and justify are designed; left and right are derived from center.
  "text-align-left": textAlign([2.5, 6]),
  "text-align-center": textAlign([4.05859, 7.55859]),
  "text-align-right": textAlign([6, 9.5]),
  "text-align-justify": textAlign([2.5, 9.5]),
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
} satisfies Record<string, { size: number | [number, number]; body: JSX.Element }>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** Extra class names, for positioning. */
  class?: string;
}

/**
 * An icon at its own size (`size`: one number for a square, or [width,
 * height]). Decorative: hidden from assistive tech.
 */
export function Icon({ name, class: className }: IconProps) {
  const { size, body } = ICONS[name] as { size: number | [number, number]; body: JSX.Element };
  const [width, height] = typeof size === "number" ? [size, size] : size;
  return (
    <svg
      class={className ? `icon ${className}` : "icon"}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
