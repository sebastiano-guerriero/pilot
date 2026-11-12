/**
 * The lines of a CSS grid container, for drawing them over the page (like the
 * browser's grid inspector). Measured from the computed style: for a grid
 * container, `grid-template-columns`/`-rows` resolve to the actual track
 * sizes in px, implicit tracks included.
 */

/** A grid line: its number (1 = the start edge) and where it is, in viewport px. */
export interface GridLine {
  number: number;
  /**
   * Where the line starts and ends across the axis. The same for the outer
   * lines; between tracks with a gap, the two edges of the gap.
   */
  start: number;
  end: number;
}

export interface GridModel {
  /** The border box, in viewport px: where the selection outline is drawn. */
  box: { left: number; top: number; width: number; height: number };
  /** The content box, in viewport px: where the tracks are laid out. */
  content: { left: number; top: number; width: number; height: number };
  /** Vertical lines, numbered left to right. */
  columns: GridLine[];
  /** Horizontal lines, numbered top to bottom. */
  rows: GridLine[];
}

const GRID_DISPLAYS = ["grid", "inline-grid"];

/** The element's grid lines, or null when it isn't a grid container (or can't be read). */
export function measureGrid(element: Element): GridModel | null {
  if (!element.isConnected) return null;
  const cs = getComputedStyle(element);
  if (!GRID_DISPLAYS.includes(cs.display)) return null;
  const px = (p: string) => Number.parseFloat(cs.getPropertyValue(p)) || 0;
  const r = element.getBoundingClientRect();
  const content = {
    left: r.left + px("border-left-width") + px("padding-left"),
    top: r.top + px("border-top-width") + px("padding-top"),
    width: Math.max(
      0,
      r.width - px("border-left-width") - px("border-right-width") - px("padding-left") - px("padding-right"),
    ),
    height: Math.max(
      0,
      r.height - px("border-top-width") - px("border-bottom-width") - px("padding-top") - px("padding-bottom"),
    ),
  };
  const columns = parseTracks(cs.gridTemplateColumns);
  const rows = parseTracks(cs.gridTemplateRows);
  if (!columns || !rows) return null;
  return {
    box: { left: r.left, top: r.top, width: r.width, height: r.height },
    content,
    columns: gridLines({
      start: content.left,
      size: content.width,
      tracks: columns,
      gap: px("column-gap"),
      align: cs.justifyContent,
    }),
    rows: gridLines({
      start: content.top,
      size: content.height,
      tracks: rows,
      gap: px("row-gap"),
      align: cs.alignContent,
    }),
  };
}

/**
 * Resolved track sizes ("100px 200.5px", possibly with line names in
 * brackets) → [100, 200.5]. Null if any track isn't a px size, e.g. `none`
 * (no explicit tracks), which the caller treats as "nothing to draw".
 */
export function parseTracks(value: string): number[] | null {
  const tokens = value
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;
  const sizes = tokens.map((t) => (/^-?\d*\.?\d+px$/.test(t) ? Number.parseFloat(t) : Number.NaN));
  return sizes.every(Number.isFinite) ? sizes : null;
}

/**
 * The lines along one axis: line 1 at the start of the first track, then one
 * line between each pair of tracks (spanning the gap, if any), and one after
 * the last track. `align` is justify-content / align-content: `center` and
 * `end` shift the tracks when they don't fill the container; other values
 * (normal, start, stretch…) start them at the edge. The space-* values are
 * drawn from the start too.
 */
export function gridLines({
  start,
  size,
  tracks,
  gap,
  align,
}: {
  start: number;
  size: number;
  tracks: number[];
  gap: number;
  align: string;
}): GridLine[] {
  const used = tracks.reduce((sum, t) => sum + t, 0) + gap * Math.max(0, tracks.length - 1);
  const free = Math.max(0, size - used);
  const a = align.trim().split(/\s+/).at(-1) ?? "";
  const offset = a === "center" ? free / 2 : ["end", "flex-end", "right"].includes(a) ? free : 0;

  const lines: GridLine[] = [];
  let at = start + offset;
  lines.push({ number: 1, start: at, end: at });
  tracks.forEach((track, i) => {
    at += track;
    const last = i === tracks.length - 1;
    const end = last ? at : at + gap;
    lines.push({ number: i + 2, start: at, end });
    at = end;
  });
  return lines;
}

export interface GapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The gaps between tracks, as viewport rects to stripe: each column gap spans
 * the rows, each row gap spans the columns. Row gaps are cut where a column
 * gap crosses them, so the crossings aren't covered (and striped) twice.
 */
export function gapRects(grid: GridModel): GapRect[] {
  const span = (lines: GridLine[]) => ({ from: lines[0]?.start ?? 0, to: lines.at(-1)?.end ?? 0 });
  const across = span(grid.columns);
  const down = span(grid.rows);
  const columnGaps = grid.columns.filter((l) => l.end > l.start);
  const rowGaps = grid.rows.filter((l) => l.end > l.start);

  const rects: GapRect[] = columnGaps.map((c) => ({
    left: c.start,
    top: down.from,
    width: c.end - c.start,
    height: down.to - down.from,
  }));
  for (const r of rowGaps) {
    const piece = (from: number, to: number) => {
      if (to > from) rects.push({ left: from, top: r.start, width: to - from, height: r.end - r.start });
    };
    let x = across.from;
    for (const c of columnGaps) {
      piece(x, c.start);
      x = Math.max(x, c.end);
    }
    piece(x, across.to);
  }
  return rects;
}

/**
 * Where to draw a line: its start and end (one position when there's no gap),
 * minus any that sit on the element's outline (within 1px of `from` or `to`,
 * the border box's edges along the axis). With no padding or border, the
 * outer lines would only double the selection outline.
 */
export function drawnPositions(line: GridLine, from: number, to: number): number[] {
  const onOutline = (at: number) => Math.abs(at - from) <= 1 || Math.abs(at - to) <= 1;
  return [...new Set([line.start, line.end])].filter((at) => !onOutline(at));
}
