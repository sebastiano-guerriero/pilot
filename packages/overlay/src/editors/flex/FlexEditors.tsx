import { FLEX_DIRECTION_VALUES, FLEX_WRAP_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * flex-direction, as a select with an icon per value: which way the items
 * run. Nothing set shows the crossed-out frame. Found on its own, and shown
 * by display as one of its flex rows.
 */
export const flexDirectionEditor = keywordEditor({
  property: "flex-direction",
  label: "Flex direction",
  options: FLEX_DIRECTION_VALUES,
  icons: {
    "": "layout-empty",
    row: "flex-row",
    "row-reverse": "flex-row-reverse",
    column: "flex-col",
    "column-reverse": "flex-col-reverse",
  },
  // Tailwind's flex-row/flex-col utilities.
  aliases: ["flex-row", "flex-row-reverse", "flex-col", "flex-col-reverse"],
});

/**
 * flex-wrap, as a select with an icon per value: whether items wrap onto
 * more lines. Nothing set shows the crossed-out frame. Found on its own, and
 * shown by display as one of its flex rows.
 */
export const flexWrapEditor = keywordEditor({
  property: "flex-wrap",
  label: "Flex wrap",
  options: FLEX_WRAP_VALUES,
  icons: {
    "": "layout-empty",
    nowrap: "flex-nowrap",
    wrap: "flex-wrap",
    "wrap-reverse": "flex-wrap-reverse",
  },
  // Tailwind's flex-wrap utilities (`flex-wrap` is also the property's name).
  aliases: ["flex-wrap-reverse", "flex-nowrap"],
});
