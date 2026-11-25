import { sidesEditor } from "../sides/sides.ts";

/**
 * Margin: one value for every side (`margin`), or one per side
 * (`margin-top`…), like padding (see sides.ts and SplitEditor). Negative
 * values and `auto` are allowed (css/properties.ts). `mx` + `auto` centers.
 */
export const marginEditor = sidesEditor({
  id: "margin",
  label: "Margin",
  title: "margin",
  shorthand: "margin",
  box: "margin",
  icons: "margin",
  // Split, each row is labeled by its side's property (margin-top…), as gap's.
  rowLabels: true,
  aliases: { all: "m", top: "mt", right: "mr", bottom: "mb", left: "ml", x: "mx", y: "my", start: "ms", end: "me" },
});
