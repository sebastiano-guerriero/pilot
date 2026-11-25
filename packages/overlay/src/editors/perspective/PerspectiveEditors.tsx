import { OBJECT_POSITION_VALUES } from "../../css/properties.ts";
import type { IconName } from "../../ui/components/Icon/Icon.tsx";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { presetEditor } from "../preset/PresetEditor.tsx";

/**
 * 3D for what's inside an element (the Transform group, after rotate). Set
 * on the parent of what tilts: perspective gives its children depth (an X or
 * Y rotation leans back instead of squashing), perspective-origin is where
 * the viewer stands, transform-style keeps the children's own 3D, and
 * backface-visibility hides an element turned away (a card flip). The
 * `perspective()` function inside a transform isn't offered (the owner's
 * call): the property, on whichever element, covers it.
 */

/** Tailwind's named distances, as presets, their names dimmed after them. */
export const PERSPECTIVE_VALUES = ["100px", "300px", "500px", "800px", "1200px", "none"] as const;
const PERSPECTIVE_NAMES: Record<string, string> = {
  "100px": "dramatic",
  "300px": "near",
  "500px": "normal",
  "800px": "midrange",
  "1200px": "distant",
};

export const perspectiveEditor = presetEditor({
  property: "perspective",
  label: "Perspective",
  presets: PERSPECTIVE_VALUES,
  hints: PERSPECTIVE_NAMES,
  placeholder: "800px",
  customLabel: "custom perspective",
  // Tailwind's perspective-* utilities.
  aliases: [
    "perspective-dramatic",
    "perspective-near",
    "perspective-normal",
    "perspective-midrange",
    "perspective-distant",
    "perspective-none",
  ],
});

/** perspective-origin's presets: object-position's nine, with their icons. */
const ORIGIN_ICONS: Record<string, IconName> = {
  "": "layout-empty",
  "top left": "object-top-left",
  top: "object-top",
  "top right": "object-top-right",
  left: "object-left",
  center: "object-center",
  right: "object-right",
  "bottom left": "object-bottom-left",
  bottom: "object-bottom",
  "bottom right": "object-bottom-right",
  custom: "object-custom",
};

export const perspectiveOriginEditor = presetEditor({
  property: "perspective-origin",
  // perspective-origin doesn't fit the row's label.
  name: "persp-origin",
  label: "Perspective origin",
  presets: OBJECT_POSITION_VALUES,
  icons: ORIGIN_ICONS,
  placeholder: "25% 75%",
  customLabel: "custom perspective-origin",
  // Tailwind's perspective-origin-*, and the row's label.
  aliases: [
    "persp-origin",
    "perspective-origin-center",
    "perspective-origin-top",
    "perspective-origin-top-right",
    "perspective-origin-right",
    "perspective-origin-bottom-right",
    "perspective-origin-bottom",
    "perspective-origin-bottom-left",
    "perspective-origin-left",
    "perspective-origin-top-left",
  ],
});

export const transformStyleEditor = keywordEditor({
  property: "transform-style",
  label: "Transform style",
  options: ["flat", "preserve-3d"],
  // Tailwind's transform-3d, transform-flat.
  aliases: ["transform-3d", "transform-flat"],
});

export const backfaceVisibilityEditor = keywordEditor({
  property: "backface-visibility",
  // backface-visibility doesn't fit the row's label: Tailwind's word.
  name: "backface",
  label: "Backface visibility",
  options: ["visible", "hidden"],
  // Tailwind's backface-visible, backface-hidden.
  aliases: ["backface-visible", "backface-hidden"],
});
