import {
  APPEARANCE_VALUES,
  CURSOR_VALUES,
  POINTER_EVENTS_VALUES,
  USER_SELECT_VALUES,
  WILL_CHANGE_VALUES,
} from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { presetEditor } from "../preset/PresetEditor.tsx";

/**
 * How the element responds to the pointer, as selects. Tailwind names most
 * of these after the property (cursor-pointer, pointer-events-none), which
 * the search already finds: no aliases for those.
 */

/** cursor: the pointer's shape over the element. */
export const cursorEditor = keywordEditor({
  property: "cursor",
  label: "Cursor",
  options: CURSOR_VALUES,
});

/** pointer-events: none lets clicks and hovers pass through to what's behind. */
export const pointerEventsEditor = keywordEditor({
  property: "pointer-events",
  label: "Pointer events",
  options: POINTER_EVENTS_VALUES,
});

/** user-select: whether the element's text can be selected, and how. */
export const userSelectEditor = keywordEditor({
  property: "user-select",
  label: "User select",
  options: USER_SELECT_VALUES,
  // Tailwind's select-none / -text / -all / -auto.
  aliases: ["select"],
});

/** appearance: none drops a form control's native look (a select's arrow). */
export const appearanceEditor = keywordEditor({
  property: "appearance",
  label: "Appearance",
  options: APPEARANCE_VALUES,
});

/**
 * will-change: tells the browser what's about to animate. Tailwind's four as
 * presets, and custom for any property names (`opacity, transform`).
 */
export const willChangeEditor = presetEditor({
  property: "will-change",
  label: "Will change",
  presets: WILL_CHANGE_VALUES,
  placeholder: "opacity",
  customLabel: "custom will-change",
});
