import type { GapRect } from "./gridLines.ts";

/**
 * A flex container's gaps, to stripe like a grid's (BoxAreas): the space the
 * `gap` puts between items on a line, and between lines when they wrap.
 * Flex has no tracks to read, so the gaps come from where the items are.
 */

type Rect = { left: number; top: number; width: number; height: number };

export interface FlexModel {
  /** The main axis: `row` (row, row-reverse) or `column` (column, column-reverse). */
  direction: "row" | "column";
  /** row-gap and column-gap, in px (0 for `normal`). */
  rowGap: number;
  columnGap: number;
  /** The content box, in viewport px. */
  content: Rect;
  /** The items' border boxes, in viewport px (in-flow children only). */
  items: Rect[];
}

/** A gap to stripe, and which property makes it. */
export type FlexGapRect = GapRect & { axis: "row" | "column" };

const FLEX_DISPLAYS = ["flex", "inline-flex"];

export function measureFlex(element: Element): FlexModel | null {
  if (!element.isConnected) return null;
  const cs = getComputedStyle(element);
  if (!FLEX_DISPLAYS.includes(cs.display)) return null;
  const px = (p: string) => Number.parseFloat(cs.getPropertyValue(p)) || 0;
  const r = element.getBoundingClientRect();
  const content = {
    left: r.left + px("border-left-width") + px("padding-left"),
    top: r.top + px("border-top-width") + px("padding-top"),
    width: Math.max(0, r.width - px("border-left-width") - px("border-right-width") - px("padding-left") - px("padding-right")),
    height: Math.max(0, r.height - px("border-top-width") - px("border-bottom-width") - px("padding-top") - px("padding-bottom")),
  };
  // In-flow items: not absolutely positioned, not display: none.
  const items = Array.from(element.children)
    .filter((child) => {
      const s = getComputedStyle(child);
      return s.display !== "none" && s.position !== "absolute" && s.position !== "fixed";
    })
    .map((child) => {
      const b = child.getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    });
  return {
    direction: cs.flexDirection.startsWith("column") ? "column" : "row",
    rowGap: px("row-gap"),
    columnGap: px("column-gap"),
    content,
    items,
  };
}

/**
 * The gaps to stripe, as viewport rects.
 * - Along a line: between each pair of neighboring items, the main-axis gap
 *   (column-gap in a row, row-gap in a column), as tall (or wide) as the line.
 * - Between lines (wrapping): the cross-axis gap, across the content box.
 * Each is the gap's own size, centered in the space between the items (more
 * than the gap when justify-content or align-content spread them). `axes`
 * picks which gaps: row-gap's, column-gap's, or both.
 */
export function flexGapRects(
  model: FlexModel,
  axes: { rows: boolean; columns: boolean } = { rows: true, columns: true },
): FlexGapRect[] {
  const row = model.direction === "row";
  // Main and cross positions of a rect: for a row, main is x and cross is y.
  const main = (r: Rect) => (row ? { start: r.left, end: r.left + r.width } : { start: r.top, end: r.top + r.height });
  const cross = (r: Rect) => (row ? { start: r.top, end: r.top + r.height } : { start: r.left, end: r.left + r.width });
  const mainGap = row ? model.columnGap : model.rowGap;
  const crossGap = row ? model.rowGap : model.columnGap;
  const mainAxis: "row" | "column" = row ? "column" : "row";
  const crossAxis: "row" | "column" = row ? "row" : "column";
  const wants = (axis: "row" | "column") => (axis === "row" ? axes.rows : axes.columns);
  // A rect from main and cross ranges.
  const rect = (m: { start: number; end: number }, c: { start: number; end: number }, axis: "row" | "column") =>
    row
      ? { left: m.start, top: c.start, width: m.end - m.start, height: c.end - c.start, axis }
      : { left: c.start, top: m.start, width: c.end - c.start, height: m.end - m.start, axis };
  // The gap's size, centered in the space between `from` and `to` (none when there's no room).
  const centered = (from: number, to: number, size: number) => {
    const room = to - from;
    if (size <= 0 || room <= 0) return null;
    const s = Math.min(size, room);
    return { start: from + (room - s) / 2, end: from + (room + s) / 2 };
  };

  // Lines: items that overlap on the cross axis, in cross order, each sorted along the main axis.
  const lines: Array<{ items: Rect[]; cross: { start: number; end: number } }> = [];
  for (const item of [...model.items].sort((a, b) => cross(a).start - cross(b).start)) {
    const c = cross(item);
    const line = lines.at(-1);
    if (line && c.start < line.cross.end - 0.5) {
      line.items.push(item);
      line.cross = { start: Math.min(line.cross.start, c.start), end: Math.max(line.cross.end, c.end) };
    } else lines.push({ items: [item], cross: c });
  }

  const out: FlexGapRect[] = [];
  if (wants(mainAxis)) {
    for (const line of lines) {
      const sorted = [...line.items].sort((a, b) => main(a).start - main(b).start);
      for (let i = 1; i < sorted.length; i++) {
        const gap = centered(main(sorted[i - 1] as Rect).end, main(sorted[i] as Rect).start, mainGap);
        if (gap) out.push(rect(gap, line.cross, mainAxis));
      }
    }
  }
  if (wants(crossAxis)) {
    const across = main(model.content);
    for (let i = 1; i < lines.length; i++) {
      const gap = centered((lines[i - 1] as (typeof lines)[number]).cross.end, (lines[i] as (typeof lines)[number]).cross.start, crossGap);
      if (gap) out.push(rect(across, gap, crossAxis));
    }
  }
  return out;
}
