import { JUSTIFY_ITEMS_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * justify-items, as a select with an icon per value: where a grid's items
 * sit along the row, in their own areas (align-items on the other axis).
 * Nothing set shows the crossed-out frame.
 */
export const justifyItemsEditor = keywordEditor({
  property: "justify-items",
  label: "Justify items",
  options: JUSTIFY_ITEMS_VALUES,
  icons: {
    "": "layout-empty",
    start: "justify-items-start",
    center: "justify-items-center",
    end: "justify-items-end",
    stretch: "justify-items-stretch",
  },
  // Tailwind's justify-items-* utilities.
  aliases: ["justify-items-start", "justify-items-center", "justify-items-end", "justify-items-stretch"],
});
