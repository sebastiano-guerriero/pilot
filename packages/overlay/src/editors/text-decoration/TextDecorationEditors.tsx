import { TEXT_DECORATION_LINE_VALUES, TEXT_DECORATION_STYLE_VALUES } from "../../css/properties.ts";
import { colorEditor } from "../color/ColorEditor.tsx";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * The text's decoration: its line (underline…), color, style, thickness and
 * the underline's offset. The full names don't fit the row's label, so the
 * rows are named Tailwind's way: decoration-line, decoration-color,
 * decoration-style, decoration-width (thickness), underline-offset. Their
 * search labels start the same, so `decoration` finds all four.
 */
export const textDecorationLineEditor = keywordEditor({
  property: "text-decoration-line",
  name: "decoration-line",
  label: "Decoration line",
  options: TEXT_DECORATION_LINE_VALUES,
  // Tailwind's underline, overline, line-through, no-underline.
  aliases: ["underline", "overline", "line-through", "no-underline"],
});

export const textDecorationColorEditor = colorEditor({
  property: "text-decoration-color",
  name: "decoration-color",
  label: "Decoration color",
});

export const textDecorationStyleEditor = keywordEditor({
  property: "text-decoration-style",
  name: "decoration-style",
  label: "Decoration style",
  options: TEXT_DECORATION_STYLE_VALUES,
  // Tailwind's decoration-solid… decoration-wavy.
  aliases: ["decoration-solid", "decoration-double", "decoration-dotted", "decoration-dashed", "decoration-wavy"],
});

/** text-decoration-thickness: a length (`2` is 2px), `auto` or `from-font`; with a drag handle. */
export const textDecorationThicknessEditor = lengthEditor({
  property: "text-decoration-thickness",
  name: "decoration-width",
  label: "Decoration width",
  scrub: true,
  // Tailwind's decoration-auto, decoration-from-font.
  aliases: ["decoration-auto", "decoration-from-font"],
});

/** text-underline-offset: how far below the text the underline sits; negatives too, or `auto`; with a drag handle. */
export const textUnderlineOffsetEditor = lengthEditor({
  property: "text-underline-offset",
  name: "underline-offset",
  label: "Underline offset",
  scrub: true,
  // Tailwind's underline-offset-*.
  aliases: ["underline-offset"],
});
