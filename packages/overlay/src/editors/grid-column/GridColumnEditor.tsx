import { lengthEditor } from "../length/LengthEditor.tsx";

/**
 * Where a grid item sits on the columns, Tailwind-style: col-span, col-start
 * and col-end. Plain fields, no drag handle. Their values (css/values.ts):
 * - col-span writes the `grid-column` shorthand: `3` → `span 3 / span 3`,
 *   `full` → `1 / -1` (first line to last); shown back as `3` and `full`.
 * - col-start / col-end take a line (`2`, `-1`, never 0), `span 2`, or `auto`.
 * They share the item's grid-column, so the latest one wins where they
 * overlap: col-span after col-start replaces the start.
 */
export const colSpanEditor = lengthEditor({
  property: "grid-column",
  name: "col-span",
  label: "Column span",
  aliases: ["col-span", "col-span-full", "span"],
  keywords: ["grid", "full", "columns"],
});

export const colStartEditor = lengthEditor({
  property: "grid-column-start",
  name: "col-start",
  label: "Column start",
  aliases: ["col-start"],
  keywords: ["grid", "line"],
});

export const colEndEditor = lengthEditor({
  property: "grid-column-end",
  name: "col-end",
  label: "Column end",
  aliases: ["col-end"],
  keywords: ["grid", "line"],
});
