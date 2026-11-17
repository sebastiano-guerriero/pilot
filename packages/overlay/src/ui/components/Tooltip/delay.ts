/**
 * When tooltips open, shared by all of them (as Base UI's tooltip provider
 * does): the first waits a moment, so it doesn't flash while the pointer
 * passes by; once one has shown, moving on to the next is instant, as long
 * as one is open or closed less than `WARM_FOR` ago.
 */

/** How long the pointer rests on a trigger before its tooltip opens, in ms. */
export const OPEN_DELAY = 400;
/** How long after a tooltip closes the next one still opens at once, in ms. */
export const WARM_FOR = 400;

let openCount = 0;
let closedAt = Number.NEGATIVE_INFINITY;

/** The wait before a tooltip opens now: 0 while warm, else `OPEN_DELAY`. */
export function openDelay(now = Date.now()): number {
  return openCount > 0 || now - closedAt < WARM_FOR ? 0 : OPEN_DELAY;
}

/** A tooltip opened. */
export function tooltipOpened(): void {
  openCount++;
}

/** A tooltip (one that had opened) closed. */
export function tooltipClosed(now = Date.now()): void {
  openCount = Math.max(0, openCount - 1);
  closedAt = now;
}

/**
 * Moving between triggers: the tooltip opened at once tells the others, so
 * the one left behind disappears at once too, instead of fading out.
 */
const others = new Set<() => void>();

/** Listen for a tooltip opening at once (returns the unsubscribe). */
export function onSwitch(listener: () => void): () => void {
  others.add(listener);
  return () => others.delete(listener);
}

/** A tooltip opened at once: the others drop their closing fade. */
export function switched(by: () => void): void {
  for (const listener of others) if (listener !== by) listener();
}

/** Back to cold (tests). */
export function resetTooltipDelay(): void {
  openCount = 0;
  closedAt = Number.NEGATIVE_INFINITY;
}
