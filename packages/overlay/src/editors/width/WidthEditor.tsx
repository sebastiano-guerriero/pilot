import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * The width family. Typing `w` or `width` shows all three (width first);
 * `min-w`/`min-width` or `max-w`/`max-width` shows just that one.
 */
export const widthEditor = lengthEditor({
  property: "width",
  label: "Width",
  aliases: ["w"],
});

export const minWidthEditor = lengthEditor({
  property: "min-width",
  label: "Min width",
  aliases: ["min-w"],
  family: "width",
});

export const maxWidthEditor = lengthEditor({
  property: "max-width",
  label: "Max width",
  aliases: ["max-w"],
  family: "width",
});
