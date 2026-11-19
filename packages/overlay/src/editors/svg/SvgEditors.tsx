import { colorEditor } from "../color/ColorEditor.tsx";
import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * An SVG's paint: fill and stroke are colors (the color editor, with `none`
 * for no paint), stroke-width a length (`2` is 2px). Tailwind's fill-*,
 * stroke-* are the property names; stroke-width's stroke-2 would collide with
 * stroke's, so it has no alias. stroke-width has a drag handle.
 */

export const fillEditor = colorEditor({ property: "fill", label: "Fill", keywords: ["none"] });

export const strokeEditor = colorEditor({ property: "stroke", label: "Stroke", keywords: ["none"] });

export const strokeWidthEditor = lengthEditor({ property: "stroke-width", label: "Stroke width", scrub: true });
