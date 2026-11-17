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
   * A job isn't finished on the element (see PilotSession.jobOn): where it
   * stands, in words ("Make responsive: Claude Code is working"). The
   * loader takes the corner, with this in its tooltip, and the actions that
   * send a job aren't offered meanwhile (the element doesn't get a second
   * one). Show in DOM stays, on the loader's left.
   */
  busy?: string;
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

/** How long Make responsive's tooltip says how it went ("Sent to agent"…), in ms. */
const DONE_FOR = 1500;

/**
 * Actions on an element, above its top-right corner, right-aligned with it,
 * 20px squares 4px apart: on the selection (the same with either tool), Make
 * responsive (the agent makes the element work at every width, a job of
 * its own; its prompt copied when no agent works on the page), then Show in
 * DOM (opens the DOM tree on the selected element). While a job is on the
 * element (`busy`), its loader takes the corner and Make responsive isn't
 * offered; busy elements that aren't selected get the loader alone. Inside
 * the corner when the element touches the top of the window (the tooltips
 * then go below, so they stay on screen).
 */
export function SelectionActions({ rect, domOpen = false, onShowInDom, responsiveMode = "send", onMakeResponsive, busy }: SelectionActionsProps) {
  const inside = rect.top < SIZE + GAP;
  const responsive = !busy && !!onMakeResponsive;
  // The row: one 20px square per item, 4px apart.
  const count = Number(responsive) + Number(!!onShowInDom) + Number(!!busy);
  const ROW = count * SIZE + (count - 1) * 4;
  const right = Math.round(inside ? rect.right - GAP : rect.right);
  const side = inside ? "bottom" : "top";
  // After Make responsive, its tooltip says how it went for a moment.
  const [outcome, setOutcome] = useState<Exclude<RequestOutcome, false> | null>(null);
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), DONE_FOR);
    return () => clearTimeout(timer);
  }, [outcome]);
  if (!count) return null;
  return (
    <div
      class="selection-actions"
      style={{ left: px(right - ROW), top: px(Math.round(inside ? rect.top + GAP : rect.top - SIZE - GAP)) }}
    >
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
      {busy && (
        <Tooltip text={busy} side={side}>
          <span class="action busy" role="status" aria-label={busy} tabIndex={0}>
            <Icon name="busy" class="spinner" />
          </span>
        </Tooltip>
      )}
    </div>
  );
}
