import {
  FONT_STYLE_VALUES,
  FONT_VARIANT_NUMERIC_VALUES,
  FONT_WEIGHTS,
  TEXT_ALIGN_VALUES,
  TEXT_OVERFLOW_VALUES,
  TEXT_WRAP_VALUES,
  WHITE_SPACE_VALUES,
} from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { lengthEditor } from "../length/LengthEditor.tsx";
import { presetEditor } from "../preset/PresetEditor.tsx";

/**
 * The text's font and spacing: fields (font-size, line-height and
 * letter-spacing with a drag handle), a select for font-style, and the
 * weights as presets with a custom field.
 */

/** font-family: the font names, as typed (`Inter, sans-serif`), case kept. */
export const fontFamilyEditor = lengthEditor({
  property: "font-family",
  label: "Font family",
  // Tailwind's font-sans / font-serif / font-mono.
  aliases: ["font-sans", "font-serif", "font-mono"],
});

/** font-size: a length, a percentage, or a size keyword (`small`, `larger`…). */
export const fontSizeEditor = lengthEditor({
  property: "font-size",
  label: "Font size",
  // Tailwind's text-* sizes (text-sm, text-lg…).
  aliases: ["text"],
  scrub: true,
});

/** font-style: normal, italic or oblique. */
export const fontStyleEditor = keywordEditor({
  property: "font-style",
  label: "Font style",
  options: FONT_STYLE_VALUES,
  // Tailwind's italic / not-italic.
  aliases: ["italic", "not-italic"],
});

/**
 * font-weight: the nine weights (100–900), and custom for any other (a
 * variable font's 450, or `bold`).
 */
export const fontWeightEditor = presetEditor({
  property: "font-weight",
  label: "Font weight",
  presets: FONT_WEIGHTS,
  customLabel: "custom font-weight",
  // Tailwind's font-thin … font-black.
  aliases: [
    "font-thin",
    "font-extralight",
    "font-light",
    "font-normal",
    "font-medium",
    "font-semibold",
    "font-bold",
    "font-extrabold",
    "font-black",
  ],
});

/** line-height: unitless (`1.5`, a multiple of the font size), a length, or normal. */
export const lineHeightEditor = lengthEditor({
  property: "line-height",
  label: "Line height",
  // Tailwind's leading-*.
  aliases: ["leading"],
  scrub: true,
});

/**
 * text-align, as a select with an icon per value: left, center, right,
 * justify. A value set some other way (`start`, `end`) is still shown.
 */
export const textAlignEditor = keywordEditor({
  property: "text-align",
  label: "Text align",
  options: TEXT_ALIGN_VALUES,
  icons: {
    "": "layout-empty",
    left: "text-align-left",
    center: "text-align-center",
    right: "text-align-right",
    justify: "text-align-justify",
  },
  // Tailwind's text-left … text-justify, text-start, text-end.
  aliases: ["text-left", "text-center", "text-right", "text-justify", "text-start", "text-end"],
});

/** letter-spacing: a length (negatives too: tighter), or normal. */
export const letterSpacingEditor = lengthEditor({
  property: "letter-spacing",
  label: "Letter spacing",
  // Tailwind's tracking-*.
  aliases: ["tracking"],
  scrub: true,
});

/**
 * font-variant-numeric, as a select, labeled `font-numeric` (the full name
 * doesn't fit the row's label): how digits are drawn (tabular-nums lines them
 * up in columns).
 */
export const fontVariantNumericEditor = keywordEditor({
  property: "font-variant-numeric",
  name: "font-numeric",
  label: "Font variant numeric",
  options: FONT_VARIANT_NUMERIC_VALUES,
  // Tailwind's numeric utilities (and the row's label).
  aliases: [
    "font-numeric",
    "normal-nums",
    "tabular-nums",
    "proportional-nums",
    "lining-nums",
    "oldstyle-nums",
    "slashed-zero",
    "ordinal",
    "diagonal-fractions",
    "stacked-fractions",
  ],
});

/** text-indent: the first line's indent, a length (negatives too: a hanging indent), with a drag handle. */
export const textIndentEditor = lengthEditor({
  property: "text-indent",
  label: "Text indent",
  // Tailwind's indent-*.
  aliases: ["indent"],
  scrub: true,
});

/** text-wrap, as a select: balance evens out a heading's lines, pretty avoids a lone last word. */
export const textWrapEditor = keywordEditor({
  property: "text-wrap",
  label: "Text wrap",
  options: TEXT_WRAP_VALUES,
  // Tailwind's text-nowrap / text-balance / text-pretty (text-wrap is the property).
  aliases: ["text-nowrap", "text-balance", "text-pretty"],
});

/** white-space, as a select: how spaces and line breaks in the text are kept. */
export const whiteSpaceEditor = keywordEditor({
  property: "white-space",
  label: "White space",
  options: WHITE_SPACE_VALUES,
  // Tailwind's whitespace-*.
  aliases: ["whitespace"],
});

/**
 * text-overflow, as a select: ellipsis ends cut-off text with "…" (with
 * overflow: hidden and white-space: nowrap, Tailwind's truncate).
 */
export const textOverflowEditor = keywordEditor({
  property: "text-overflow",
  label: "Text overflow",
  options: TEXT_OVERFLOW_VALUES,
  // Tailwind's text-ellipsis / text-clip, and truncate.
  aliases: ["text-ellipsis", "text-clip", "truncate"],
});
