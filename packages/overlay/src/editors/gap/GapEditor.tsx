import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * gap: a length field with a drag handle. While it's hovered or focused, a
 * grid's gaps are striped on the page. Found on its own, and shown by display
 * as one of its grid rows.
 */
export const gapEditor = lengthEditor({
  property: "gap",
  label: "Gap",
  inspect: { box: "gap" },
  scrub: true,
});
