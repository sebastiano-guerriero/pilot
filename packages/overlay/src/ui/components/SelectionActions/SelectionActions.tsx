import { useEffect, useState } from "preact/hooks";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

interface SelectionActionsProps {
  /** The selected element's box (viewport px). */
  rect: DOMRect;
  /** The DOM tree is open (the action shows it pressed). */
  domOpen: boolean;
  onShowInDom(): void;
  /**
   * Make responsive goes to the agent working on this page as a job of its
   * own (`send`), or, with no agent, its prompt is copied (`copy`).
   */
  responsiveMode: "send" | "copy";
  /** Make responsive; resolves to whether it went (or was copied). */
  onMakeResponsive(): Promise<boolean> | boolean;
}

/** The actions' size and their gap to the selection, in px. */
const SIZE = 20;
const GAP = 4;
/** The actions' row: two buttons, 4px apart. */
const ROW = SIZE * 2 + 4;
/** How long Make responsive's tooltip says "Sent to agent" / "Prompt copied", in ms. */
const DONE_FOR = 1500;

/**
 * Actions on the selection, above its top-right corner, right-aligned with
 * it: Make responsive (the agent makes the element work at every width, a
 * job of its own; its prompt copied when no agent works on the page), then
 * Show in DOM (opens the DOM tree on the selected element). 20px buttons,
 * 4px apart. Inside the corner when the element touches the top of the
 * window (the tooltips then go below, so they stay on screen).
 */
export function SelectionActions({ rect, domOpen, onShowInDom, responsiveMode, onMakeResponsive }: SelectionActionsProps) {
  const inside = rect.top < SIZE + GAP;
  const right = Math.round(inside ? rect.right - GAP : rect.right);
  const side = inside ? "bottom" : "top";
  // After Make responsive, its tooltip says so for a moment.
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), DONE_FOR);
    return () => clearTimeout(timer);
  }, [done]);
  const doneText = responsiveMode === "send" ? "Sent to agent" : "Prompt copied";
  return (
    <div
      class="selection-actions"
      style={{ left: px(right - ROW), top: px(Math.round(inside ? rect.top + GAP : rect.top - SIZE - GAP)) }}
    >
      <Tooltip text={done ? doneText : "Make responsive"} side={side} forceOpen={done}>
        <button
          type="button"
          class="action"
          aria-label={responsiveMode === "send" ? "Make responsive: send to the agent" : "Make responsive: copy the prompt"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={async () => {
            if ((await onMakeResponsive()) !== false) setDone(true);
          }}
        >
          <Icon name="responsive" />
        </button>
      </Tooltip>
      <Tooltip text="Show in DOM" side={side}>
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
