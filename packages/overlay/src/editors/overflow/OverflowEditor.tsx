import { OVERFLOW_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * overflow, as a select: what happens to content that doesn't fit the box
 * (shown, clipped, or scrolled). Writes the shorthand, for both axes; a page
 * value set per axis (`overflow-x` alone) isn't shown here.
 */
export const overflowEditor = keywordEditor({
  property: "overflow",
  label: "Overflow",
  options: OVERFLOW_VALUES,
  // Tailwind's overflow-* utilities.
  aliases: ["overflow-auto", "overflow-hidden", "overflow-clip", "overflow-visible", "overflow-scroll"],
});
