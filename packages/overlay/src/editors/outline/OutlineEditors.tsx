import { OUTLINE_STYLE_VALUES } from "../../css/properties.ts";
import { colorEditor } from "../color/ColorEditor.tsx";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * The outline, as its four longhands rather than the shorthand (the owner's
 * call), in the Effects group after box-shadow: drawn over the box, like a
 * shadow, outside the layout. In the shorthand's order (width, style,
 * color), then the offset, which it leaves out. Built like the text
 * decoration's rows.
 */
export const outlineColorEditor = colorEditor({
  property: "outline-color",
  label: "Outline color",
});

export const outlineStyleEditor = keywordEditor({
  property: "outline-style",
  label: "Outline style",
  options: OUTLINE_STYLE_VALUES,
  // Tailwind's outline-solid, outline-dashed, outline-dotted, outline-double, outline-none.
  aliases: ["outline-solid", "outline-dashed", "outline-dotted", "outline-double", "outline-none"],
});

/** outline-width: a length (`2` is 2px), or thin, medium, thick; with a drag handle. */
export const outlineWidthEditor = lengthEditor({
  property: "outline-width",
  label: "Outline width",
  scrub: true,
});

/** outline-offset: how far outside the border the outline sits; negatives draw it inside. With a drag handle. */
export const outlineOffsetEditor = lengthEditor({
  property: "outline-offset",
  label: "Outline offset",
  scrub: true,
});
