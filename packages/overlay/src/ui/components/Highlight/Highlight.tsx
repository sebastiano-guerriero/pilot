import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { elementName } from "../../../dom/name.ts";
import { px } from "../../px.ts";

interface HighlightProps {
  element: Element;
  rect: DOMRect;
  variant: "hover" | "selected" | "busy" | "flash";
  /**
   * Show the name and size label. The hover highlight has one; the selection
   * doesn't (App passes false): its corner is kept for the selection's actions.
   */
  label?: boolean;
  /** The project's own naming attributes, tried first (see elementName). */
  nameAttributes?: readonly string[];
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
/** The label's inline padding (both sides), and the space before the size, in px (Highlight.css). */
const LABEL_PADDING = 8;
const SIZE_GAP = 4;

/** Corner markers drawn on the selected element. */
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/**
 * Outline + label drawn over an element; the selected one also gets a round
 * handle on each corner; `busy` is an element a job is on that isn't
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
  labelRoom,
  labelShift = 0,
  working = false,
}: HighlightProps) {
  const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  const room = labelRoom === undefined ? null : Math.floor(labelRoom);
  const below = room !== null && room < MIN_LABEL;
  // Put the label above the box, or inside it when the element touches the
  // top edge, or below it when the corner icons leave no room.
  const labelInside = !below && rect.top < 24; // the label (20px) and its 4px margin
  // Without the size when the whole label doesn't fit (measured: the
  // spans' scrollWidth is their full text, cut or not).
  const nameRef = useRef<HTMLSpanElement>(null);
  const sizeRef = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const name = nameRef.current?.scrollWidth ?? 0;
    const sizeWidth = sizeRef.current?.scrollWidth ?? 0;
    const want = room !== null && !below && LABEL_PADDING + name + SIZE_GAP + sizeWidth > room;
    if (want !== compact) setCompact(want);
  });
  return (
    <div
      class="highlight"
      data-variant={variant}
      data-working={working || undefined}
      style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }}
      aria-hidden="true"
    >
      {label && (
        <span
          class="label"
          data-inside={labelInside || undefined}
          data-below={below || undefined}
          data-compact={compact || undefined}
          style={{
            ...(room !== null && !below ? { maxWidth: px(room) } : {}),
            ...(labelShift && !below ? { translate: `0 ${px(labelShift)}` } : {}),
          }}
        >
          <span class="name" ref={nameRef}>
            {elementName(element, nameAttributes)}
          </span>
          <span class="size" ref={sizeRef}>
            {size}
          </span>
        </span>
      )}
      {variant === "selected" && CORNERS.map((corner) => <span key={corner} class="handle" data-corner={corner} />)}
    </div>
  );
}
