import { shortName } from "../../../dom/target.ts";
import { px } from "../../px.ts";

interface HighlightProps {
  element: Element;
  rect: DOMRect;
  variant: "hover" | "selected";
  /** Show the name and size label. Default true; off for the selection while another element is hovered, so the two labels don't overlap. */
  label?: boolean;
}

/** Corner markers drawn on the selected element. */
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/**
 * Outline + label drawn over an element; the selected one also gets a round
 * handle on each corner. Purely visual: never receives events.
 */
export function Highlight({ element, rect, variant, label = true }: HighlightProps) {
  const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  // Put the label above the box, or inside it when the element touches the top edge.
  const labelInside = rect.top < 22;
  return (
    <div
      class="highlight"
      data-variant={variant}
      style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }}
      aria-hidden="true"
    >
      {label && (
        <span class="label" data-inside={labelInside || undefined}>
          {shortName(element)} <span class="size">{size}</span>
        </span>
      )}
      {variant === "selected" &&
        CORNERS.map((corner) => <span key={corner} class="handle" data-corner={corner} />)}
    </div>
  );
}
