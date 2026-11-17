import { OBJECT_FIT_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * object-fit, as a select: how an image or video fills its box (stretched,
 * letterboxed, cropped…).
 */
export const objectFitEditor = keywordEditor({
  property: "object-fit",
  label: "Object fit",
  options: OBJECT_FIT_VALUES,
  // Tailwind's object-* fit utilities.
  aliases: ["object-contain", "object-cover", "object-fill", "object-none", "object-scale-down"],
});
