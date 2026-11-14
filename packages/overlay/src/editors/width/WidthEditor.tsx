import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * The width family, each field with a drag handle. Typing `w` or `width`
 * shows all three (width first); `min-w`/`min-width` or `max-w`/`max-width`
 * shows just that one.
 */
export const widthEditor = lengthEditor({
  property: "width",
  label: "Width",
  aliases: ["w"],
  scrub: true,
});

export const minWidthEditor = lengthEditor({
  property: "min-width",
  label: "Min width",
  aliases: ["min-w"],
  family: "width",
  scrub: true,
});

export const maxWidthEditor = lengthEditor({
  property: "max-width",
  label: "Max width",
  aliases: ["max-w"],
  family: "width",
  scrub: true,
});
