import type { BoxSide } from "../../dom/boxModel.ts";
import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * Padding as four rows, one per side, each a length editor like width.
 * Tailwind's aliases pick the rows: `p` (and `pad`, `padding`) shows all four,
 * `px` right and left, `py` top and bottom, `pt`/`pr`/`pb`/`pl` just one.
 * A side with no inline value shows a dimmed dash. Hovering or focusing a row stripes that padding on the page.
 */
const side = (s: BoxSide, aliases: string[]) =>
  lengthEditor({
    property: `padding-${s}`,
    label: `Padding ${s}`,
    aliases: ["p", ...aliases],
    inspect: { box: "padding", side: s },
  });

export const paddingTopEditor = side("top", ["pt", "py"]);
export const paddingRightEditor = side("right", ["pr", "px"]);
export const paddingBottomEditor = side("bottom", ["pb", "py"]);
export const paddingLeftEditor = side("left", ["pl", "px"]);
