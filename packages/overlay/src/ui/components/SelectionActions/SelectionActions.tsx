import type { PlacedRect } from "../../../select/useElementRect.ts";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { PageAnchor } from "../PageAnchor/PageAnchor.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

interface SelectionActionsProps {
  /** The element's box (viewport px), drawn in the page when it has `at` (PageAnchor). */
  rect: PlacedRect;
  /** On the selection, whose line is 2px (1px outside the box, Highlight.css): the actions keep 4px from its outer edge. */
  selected?: boolean;
  /** The DOM tree is open (the action shows it pressed). */
  domOpen?: boolean;
  /**
   * Select similar: `count` elements like this one elsewhere on the page
   * (dom/similar.ts), selected with it on click. None: nothing similar, or
   * all of it is selected already.
   */
  similar?: { count: number; onSelect(): void };
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
   * corner (left of the loader if there's one, which stays on the far
   * right; the actions on its left), that opens the thread.
   */
  onOpenThread?(): void;
}

/** A job on the element: where it stands, and how to take it back (none once the agent is done). */
export interface Busy {
  /** Where the job stands, with what it is ("Comment: Claude Code is working on it"): for screen readers. */
  text: string;
  /** What the job is about, for the tooltip's first line ("“Make the price bigger”", "3 style changes"). */
  about?: string;
  /** Where it stands, for the tooltip's second line ("Claude Code is working on it"). */
  status?: string;
  onCancel?(): void;
  /**
   * The job is stuck (see PilotSession.stuck): the loader gives way to a
   * red warning, and the tooltip says what's wrong and what to do. Hovering
   * still turns it into an X when it can be taken back.
   */
  stuck?: { title: string; detail: string };
}

/** The actions' size and their gap to the selection, in px. */
const SIZE = 20;
const GAP = 4;

/**
 * Where `count` actions sit for an element's box (viewport px): one 20px
 * square each, 4px apart, right-aligned with it, 4px above its top edge
 * (above its 2px line, for the selection: `selected`), or inside it, 4px
 * in, when it touches the top of the window. What other
 * overlays keep clear of (the hover label).
 */
export function actionsBox(
  rect: DOMRect,
  count: number,
  selected = false,
): { left: number; top: number; right: number; bottom: number; inside: boolean } {
  // The selection's line reaches 1px outside its box.
  const outset = selected ? 1 : 0;
  const inside = rect.top < SIZE + GAP + outset;
  const width = count * SIZE + Math.max(count - 1, 0) * 4;
  // Not rounded: on the same fractional pixels as the element's outline and label.
  const right = inside ? rect.right - GAP : rect.right;
  const top = inside ? rect.top + GAP : rect.top - outset - SIZE - GAP;
  return { left: right - width, top, right, bottom: top + SIZE, inside };
}

/**
 * Status and navigation on an element, above its top-right corner,
 * right-aligned with it, 20px squares 4px apart (4px above its line): on the selection (the same
 * with either tool), Select similar (when there's something similar), Show in DOM (opens the DOM tree on the selected
 * element). While a job is on the element (`busy`), its loader takes the
 * corner, always the far right; with an unresolved comment thread, a
 * comment icon sits left of it (or takes the corner) and opens it. Elements that aren't selected get these
 * two alone, so they're found on the page. Inside
 * the corner when the element touches the top of the window (the tooltips
 * then go below, so they stay on screen).
 */
export function SelectionActions({
  rect,
  selected = false,
  domOpen = false,
  similar,
  onShowInDom,
  busy,
  onOpenThread,
}: SelectionActionsProps) {
  const count = Number(!!similar) + Number(!!onShowInDom) + Number(!!onOpenThread) + Number(!!busy);
  const box = actionsBox(rect, count, selected);
  const side = box.inside ? "bottom" : "top";
  if (!count) return null;
  return (
    <PageAnchor at={rect.at}>
      <div class="selection-actions" style={{ left: px(box.left), top: px(box.top) }}>
        {similar && (
          <Tooltip text={`Select ${similar.count} similar`} side={side}>
            <button
              type="button"
              class="action"
              aria-label={`Select ${similar.count} similar`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={similar.onSelect}
            >
              <Icon name="similar" />
            </button>
          </Tooltip>
        )}
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
        {onOpenThread && (
          <Tooltip text="Open comment" side={side}>
            <button type="button" class="action" aria-label="Open comment" onMouseDown={(e) => e.preventDefault()} onClick={onOpenThread}>
              <Icon name="thread" />
            </button>
          </Tooltip>
        )}
        {/* The loader last, on the far right: where a job always shows. */}
        {busy &&
          (busy.onCancel ? (
            <Tooltip
              text={busy.stuck?.title ?? busy.about ?? "Cancel job"}
              detail={busy.stuck?.detail ?? (busy.about ? `${busy.status ?? busy.text} · Click to cancel` : undefined)}
              side={side}
              align="end"
            >
              <button
                type="button"
                class="action busy"
                data-stuck={busy.stuck ? "" : undefined}
                aria-label={busy.stuck ? `${busy.stuck.title}. ${busy.stuck.detail}. Cancel job (${busy.text})` : `Cancel job (${busy.text})`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={busy.onCancel}
              >
                <Icon name={busy.stuck ? "warning" : "busy"} class="spinner" />
                <Icon name="xmark" class="cancel" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip text={busy.stuck?.title ?? busy.about ?? busy.text} detail={busy.stuck?.detail ?? (busy.about ? busy.status : undefined)} side={side} align="end">
              <span
                class="action busy"
                data-stuck={busy.stuck ? "" : undefined}
                role="status"
                aria-label={busy.stuck ? `${busy.stuck.title}. ${busy.stuck.detail}` : busy.text}
                tabIndex={0}
              >
                <Icon name={busy.stuck ? "warning" : "busy"} class="spinner" />
              </span>
            </Tooltip>
          ))}
      </div>
    </PageAnchor>
  );
}
