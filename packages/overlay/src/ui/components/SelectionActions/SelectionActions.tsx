import { px } from "../../px.ts";

interface SelectionActionsProps {
  /** The selected element's box (viewport px). */
  rect: DOMRect;
  /** The DOM tree is open (the action shows it pressed). */
  domOpen: boolean;
  onShowInDom(): void;
}

/** The actions' row height and its gap to the selection, in px. */
const HEIGHT = 20;
const GAP = 4;

/**
 * Actions on the selection, at its top-left corner (the corner the selection
 * keeps free of a label): today Show in DOM, which opens the DOM tree on the
 * selected element. Above the element, or inside its corner when it touches
 * the top of the window. Placeholder look, pending the design.
 */
export function SelectionActions({ rect, domOpen, onShowInDom }: SelectionActionsProps) {
  const inside = rect.top < HEIGHT + GAP;
  return (
    <div
      class="selection-actions"
      style={{ left: px(Math.round(rect.left)), top: px(Math.round(inside ? rect.top + GAP : rect.top - HEIGHT - GAP)) }}
    >
      <button
        type="button"
        class="action"
        aria-pressed={domOpen}
        title="The page's elements as a tree, to select any of them (Alt+D)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onShowInDom}
      >
        Show in DOM
      </button>
    </div>
  );
}
