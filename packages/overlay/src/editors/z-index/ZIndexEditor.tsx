import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * z-index: a whole number (negatives too) or `auto`, in a plain field, no
 * drag handle. Which positioned element is drawn on top: higher comes first.
 */
export const zIndexEditor = lengthEditor({
  property: "z-index",
  label: "Z-index",
  // Tailwind's z-* utilities (z-10, z-auto).
  aliases: ["z"],
});
