import { OBJECT_FIT_VALUES, OBJECT_POSITION_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { presetEditor } from "../preset/PresetEditor.tsx";

/**
 * object-fit, as a select: how an image or video fills its box (stretched,
 * letterboxed, cropped…).
 */
export const objectFitEditor = keywordEditor({
  property: "object-fit",
  label: "Object fit",
  options: OBJECT_FIT_VALUES,
  icons: {
    "": "layout-empty",
    fill: "object-fit-fill",
    contain: "object-fit-contain",
    cover: "object-fit-cover",
    "scale-down": "object-fit-scale-down",
    none: "object-fit-none",
  },
  // Tailwind's object-* fit utilities.
  aliases: ["object-contain", "object-cover", "object-fill", "object-none", "object-scale-down"],
});

/**
 * object-position: where an image or video sits in its box when it doesn't
 * fill it (object-fit contain, cover, none). Tailwind's nine positions as
 * presets, and custom for any other (`25% 75%`, `right 10px bottom 20px`;
 * Tailwind's `25%_75%` works too).
 */
export const objectPositionEditor = presetEditor({
  property: "object-position",
  label: "Object position",
  presets: OBJECT_POSITION_VALUES,
  placeholder: "25% 75%",
  customLabel: "custom object-position",
  icons: {
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
  },
  // Tailwind's object-* position utilities.
  aliases: [
    "object-top-left",
    "object-top",
    "object-top-right",
    "object-left",
    "object-center",
    "object-right",
    "object-bottom-left",
    "object-bottom",
    "object-bottom-right",
  ],
});
