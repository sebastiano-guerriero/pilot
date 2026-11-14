import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * The height family, like width: each field with a drag handle. Typing `h`
 * or `height` shows all three (height first); `min-h`/`min-height` or
 * `max-h`/`max-height` shows just that one.
 */
export const heightEditor = lengthEditor({
  property: "height",
  label: "Height",
  aliases: ["h"],
  scrub: true,
});

export const minHeightEditor = lengthEditor({
  property: "min-height",
  label: "Min height",
  aliases: ["min-h"],
  family: "height",
  scrub: true,
});

export const maxHeightEditor = lengthEditor({
  property: "max-height",
  label: "Max height",
  aliases: ["max-h"],
  family: "height",
  scrub: true,
});
