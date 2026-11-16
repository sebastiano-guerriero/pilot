import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * border-radius: one value for every corner (`border-radius: 8px`), in a
 * field with a drag handle. A length or a percentage, never negative.
 */
export const borderRadiusEditor = lengthEditor({
  property: "border-radius",
  label: "Border radius",
  // Tailwind's rounded-* utilities.
  aliases: ["rounded"],
  scrub: true,
});
