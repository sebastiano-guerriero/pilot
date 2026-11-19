import { BLEND_MODE_VALUES, MIX_BLEND_MODE_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";

/** How the element blends with what's behind it, as a select. */
export const mixBlendModeEditor = keywordEditor({
  property: "mix-blend-mode",
  label: "Mix blend mode",
  options: MIX_BLEND_MODE_VALUES,
  // Tailwind's mix-blend-*.
  aliases: ["mix-blend"],
});

/**
 * How the element's background images blend with each other and its
 * background color, as a select, labeled `bg-blend-mode` (the full name
 * doesn't fit the row's label).
 */
export const backgroundBlendModeEditor = keywordEditor({
  property: "background-blend-mode",
  name: "bg-blend-mode",
  label: "Background blend mode",
  options: BLEND_MODE_VALUES,
  // Tailwind's bg-blend-* (and the row's label).
  aliases: ["bg-blend", "bg-blend-mode"],
});
