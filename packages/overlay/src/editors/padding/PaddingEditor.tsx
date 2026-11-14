import { sidesEditor } from "../sides/sides.ts";

/**
 * Padding: one value for every side (`padding`), or one per side
 * (`padding-top`…), switched with the button at the right of the row (see
 * SplitEditor). Typing a side or a pair in the search shows each side right
 * away, and Tab lands on it: `pt`/`pr`/`pb`/`pl` (and `ps`/`pe`,
 * `padding-left`, `padding-inline-start`…) on that side, `px`/`py` (and
 * `padding-inline`/`padding-block`) on a pair (a value typed sets both).
 * `p` shows the one value.
 */
export const paddingEditor = sidesEditor({
  id: "padding",
  label: "Padding",
  title: "padding",
  shorthand: "padding",
  box: "padding",
  aliases: { all: "p", top: "pt", right: "pr", bottom: "pb", left: "pl", x: "px", y: "py", start: "ps", end: "pe" },
});
