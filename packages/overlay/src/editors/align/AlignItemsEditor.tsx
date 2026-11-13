import { ALIGN_ITEMS_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * align-items, as a select with an icon per value: where the items sit
 * across the row (top, middle, bottom, full height, or on a shared baseline).
 * Nothing set shows the crossed-out frame.
 */
export const alignItemsEditor = keywordEditor({
  property: "align-items",
  label: "Align items",
  options: ALIGN_ITEMS_VALUES,
  icons: {
    "": "layout-empty",
    start: "align-start",
    center: "align-center",
    end: "align-end",
    stretch: "align-stretch",
    baseline: "align-baseline",
  },
  // Tailwind's items-* utilities.
  aliases: ["items-start", "items-center", "items-end", "items-stretch", "items-baseline"],
});
