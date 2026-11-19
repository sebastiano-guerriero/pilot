import { LIST_STYLE_POSITION_VALUES, LIST_STYLE_TYPE_VALUES } from "../../css/properties.ts";
import { keywordEditor } from "../keyword/KeywordEditor.tsx";
import { presetEditor } from "../preset/PresetEditor.tsx";

/**
 * A list's markers. They write the longhands, not the `list-style`
 * shorthand, which would also reset the page's list-style-image. They show
 * on list items (`li`, or `display: list-item`); set on the list, items
 * inherit them.
 *
 * list-style-type: the usual styles, and custom for any other counter style
 * (`lower-greek`) or text as the marker (`—`, written `"—"`). Tailwind has
 * list-disc, list-decimal and list-none.
 */
export const listStyleTypeEditor = presetEditor({
  property: "list-style-type",
  label: "List style type",
  presets: LIST_STYLE_TYPE_VALUES,
  placeholder: "—",
  customLabel: "custom list-style-type",
  // Tailwind's list-* type utilities.
  aliases: ["list-disc", "list-decimal", "list-none"],
});

/** list-style-position: the marker outside the text's box, or inside it as its first letter. */
export const listStylePositionEditor = keywordEditor({
  property: "list-style-position",
  // list-style-position doesn't fit the row label.
  name: "list-position",
  label: "List style position",
  options: LIST_STYLE_POSITION_VALUES,
  // Tailwind's list-inside / list-outside.
  aliases: ["list-inside", "list-outside"],
});
