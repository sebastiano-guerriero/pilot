import { ALIGN_CONTENT_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * align-content, as a select with an icon per value: where the lines (a
 * grid's rows, a wrapping flex container's lines) sit across the container,
 * justify-content's values on the other axis, plus stretch. Nothing set
 * shows the crossed-out frame.
 */
export const alignContentEditor = keywordEditor({
  property: "align-content",
  label: "Align content",
  options: ALIGN_CONTENT_VALUES,
  icons: {
    "": "layout-empty",
    start: "align-content-start",
    end: "align-content-end",
    center: "align-content-center",
    "space-between": "align-content-between",
    "space-around": "align-content-around",
    "space-evenly": "align-content-evenly",
    stretch: "align-content-stretch",
  },
  // Tailwind's content-* utilities.
  aliases: [
    "content-start",
    "content-end",
    "content-center",
    "content-between",
    "content-around",
    "content-evenly",
    "content-stretch",
  ],
});
