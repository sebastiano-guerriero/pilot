import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

interface SelectionActionsProps {
  /** The selected element's box (viewport px). */
  rect: DOMRect;
  /** The DOM tree is open (the action shows it pressed). */
  domOpen: boolean;
  onShowInDom(): void;
}

/** The actions' size and their gap to the selection, in px. */
const SIZE = 20;
const GAP = 4;

/**
 * Actions on the selection, above its top-right corner, right-aligned with
 * it: today Show in DOM (a 20px `</>` button), which opens the DOM tree on
 * the selected element. Inside the corner when the element touches the top
 * of the window (the tooltip then goes below, so it stays on screen).
 */
export function SelectionActions({ rect, domOpen, onShowInDom }: SelectionActionsProps) {
  const inside = rect.top < SIZE + GAP;
  const right = Math.round(inside ? rect.right - GAP : rect.right);
  return (
    <div
      class="selection-actions"
      style={{ left: px(right - SIZE), top: px(Math.round(inside ? rect.top + GAP : rect.top - SIZE - GAP)) }}
    >
      <Tooltip text="Show in DOM" side={inside ? "bottom" : "top"}>
        <button
          type="button"
          class="action"
          aria-label="Show in DOM (Alt+D)"
          aria-pressed={domOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onShowInDom}
        >
          <Icon name="code" />
        </button>
      </Tooltip>
    </div>
  );
}
