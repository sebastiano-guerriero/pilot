import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

interface SelectionActionsProps {
  /** The element's box (viewport px). */
  rect: DOMRect;
  /** The DOM tree is open (the action shows it pressed). */
  domOpen?: boolean;
  /** Show in DOM; none: not offered (a busy element that isn't selected only gets its loader). */
  onShowInDom?(): void;
  /**
   * A job isn't finished on the element (see PilotSession.jobOn). The
   * loader takes the corner (`text`, where the job stands: "Make
   * responsive: Claude Code is working", is its label). Show in DOM stays,
   * on the loader's left. With `onCancel`
   * (the agent isn't done yet), hovering the loader turns it into an X, its
   * tooltip says "Cancel job", and a click takes the job back. Once the
   * agent is done (Pilot checking), the tooltip says where it stands.
   */
  busy?: Busy;
  /**
   * The element has an unresolved comment thread: a comment icon on the
   * corner (the far right, after the loader if there's one; the actions
   * on its left), that opens the thread.
   */
  onOpenThread?(): void;
}

/** A job on the element: where it stands, and how to take it back (none once the agent is done). */
export interface Busy {
  text: string;
  onCancel?(): void;
}

/** The actions' size and their gap to the selection, in px. */
const SIZE = 20;
const GAP = 4;

/**
 * Where `count` actions sit for an element's box (viewport px): one 20px
 * square each, 4px apart, right-aligned with it, 4px above its top edge (or
 * inside it, 4px in, when it touches the top of the window). What other
 * overlays keep clear of (the hover label).
 */
export function actionsBox(rect: DOMRect, count: number): { left: number; top: number; right: number; bottom: number; inside: boolean } {
  const inside = rect.top < SIZE + GAP;
  const width = count * SIZE + Math.max(count - 1, 0) * 4;
  // Not rounded: on the same fractional pixels as the element's outline and label.
  const right = inside ? rect.right - GAP : rect.right;
  const top = inside ? rect.top + GAP : rect.top - SIZE - GAP;
  return { left: right - width, top, right, bottom: top + SIZE, inside };
}

/**
 * Status and navigation on an element, above its top-right corner,
 * right-aligned with it, 20px squares 4px apart: on the selection (the same
 * with either tool), Show in DOM (opens the DOM tree on the selected
 * element). While a job is on the element (`busy`), its loader takes the
 * corner; with an unresolved comment thread, a comment icon takes the
 * corner and opens it. Tasks for the agent (Make responsive) aren't here:
 * they're the comment box's `/` actions. Elements that aren't selected get these
 * two alone, so they're found on the page. Inside
 * the corner when the element touches the top of the window (the tooltips
 * then go below, so they stay on screen).
 */
export function SelectionActions({
  rect,
  domOpen = false,
  onShowInDom,
  busy,
  onOpenThread,
}: SelectionActionsProps) {
  const count = Number(!!onShowInDom) + Number(!!onOpenThread) + Number(!!busy);
  const box = actionsBox(rect, count);
  const side = box.inside ? "bottom" : "top";
  if (!count) return null;
  return (
    <div class="selection-actions" style={{ left: px(box.left), top: px(box.top) }}>
      {onShowInDom && (
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
      )}
      {busy &&
        (busy.onCancel ? (
          <Tooltip text="Cancel job" side={side}>
            <button
              type="button"
              class="action busy"
              aria-label={`Cancel job (${busy.text})`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={busy.onCancel}
            >
              <Icon name="busy" class="spinner" />
              <Icon name="close" class="cancel" />
            </button>
          </Tooltip>
        ) : (
          <Tooltip text={busy.text} side={side}>
            <span class="action busy" role="status" aria-label={busy.text} tabIndex={0}>
              <Icon name="busy" class="spinner" />
            </span>
          </Tooltip>
        ))}
      {onOpenThread && (
        <Tooltip text="Open comment" side={side}>
          <button type="button" class="action" aria-label="Open comment" onMouseDown={(e) => e.preventDefault()} onClick={onOpenThread}>
            <Icon name="thread" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
