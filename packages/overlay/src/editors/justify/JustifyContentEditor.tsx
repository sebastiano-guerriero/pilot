import { JUSTIFY_CONTENT_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * justify-content, as a select with an icon per value: where the content
 * sits along the row. Nothing set shows the crossed-out frame. A value set
 * some other way (`flex-start`, `normal`…) still shows, without an icon.
 */
export const justifyContentEditor = keywordEditor({
  property: "justify-content",
  label: "Justify content",
  options: JUSTIFY_CONTENT_VALUES,
  icons: {
    "": "layout-empty",
    start: "justify-start",
    end: "justify-end",
    center: "justify-center",
    "space-between": "justify-between",
    "space-around": "justify-around",
    "space-evenly": "justify-evenly",
  },
  // Tailwind's justify-* utilities.
  aliases: ["justify-start", "justify-end", "justify-center", "justify-between", "justify-around", "justify-evenly"],
});
