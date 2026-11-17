import { elementName } from "../../../dom/name.ts";
import { px } from "../../px.ts";

interface HighlightProps {
  element: Element;
  rect: DOMRect;
  variant: "hover" | "selected" | "busy";
  /**
   * Show the name and size label. The hover highlight has one; the selection
   * doesn't (App passes false): its corner is kept for the selection's actions.
   */
  label?: boolean;
  /** The project's own naming attributes, tried first (see elementName). */
  nameAttributes?: readonly string[];
}

/** Corner markers drawn on the selected element. */
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/**
 * Outline + label drawn over an element; the selected one also gets a round
 * handle on each corner; `busy` is an element a job is on that isn't
 * selected (the outline alone; its loader is SelectionActions'). The label (name and size) sits above the top-left
 * corner. Purely visual: never receives events.
 */
export function Highlight({ element, rect, variant, label = true, nameAttributes }: HighlightProps) {
  const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  // Put the label above the box, or inside it when the element touches the top edge.
  const labelInside = rect.top < 24; // the label (20px) and its 4px margin
  return (
    <div
      class="highlight"
      data-variant={variant}
      style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }}
      aria-hidden="true"
    >
      {label && (
        <span class="label" data-inside={labelInside || undefined}>
          {elementName(element, nameAttributes)} <span class="size">{size}</span>
        </span>
      )}
      {variant === "selected" &&
        CORNERS.map((corner) => <span key={corner} class="handle" data-corner={corner} />)}
    </div>
  );
}
