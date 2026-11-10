import { shortName } from "../dom/target.ts";
import { px } from "./px.ts";

interface HighlightProps {
  element: Element;
  rect: DOMRect;
  variant: "hover" | "selected";
}

/** Outline + label drawn over an element. Purely visual: never receives events. */
export function Highlight({ element, rect, variant }: HighlightProps) {
  const size = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  // Put the label above the box, or inside it when the element touches the top edge.
  const labelInside = rect.top < 22;
  return (
    <div
      class={`highlight highlight--${variant}`}
      style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }}
      aria-hidden="true"
    >
      <span class={`highlight-label${labelInside ? " highlight-label--inside" : ""}`}>
        {shortName(element)} <span class="highlight-size">{size}</span>
      </span>
    </div>
  );
}
