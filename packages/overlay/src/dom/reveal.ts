/**
 * Brings an element into view by scrolling the window only. Pilot never
 * scrolls the page's own containers: `scrollIntoView()` would, `overflow:
 * hidden` ones included (a script can scroll those), and the page's elements
 * would move: a collapsed sidebar's content slides, a carousel jumps. An
 * element inside a container that hides it stays hidden; the designer sees
 * the page as it is.
 */

/** How far to scroll the window (or a list, with its `origin`) to show `rect` (viewport px): 0 when it's in view already. */
export function windowScroll(
  rect: { top: number; bottom: number; left: number; right: number },
  viewport: { width: number; height: number },
  block: "nearest" | "center",
  /** Where the viewport starts (a scrolling list's box): 0, 0 for the window. */
  origin: { left: number; top: number } = { left: 0, top: 0 },
): { x: number; y: number } {
  return {
    x: axis(rect.left - origin.left, rect.right - origin.left, viewport.width, block),
    y: axis(rect.top - origin.top, rect.bottom - origin.top, viewport.height, block),
  };
}

function axis(start: number, end: number, size: number, block: "nearest" | "center"): number {
  if (start >= 0 && end <= size) return 0;
  if (block === "center") return Math.round((start + end) / 2 - size / 2);
  // Nearest: the edge it's past, its start first when it's bigger than the window.
  if (start < 0 || end - start > size) return Math.round(start);
  return Math.round(end - size);
}

/**
 * Scrolls `container`, one of Pilot's own lists (the DOM tree's rows, a
 * select's options), so `item` shows: just enough, and nothing else
 * scrolls. Never `scrollIntoView()`: it would scroll every scroller around
 * the list too, the page's included.
 */
export function scrollWithin(container: Element | null | undefined, item: Element | null | undefined, axes: "y" | "both" = "y"): void {
  if (!container || !item) return;
  const box = container.getBoundingClientRect();
  const { x, y } = windowScroll(item.getBoundingClientRect(), { width: box.width, height: box.height }, "nearest", box);
  if (y) container.scrollTop += y;
  if (x && axes === "both") container.scrollLeft += x;
}

/**
 * Scrolls the window so `element` shows (`nearest`: just enough; `center`:
 * to the middle). Resolves once the scroll is over (smooth: `scrollend`, or
 * 700ms at most); right away when nothing needed to scroll.
 */
export function revealInWindow(element: Element, block: "nearest" | "center" = "nearest", smooth = false): Promise<void> {
  const { x, y } = windowScroll(element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, block);
  if (!x && !y) return Promise.resolve();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const animate = smooth && !reduced;
  window.scrollBy({ left: x, top: y, behavior: animate ? "smooth" : "auto" });
  if (!animate) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("scrollend", done);
      resolve();
    };
    const timer = setTimeout(done, 700);
    window.addEventListener("scrollend", done);
  });
}
