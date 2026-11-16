import { DISPLAY_VALUES } from "../../css/properties.ts";
import { alignItemsEditor } from "../align/AlignItemsEditor.tsx";
import { flexDirectionEditor, flexWrapEditor } from "../flex/FlexEditors.tsx";
import { gapEditor } from "../gap/GapEditor.tsx";
import { gridColumnsEditor } from "../grid-columns/GridColumnsEditor.tsx";
import { justifyContentEditor } from "../justify/JustifyContentEditor.tsx";
import { revealEditor, revealedRows } from "../reveal/RevealEditor.tsx";
import type { PropertyEditor } from "../types.ts";

/**
 * The editors display can show as rows below the select. Which ones, and in
 * what order, for each display value is set in LIST_ORDER
 * (editors/listOrder.ts: grid → grid-columns, gap…; flex → flex-direction,
 * flex-wrap, gap…). Each row is an editor of its own: searching for it (`gap`,
 * `cols`, `flex-col`, `items`…) shows just that editor, without display.
 */
const ROW_EDITORS: PropertyEditor[] = [
  gridColumnsEditor,
  flexDirectionEditor,
  flexWrapEditor,
  gapEditor,
  justifyContentEditor,
  alignItemsEditor,
];

/**
 * Display, as a select. Picking `grid` (or `inline-grid`) shows the grid rows
 * below it, `flex` (or `inline-flex`) the flex rows (see RevealEditor).
 */
export const displayEditor = revealEditor({
  property: "display",
  label: "Display",
  options: DISPLAY_VALUES,
  rows: ROW_EDITORS,
  // Tailwind's display utilities: they all land here.
  aliases: ["grid", "inline-grid", "flex", "inline-flex", "block", "inline-block", "inline", "hidden", "contents"],
});

/** The rows for a display value, in LIST_ORDER. */
export function displayRows(display: string): PropertyEditor[] {
  return revealedRows({ property: "display", rows: ROW_EDITORS }, display);
}
