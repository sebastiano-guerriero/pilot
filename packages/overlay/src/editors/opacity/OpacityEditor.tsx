import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * opacity: 0–100, like the color editor's opacity field (kind `percent`):
 * `50` writes `50%`, a fraction (`0.5`) works too, and the page's `0.5`
 * shows as 50. With a drag handle, stopping at 0 and 100.
 */
export const opacityEditor = lengthEditor({
  property: "opacity",
  label: "Opacity",
  // Tailwind's opacity-* is the property name: no aliases needed.
  scrub: true,
});
