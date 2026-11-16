import { POSITION_VALUES } from "../../css/properties.ts";
import { insetEditor } from "../inset/InsetEditor.tsx";
import { revealEditor } from "../reveal/RevealEditor.tsx";

/**
 * Position, as a select, with inset as a row below it (see RevealEditor; the
 * row is set in LIST_ORDER). Searching `inset` (or `top`…) shows the inset
 * editor alone, without position.
 */
export const positionEditor = revealEditor({
  property: "position",
  label: "Position",
  options: POSITION_VALUES,
  rows: [insetEditor],
  // Tailwind's position utilities.
  aliases: ["static", "relative", "absolute", "fixed", "sticky"],
});
