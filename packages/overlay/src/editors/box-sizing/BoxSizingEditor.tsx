import { BOX_SIZING_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * box-sizing, as a select: whether width and height include the padding and
 * border (border-box) or only the content (content-box).
 */
export const boxSizingEditor = keywordEditor({
  property: "box-sizing",
  label: "Box sizing",
  options: BOX_SIZING_VALUES,
  // Tailwind's box-border / box-content.
  aliases: ["box-border", "box-content"],
});
