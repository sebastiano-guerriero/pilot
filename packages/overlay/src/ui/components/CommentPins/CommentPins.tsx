import type { JobStatus } from "@pilot/protocol";
import { useElementRect } from "../../../select/useElementRect.ts";
import { px } from "../../px.ts";

/** How far a pin's center stays from the window's edges: half its size, and 2px. */
const INSET = 12;

export interface Pin {
  id: string;
  element: Element;
  /** Where its latest comment stands (none: done, or never sent). */
  status?: JobStatus;
  /** Its thread is the one open. */
  selected: boolean;
}

interface CommentPinsProps {
  pins: Pin[];
  /** A pin was clicked: open its thread (select its element). */
  onOpen(element: Element): void;
}

/**
 * A marker on each element with a comment thread, numbered in the order
 * the threads started, on the element's top-left corner, while the Comment
 * tool is on. Clicking one opens its thread. Placeholder look, pending the
 * design.
 */
export function CommentPins({ pins, onOpen }: CommentPinsProps) {
  return (
    <>
      {pins.map((pin, i) => (
        <PinMarker key={pin.id} pin={pin} n={i + 1} onOpen={onOpen} />
      ))}
    </>
  );
}

function PinMarker({ pin, n, onOpen }: { pin: Pin; n: number; onOpen(element: Element): void }) {
  const rect = useElementRect(pin.element);
  if (!rect) return null;
  // On the corner, but whole on screen (an element at the window's edge).
  const left = Math.min(Math.max(rect.left, INSET), document.documentElement.clientWidth - INSET);
  const top = Math.min(Math.max(rect.top, INSET), window.innerHeight - INSET);
  return (
    <button
      type="button"
      class="comment-pin"
      style={{ left: px(Math.round(left)), top: px(Math.round(top)) }}
      data-status={pin.status}
      data-selected={pin.selected || undefined}
      aria-label={`Comment ${n}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onOpen(pin.element)}
    >
      {n}
    </button>
  );
}
