import { sidesEditor } from "../sides/sides.ts";

/**
 * Inset: one value for every side (`inset`), or one per side (`top`,
 * `right`, `bottom`, `left`), like padding and margin (see sides.ts and
 * SplitEditor). Negative values and `auto` are allowed (css/properties.ts).
 * Searched on its own (`inset`, `top`, `inset-x`…), and shown by position as
 * its row. Its fields show nothing on the page yet (no area is designed).
 * Its icons: the inset bar from each side to the center (`inset-top`…).
 */
export const insetEditor = sidesEditor({
  id: "inset",
  label: "Inset",
  title: "inset",
  shorthand: "inset",
  sideProperty: (side) => side,
  icons: "inset",
  // Tailwind's inset utilities: `inset`, `top`/`right`/`bottom`/`left`,
  // `inset-x`/`inset-y`, and `start`/`end` (inset-inline-start/end).
  aliases: {
    all: "inset",
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    x: "inset-x",
    y: "inset-y",
    start: "start",
    end: "end",
  },
});
