import { ALIGN_SELF_VALUES, JUSTIFY_SELF_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * align-self and justify-self: where one item sits in its own area, over
 * its parent's align-items / justify-items. Selects with an icon per value;
 * auto (follow the parent) is the centered one, dimmed. justify-self only
 * works in a grid.
 */
export const alignSelfEditor = keywordEditor({
  property: "align-self",
  label: "Align self",
  options: ALIGN_SELF_VALUES,
  icons: {
    "": "layout-empty",
    auto: "align-self-auto",
    start: "align-self-start",
    center: "align-self-center",
    end: "align-self-end",
    stretch: "align-self-stretch",
    baseline: "align-baseline",
  },
  // Tailwind's self-* utilities.
  aliases: ["self-auto", "self-start", "self-center", "self-end", "self-stretch", "self-baseline"],
});

export const justifySelfEditor = keywordEditor({
  property: "justify-self",
  label: "Justify self",
  options: JUSTIFY_SELF_VALUES,
  icons: {
    "": "layout-empty",
    auto: "justify-self-auto",
    start: "justify-self-start",
    center: "justify-self-center",
    end: "justify-self-end",
    stretch: "justify-self-stretch",
  },
  // Tailwind's justify-self-* utilities.
  aliases: ["justify-self-auto", "justify-self-start", "justify-self-center", "justify-self-end", "justify-self-stretch"],
});
