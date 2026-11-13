import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * order: a whole number (negatives too), in a plain field, no drag handle.
 * Where a flex or grid item goes among its siblings: lower comes first.
 */
export const orderEditor = lengthEditor({
  property: "order",
  label: "Order",
  aliases: ["order"],
});
