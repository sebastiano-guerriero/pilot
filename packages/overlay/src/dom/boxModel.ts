/** A side of the box model. */
export type BoxSide = "top" | "right" | "bottom" | "left";

/** An area of the selected element to visualize, e.g. its top padding. */
export interface BoxArea {
  box: "padding";
  side: BoxSide;
}

export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The element's border-box rect plus its border and padding widths, in px. */
export interface BoxModel {
  rect: { left: number; top: number; width: number; height: number };
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

/**
 * Viewport rects of the padding sides to show. Top and bottom span the full
 * width inside the border; left and right stop where a shown top/bottom area
 * starts, so corners are never covered twice (and a lone left/right side
 * covers the whole height). Empty (0px) sides are left out.
 */
export function paddingRects(model: BoxModel, sides: BoxSide[]): AreaRect[] {
  const { rect, border, padding } = model;
  const inner = {
    left: rect.left + border.left,
    top: rect.top + border.top,
    width: Math.max(0, rect.width - border.left - border.right),
    height: Math.max(0, rect.height - border.top - border.bottom),
  };
  const has = (s: BoxSide) => sides.includes(s);
  const out: AreaRect[] = [];
  if (has("top")) out.push({ side: "top", left: inner.left, top: inner.top, width: inner.width, height: padding.top });
  if (has("bottom"))
    out.push({
      side: "bottom",
      left: inner.left,
      top: inner.top + inner.height - padding.bottom,
      width: inner.width,
      height: padding.bottom,
    });
  const skipTop = has("top") ? padding.top : 0;
  const skipBottom = has("bottom") ? padding.bottom : 0;
  const sideHeight = Math.max(0, inner.height - skipTop - skipBottom);
  if (has("left"))
    out.push({ side: "left", left: inner.left, top: inner.top + skipTop, width: padding.left, height: sideHeight });
  if (has("right"))
    out.push({
      side: "right",
      left: inner.left + inner.width - padding.right,
      top: inner.top + skipTop,
      width: padding.right,
      height: sideHeight,
    });
  return out.filter((a) => a.width > 0 && a.height > 0);
}
