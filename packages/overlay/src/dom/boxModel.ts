/** A side of the box model. */
export type BoxSide = "top" | "right" | "bottom" | "left";

/** One side of a box-model area, e.g. the top padding. */
export interface SideArea {
  box: "padding" | "border" | "margin";
  side: BoxSide;
}

/** A grid container's gaps: the space between its tracks (see dom/gridLines.ts). */
export interface GapArea {
  box: "gap";
}

/** An area of the selected element to visualize: a box-model side, or the grid's gaps. */
export type BoxArea = SideArea | GapArea;

/**
 * Whether showing an area hides the selection's outline, corner dots and
 * label (and a grid's lines and numbers) while the designer interacts with its
 * editor. It depends on the
 * property: the outline sits right on top of padding, border and margin, so
 * it would hide the change happening live; the gap is inside the element,
 * where the outline is no trouble. Decide here for every new kind of area.
 */
const HIDES_SELECTION: Record<BoxArea["box"], boolean> = {
  padding: true,
  border: true,
  margin: true,
  gap: false,
};

export function hidesSelection(area: BoxArea): boolean {
  return HIDES_SELECTION[area.box];
}

export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The element's border-box rect plus its margin, border and padding widths, in px. */
export interface BoxModel {
  rect: { left: number; top: number; width: number; height: number };
  margin: Edges;
  border: Edges;
  padding: Edges;
}

export interface AreaRect {
  side: BoxSide;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function measureBoxModel(element: Element): BoxModel | null {
  if (!element.isConnected) return null;
  const r = element.getBoundingClientRect();
  const cs = getComputedStyle(element);
  const px = (p: string) => Number.parseFloat(cs.getPropertyValue(p)) || 0;
  return {
    rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    margin: {
      top: px("margin-top"),
      right: px("margin-right"),
      bottom: px("margin-bottom"),
      left: px("margin-left"),
    },
    border: {
      top: px("border-top-width"),
      right: px("border-right-width"),
      bottom: px("border-bottom-width"),
      left: px("border-left-width"),
    },
    padding: {
      top: px("padding-top"),
      right: px("padding-right"),
      bottom: px("padding-bottom"),
      left: px("padding-left"),
    },
  };
}

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Viewport rects of the sides to show for one box-model area:
 * - padding: the band inside the border,
 * - border: the border itself,
 * - margin: the band outside the border (negative margins show nothing).
 * Top and bottom span the full width of the area; left and right stop where a
 * shown top/bottom band starts, so corners are never covered twice (and a lone
 * left/right side covers the whole height). Empty (0px) sides are left out.
 */
export function areaRects(model: BoxModel, box: SideArea["box"], sides: BoxSide[]): AreaRect[] {
  const { rect, border, padding } = model;
  const margin = clampEdges(model.margin);
  const outer: Rect =
    box === "margin"
      ? {
          left: rect.left - margin.left,
          top: rect.top - margin.top,
          width: rect.width + margin.left + margin.right,
          height: rect.height + margin.top + margin.bottom,
        }
      : box === "border"
        ? rect
        : {
            left: rect.left + border.left,
            top: rect.top + border.top,
            width: Math.max(0, rect.width - border.left - border.right),
            height: Math.max(0, rect.height - border.top - border.bottom),
          };
  const thickness = box === "margin" ? margin : box === "border" ? border : padding;
  return bands(outer, thickness, sides);
}

/** The padding sides to show (kept for existing callers): see areaRects. */
export function paddingRects(model: BoxModel, sides: BoxSide[]): AreaRect[] {
  return areaRects(model, "padding", sides);
}

function bands(outer: Rect, t: Edges, sides: BoxSide[]): AreaRect[] {
  const has = (s: BoxSide) => sides.includes(s);
  const out: AreaRect[] = [];
  if (has("top")) out.push({ side: "top", left: outer.left, top: outer.top, width: outer.width, height: t.top });
  if (has("bottom"))
    out.push({ side: "bottom", left: outer.left, top: outer.top + outer.height - t.bottom, width: outer.width, height: t.bottom });
  const skipTop = has("top") ? t.top : 0;
  const skipBottom = has("bottom") ? t.bottom : 0;
  const sideHeight = Math.max(0, outer.height - skipTop - skipBottom);
  if (has("left")) out.push({ side: "left", left: outer.left, top: outer.top + skipTop, width: t.left, height: sideHeight });
  if (has("right"))
    out.push({ side: "right", left: outer.left + outer.width - t.right, top: outer.top + skipTop, width: t.right, height: sideHeight });
  return out.filter((a) => a.width > 0 && a.height > 0);
}

function clampEdges(e: Edges): Edges {
  return { top: Math.max(0, e.top), right: Math.max(0, e.right), bottom: Math.max(0, e.bottom), left: Math.max(0, e.left) };
}
