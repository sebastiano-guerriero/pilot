import { FLOAT_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/**
 * float, as a select: the element moves to one side of its line and the text
 * after it wraps around it (inline-start and inline-end follow the writing
 * direction).
 */
export const floatEditor = keywordEditor({
  property: "float",
  label: "Float",
  options: FLOAT_VALUES,
  // Tailwind's float-left, float-start…
  aliases: ["float-left", "float-right", "float-start", "float-end", "float-none"],
});
