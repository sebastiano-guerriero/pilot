import { useRef } from "preact/hooks";

/** Where a drag between limits is: the steps that count, and how far past a limit it is. */
export interface Held {
  /** The steps from the start that count (the value is `start + offset × perStep`), held at the limit. */
  offset: number;
  /**
   * How many steps the drag is past the limit the value stopped at (negative below a minimum),
   * counted from where it got there: the handle stretches by that (ScrubHandle's onScrub). 0 when
   * the value isn't held at a limit.
   */
  overflow: number;
}

/**
 * A drag on a number held between limits (a minimum, a maximum: 0, a percent's 100, a filter's
 * range), the way every field with a drag handle stops at one. Past it, dragging further doesn't
 * count: turning back moves the value at once. And it says how far past it is, so the handle
 * stretches, then springs back when let go (ScrubHandle). Its state lasts for one `gesture`.
 */
export function heldDrag() {
  let drag: { gesture: object; shift: number; heldAt: number | null } | null = null;
  return (gesture: object, steps: number, start: number, perStep: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): Held => {
    if (drag?.gesture !== gesture) drag = { gesture, shift: 0, heldAt: null };
    const d = drag;
    let offset = steps - d.shift;
    // Past the limit: the steps beyond it this time (`offset - limit`), which then don't count.
    let past = 0;
    if (Number.isFinite(start) && start + offset * perStep < min) {
      // From a value already under the minimum, it can't go any lower.
      const floor = Math.min(0, (min - start) / perStep);
      past = offset - floor;
      d.shift += past;
      offset = floor;
    } else if (Number.isFinite(start) && start + offset * perStep > max) {
      const ceiling = Math.max(0, (max - start) / perStep);
      past = offset - ceiling;
      d.shift += past;
      offset = ceiling;
    }
    // Where the drag reached the limit, while it stays past it: turning back moves the value at
    // once (above), and that ends it.
    if (past === 0) d.heldAt = null;
    else d.heldAt ??= steps - past;
    return { offset, overflow: d.heldAt === null ? 0 : steps - d.heldAt };
  };
}

/** heldDrag, kept for a component's life (a field's drags). */
export function useHeldDrag() {
  return useRef(heldDrag()).current;
}
