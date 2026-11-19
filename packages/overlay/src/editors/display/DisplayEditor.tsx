import { DISPLAY_VALUES } from "../../css/properties.ts";
import { alignContentEditor } from "../align/AlignContentEditor.tsx";
import { alignItemsEditor } from "../align/AlignItemsEditor.tsx";
import { flexDirectionEditor, flexWrapEditor } from "../flex/FlexEditors.tsx";
import { gapEditor } from "../gap/GapEditor.tsx";
import { gridColumnsEditor } from "../grid-columns/GridColumnsEditor.tsx";
import { gridRowsEditor } from "../grid-rows/GridRowsEditor.tsx";
import { justifyContentEditor } from "../justify/JustifyContentEditor.tsx";
import { justifyItemsEditor } from "../justify/JustifyItemsEditor.tsx";
import { revealEditor, revealedRows } from "../reveal/RevealEditor.tsx";
import type { PropertyEditor } from "../types.ts";

/**
 * The editors display can show as rows below the select. Which ones, and in
 * what order, for each display value is set in LIST_ORDER
 * (editors/listOrder.ts: grid → grid-columns, grid-rows, gap…; flex → flex-direction,
 * flex-wrap, gap…). Each row is an editor of its own: searching for it (`gap`,
 * `cols`, `flex-col`, `items`…) shows just that editor, without display.
 */
const ROW_EDITORS: PropertyEditor[] = [
  gridColumnsEditor,
  gridRowsEditor,
  flexDirectionEditor,
  flexWrapEditor,
  gapEditor,
  justifyContentEditor,
  justifyItemsEditor,
  alignItemsEditor,
  alignContentEditor,
];

/**
 * The display values offered for the one set now: DISPLAY_VALUES, plus
 * `-webkit-box` before `none` while it's set (line-clamp sets it, see
 * editors/line-clamp). It's offered only then: on its own it's a legacy value
 * nobody picks.
 */
export function displayOptions(value: string): readonly string[] {
  if (value !== "-webkit-box") return DISPLAY_VALUES;
  const at = DISPLAY_VALUES.indexOf("none");
  return [...DISPLAY_VALUES.slice(0, at), "-webkit-box", ...DISPLAY_VALUES.slice(at)];
}

/**
 * Display, as a select. Picking `grid` (or `inline-grid`) shows the grid rows
 * below it, `flex` (or `inline-flex`) the flex rows (see RevealEditor).
 */
export const displayEditor = revealEditor({
  property: "display",
  label: "Display",
  options: displayOptions,
  rows: ROW_EDITORS,
  // Tailwind's display utilities: they all land here.
  aliases: ["grid", "inline-grid", "flex", "inline-flex", "block", "inline-block", "inline", "hidden", "contents"],
});

/** The rows for a display value, in LIST_ORDER. */
export function displayRows(display: string): PropertyEditor[] {
  return revealedRows({ property: "display", rows: ROW_EDITORS }, display);
}
