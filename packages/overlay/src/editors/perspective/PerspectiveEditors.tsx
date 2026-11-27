import { OBJECT_POSITION_VALUES } from "../../css/properties.ts";
import type { IconName } from "../../ui/components/Icon/Icon.tsx";
import type { PropertyEditor } from "../types.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { presetEditor } from "../preset/PresetEditor.tsx";

/**
 * transform-origin: the point the element turns and scales around (its
 * center unless set), object-position's nine with their icons, and custom
 * (a length, or a third value for depth).
 *
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

/** transform-origin's and perspective-origin's presets: object-position's nine, with their icons. */
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

// transform-origin and transform-style: shown with the transform editor when `transform` is searched (its family).
export const transformOriginEditor: PropertyEditor = {
  family: "transform",
  ...presetEditor({
  property: "transform-origin",
  label: "Transform origin",
  presets: OBJECT_POSITION_VALUES,
  icons: ORIGIN_ICONS,
  placeholder: "25% 75%",
  customLabel: "custom transform-origin",
  // Tailwind's origin-*.
  aliases: [
    "origin-center",
    "origin-top",
    "origin-top-right",
    "origin-right",
    "origin-bottom-right",
    "origin-bottom",
    "origin-bottom-left",
    "origin-left",
    "origin-top-left",
  ],
  }),
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

export const transformStyleEditor: PropertyEditor = {
  family: "transform",
  ...keywordEditor({
    property: "transform-style",
    label: "Transform style",
    options: ["flat", "preserve-3d"],
    // Tailwind's transform-3d, transform-flat.
    aliases: ["transform-3d", "transform-flat"],
  }),
};

export const backfaceVisibilityEditor = keywordEditor({
  property: "backface-visibility",
  // backface-visibility doesn't fit the row's label: Tailwind's word.
  name: "backface",
  label: "Backface visibility",
  options: ["visible", "hidden"],
  // Tailwind's backface-visible, backface-hidden.
  aliases: ["backface-visible", "backface-hidden"],
});
