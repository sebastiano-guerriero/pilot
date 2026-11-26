import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { elementName } from "../../../dom/name.ts";
import type { PlacedRect } from "../../../select/useElementRect.ts";
import { px } from "../../px.ts";
import { PageAnchor } from "../PageAnchor/PageAnchor.tsx";

interface HighlightProps {
  element: Element;
  /** The element's box (viewport px), drawn in the page when it has `at` (PageAnchor). */
  rect: PlacedRect;
  variant: "hover" | "selected" | "dots" | "busy" | "flash";
  /**
   * Show the name and size label. The hover highlight has one; the selection
   * doesn't (App passes false): its corner is kept for the selection's actions.
   */
  label?: boolean;
  /** The project's own naming attributes, tried first (see elementName). */
  nameAttributes?: readonly string[];
  /** The label's name instead of the element's (a pseudo-element's: `::before`). */
  name?: string;
  /**
   * How wide the label may be, in px, when something sits further along its
   * row: icons on the element's top-right corner (a job's loader, a
   * comment), the selected element's actions. The label stops there:
   * without the size if it doesn't fit, then with the name cut ("…"), and
   * below the element when not even a short name would fit. None: no limit.
   */
  labelRoom?: number;
  /** Px to move the label down (or up), to line it up with what shares its row (the selection's actions). */
  labelShift?: number;
  /** A job is on the element (its loader shows): the box's fill breathes, slowly (Highlight.css). */
  working?: boolean;
}

/** The narrowest the label gets beside corner icons before it goes below the element, in px. */
const MIN_LABEL = 40;
/** How close to the window's edges the label may go, in px. */
const EDGE = 8;
/** The label's inline padding (both sides), and the space before the size, in px (Highlight.css). */
const LABEL_PADDING = 8;
const SIZE_GAP = 4;

/** Corner markers drawn on the selected element. */
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
/**
 * Under this width or height, in px, the selection has no corner dots: the
 * dot's own size, where two of them touch (smaller, they'd overlap into a
 * blob you can't tell apart), and the 2px line alone says what's selected.
 */
export const MIN_DOTS_SIZE = 8;

/**
 * Outline + label drawn over an element; `selected`, the selection's
 * outline, and `dots`, its round handle on each corner, a layer of their own
 * that App draws over every other highlight (a hovered parent's lines
 * included); `busy` is an element a job is on that isn't
 * selected (the outline alone; its loader is SelectionActions'); `flash`,
 * the toolbar's jobs button landing on a job's element. The label (name and size) sits above the top-left
 * corner. Purely visual: never receives events.
 */
export function Highlight({
  element,
  rect,
  variant,
  label = true,
  nameAttributes,
  name,
  labelRoom,
  labelShift = 0,
  working = false,
}: HighlightProps) {
  const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  // Not rounded: the actions sit on fractional pixels, and the gap to them is 4px exactly, as between them.
  const room = labelRoom === undefined ? null : labelRoom;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const below = room !== null && room < MIN_LABEL;
  // Put the label above the box, or inside it when the element touches the
  // top edge, or below it when the corner icons leave no room; inside at the
  // bottom when below would leave the window too.
  const labelInside = !below && rect.top < 24; // the label (20px) and its 4px margin
  const insideBottom = below && rect.bottom + 25 > vh;
  // Left-aligned, it would cross the window's right edge (an element near it):
  // aligned with the element's right edge instead, when that fits. Not beside
  // corner icons (`room`): those keep the right corner, and the label goes below.
  const labelRef = useRef<HTMLSpanElement>(null);
  const [flipped, setFlipped] = useState(false);
  // Without the size when the whole label doesn't fit (measured: the
  // spans' scrollWidth is their full text, cut or not).
  const nameRef = useRef<HTMLSpanElement>(null);
  const sizeRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const width = labelRef.current?.offsetWidth ?? 0;
    const flip = room === null && width > 0 && rect.left - 1 + width > vw - EDGE && rect.right + 1 - width >= EDGE;
    if (flip !== flipped) setFlipped(flip);
  });
  useLayoutEffect(() => {
    const name = nameRef.current?.scrollWidth ?? 0;
    const sizeWidth = sizeRef.current?.scrollWidth ?? 0;
    const want = room !== null && !below && LABEL_PADDING + name + SIZE_GAP + sizeWidth > room;
    if (want !== compact) setCompact(want);
  });
  return (
    <PageAnchor at={rect.at}>
      <div
        class="highlight"
        data-variant={variant}
        data-working={working || undefined}
        style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }}
        aria-hidden="true"
      >
        {label && (
          <span
            ref={labelRef}
            class="label"
            data-inside={labelInside || undefined}
            data-below={(below && !insideBottom) || undefined}
            data-inside-bottom={insideBottom || undefined}
            data-flipped={flipped || undefined}
            data-compact={compact || undefined}
            style={{
              ...(room !== null && !below ? { maxWidth: px(room) } : {}),
              ...(labelShift && !below ? { translate: `0 ${px(labelShift)}` } : {}),
            }}
          >
            <span class="name" ref={nameRef}>
              {name ?? elementName(element, nameAttributes)}
            </span>
            <span class="size" ref={sizeRef}>
              {size}
            </span>
          </span>
        )}
        {variant === "dots" && rect.width >= MIN_DOTS_SIZE && rect.height >= MIN_DOTS_SIZE && CORNERS.map((corner) => <span key={corner} class="handle" data-corner={corner} />)}
      </div>
    </PageAnchor>
  );
}
