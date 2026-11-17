import { useEffect, useState } from "preact/hooks";
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
   * Make responsive goes to the agent working on this page as a job of its
   * own (`send`), or, with no agent, its prompt is copied (`copy`).
   */
  responsiveMode?: "send" | "copy";
  /** Make responsive; resolves to how it went (false: it didn't). None: not offered. */
  onMakeResponsive?(): Promise<RequestOutcome> | RequestOutcome;
  /**
   * A job isn't finished on the element (see PilotSession.jobOn). The
   * loader takes the corner (`text`, where the job stands: "Make
   * responsive: Claude Code is working", is its label), and the actions
   * that send a job aren't offered meanwhile (the element doesn't get a
   * second one). Show in DOM stays, on the loader's left. With `onCancel`
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

/**
 * How asking for a task went: sent to the agent, its prompt copied, or
 * already open for this element (nothing new sent); false when it failed.
 */
export type RequestOutcome = "sent" | "copied" | "open" | false;

/** What the tooltip says for a moment after the click. */
const OUTCOME_TEXT = { sent: "Sent to agent", copied: "Prompt copied", open: "Already with the agent" } as const;

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

/** How long Make responsive's tooltip says how it went ("Sent to agent"…), in ms. */
const DONE_FOR = 1500;

/**
 * Actions on an element, above its top-right corner, right-aligned with it,
 * 20px squares 4px apart: on the selection (the same with either tool), Make
 * responsive (the agent makes the element work at every width, a job of
 * its own; its prompt copied when no agent works on the page), then Show in
 * DOM (opens the DOM tree on the selected element). While a job is on the
 * element (`busy`), its loader takes the corner and Make responsive isn't
 * offered; with an unresolved comment thread, a comment icon takes the
 * corner and opens it. Elements that aren't selected get these
 * two alone, so they're found on the page. Inside
 * the corner when the element touches the top of the window (the tooltips
 * then go below, so they stay on screen).
 */
export function SelectionActions({
  rect,
  domOpen = false,
  onShowInDom,
  responsiveMode = "send",
  onMakeResponsive,
  busy,
  onOpenThread,
}: SelectionActionsProps) {
  const responsive = !busy && !!onMakeResponsive;
  const count = Number(responsive) + Number(!!onShowInDom) + Number(!!onOpenThread) + Number(!!busy);
  const box = actionsBox(rect, count);
  const side = box.inside ? "bottom" : "top";
  // After Make responsive, its tooltip says how it went for a moment.
  const [outcome, setOutcome] = useState<Exclude<RequestOutcome, false> | null>(null);
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), DONE_FOR);
    return () => clearTimeout(timer);
  }, [outcome]);
  if (!count) return null;
  return (
    <div class="selection-actions" style={{ left: px(box.left), top: px(box.top) }}>
      {responsive && (
        <Tooltip text={outcome ? OUTCOME_TEXT[outcome] : "Make responsive"} side={side} forceOpen={!!outcome}>
          <button
            type="button"
            class="action"
            aria-label={responsiveMode === "send" ? "Make responsive: send to the agent" : "Make responsive: copy the prompt"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={async () => {
              const result = await onMakeResponsive?.();
              if (result) setOutcome(result);
            }}
          >
            <Icon name="responsive" />
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
