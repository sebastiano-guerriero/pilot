/**
 * The distances between the selection and another box, as Figma shows them
 * with Option held: for each axis, either the gap between them (when one is
 * beside the other) or the distances between their matching edges (when
 * they overlap on that axis, one inside the other included).
 *
 * - **Beside** (no overlap on the axis): one line across the gap, at the
 *   middle of where they overlap on the other axis; when they don't overlap
 *   there either, at the selection's middle, with a dashed guide from the
 *   line's end to the other box's edge.
 * - **Overlapping** on the axis: a line between each pair of matching edges
 *   that differ (left to left, right to right), at the middle of the inner
 *   box on the other axis (the selection's, when neither is inside the other).
 *
 * When one element is inside the other, the container's box is taken
 * inside its border (`measuredBoxes`): a card's 20px padding reads 20, not
 * 21 with its 1px border.
 *
 * In viewport px. `measure` is pure geometry: drawn by Measurements.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A measured distance: its line, and the value shown on it. */
export interface Distance {
  axis: "x" | "y";
  /** The line's ends (one coordinate shared: `y` for an x line, `x` for a y line). */
  from: number;
  to: number;
  at: number;
  /** In px, as shown (rounded to a tenth). */
  value: number;
}

/** A dashed guide: the other box's edge extended to where a line ends. */
export interface Guide {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
}

export interface Measurement {
  distances: Distance[];
  guides: Guide[];
}

/** `rect` inside its element's border: where its padding and content are. */
export function insideBorder(rect: Box, border: { top: number; right: number; bottom: number; left: number }): Box {
  return {
    left: rect.left + border.left,
    top: rect.top + border.top,
    right: rect.right - border.right,
    bottom: rect.bottom - border.bottom,
  };
}

/**
 * The two boxes to measure between, for elements `a` (the selection) and
 * `b`: their borders' outer edges, but a container's inside its border when
 * the other element is inside it.
 */
export function measuredBoxes(a: Element, aRect: Box, b: Element, bRect: Box): { from: Box; to: Box } {
  const inner = (el: Element, rect: Box) => {
    const s = getComputedStyle(el);
    const w = (v: string) => Number.parseFloat(v) || 0;
    return insideBorder(rect, {
      top: w(s.borderTopWidth),
      right: w(s.borderRightWidth),
      bottom: w(s.borderBottomWidth),
      left: w(s.borderLeftWidth),
    });
  };
  return { from: a !== b && a.contains(b) ? inner(a, aRect) : aRect, to: a !== b && b.contains(a) ? inner(b, bRect) : bRect };
}

/** Below this, two edges count as the same (sub-pixel layout). */
const SAME = 0.5;

const round = (n: number) => Math.round(n * 10) / 10;

/** The distances from `a` (the selection) to `b` (the hovered box, or the selection's parent). */
export function measure(a: Box, b: Box): Measurement {
  const distances: Distance[] = [];
  const guides: Guide[] = [];
  const axes = [
    { axis: "x" as const, a: [a.left, a.right], b: [b.left, b.right], across: { a: [a.top, a.bottom], b: [b.top, b.bottom] } },
    { axis: "y" as const, a: [a.top, a.bottom], b: [b.top, b.bottom], across: { a: [a.left, a.right], b: [b.left, b.right] } },
  ];
  for (const {
    axis,
    a: [aStart, aEnd],
    b: [bStart, bEnd],
    across,
  } of axes as Array<{
    axis: "x" | "y";
    a: [number, number];
    b: [number, number];
    across: { a: [number, number]; b: [number, number] };
  }>) {
    const [aFrom, aTo] = across.a;
    const [bFrom, bTo] = across.b;
    const overlapFrom = Math.max(aFrom, bFrom);
    const overlapTo = Math.min(aTo, bTo);
    const overlaps = overlapTo - overlapFrom > SAME;
    const aMiddle = (aFrom + aTo) / 2;
    if (bStart >= aEnd - SAME || aStart >= bEnd - SAME) {
      // Beside: the gap between them.
      const after = bStart >= aEnd - SAME;
      const [from, to] = after ? [aEnd, bStart] : [bEnd, aStart];
      if (to - from <= SAME) continue;
      const at = overlaps ? (overlapFrom + overlapTo) / 2 : aMiddle;
      distances.push({ axis, from, to, at, value: round(to - from) });
      if (!overlaps) {
        // The other box's edge where the line ends, extended across to the line.
        const near = at < bFrom ? bFrom : bTo;
        guides.push({ axis: axis === "x" ? "y" : "x", at: after ? to : from, from: Math.min(at, near), to: Math.max(at, near) });
      }
      continue;
    }
    // Overlapping on this axis: matching edges, at the middle of the inner box across (the selection's otherwise).
    const bInside = bFrom >= aFrom - SAME && bTo <= aTo + SAME;
    const at = bInside ? (bFrom + bTo) / 2 : aMiddle;
    for (const [x, y] of [
      [aStart, bStart],
      [aEnd, bEnd],
    ] as const) {
      if (Math.abs(x - y) > SAME) distances.push({ axis, from: Math.min(x, y), to: Math.max(x, y), at, value: round(Math.abs(x - y)) });
    }
  }
  return { distances, guides };
}
