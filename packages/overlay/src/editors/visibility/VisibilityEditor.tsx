import { VISIBILITY_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * visibility, as a select: whether the element is drawn (it keeps its space
 * when hidden, unlike display: none).
 */
export const visibilityEditor = keywordEditor({
  property: "visibility",
  label: "Visibility",
  options: VISIBILITY_VALUES,
  // Tailwind's visible/invisible/collapse utilities.
  aliases: ["visible", "invisible", "collapse"],
});
