/**
 * Where Pilot draws what follows an element (its outline, its actions, the
 * dialog beside it): in the page, so the browser scrolls it along with the
 * page itself.
 *
 * Drawn fixed in the window and moved every frame, an overlay always trails
 * the page while it scrolls: the browser scrolls the page on its own thread,
 * ahead of the script that moves the overlay. Drawn in the page instead
 * (PageAnchor), at the window's scroll when its box was measured, it moves
 * with the page between frames, and the next measurement puts it where it
 * already is.
 *
 * Not for an element that doesn't scroll with the window (in a fixed or a
 * sticky container: the page would move its overlay away from it), nor for
 * what would reach past the page's end (drawn in the page, it would make the
 * page longer): those stay in the window, as before (`null`). Sideways, the
 * anchor clips what it draws to the window's width (PageAnchor.css), so the
 * page never gets wider.
 */
export interface At {
  /** The window's scroll when the box was measured. */
  x: number;
  y: number;
  /** How tall the page was then (its scrollable height): what's drawn in it stays inside. */
  height: number;
}

/** How far Pilot's marks reach below an element's box (a label below it), in px. */
export const BELOW = 32;

/**
 * Where to draw what follows `element`, whose box is `rect` (viewport px,
 * measured just now): in the page at the scroll of now, or in the window
 * (null). `below` is how far past the box's bottom the overlay reaches (BELOW).
 */
export function anchorAt(element: Element, rect: { bottom: number }, below = BELOW, window_: Window = window): At | null {
  if (pinned(element, window_)) return null;
  const page = window_.document.scrollingElement ?? window_.document.documentElement;
  return within({ x: window_.scrollX, y: window_.scrollY, height: page.scrollHeight }, rect.bottom + below);
}

/**
 * `at`, when what's drawn down to `bottom` (viewport px, measured with it)
 * stays inside the page then; null otherwise (drawn in the window). Up
 * needs no check: the page doesn't grow that way.
 */
export function within(at: At | null, bottom: number): At | null {
  return at && bottom + at.y <= at.height ? at : null;
}

export function sameAt(a: At | null, b: At | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.height === b.height;
}

/** How long a pinned answer is kept, in ms: it's read every frame, and a container's position rarely changes. */
const PINNED_FOR = 500;
const pinnedCache = new WeakMap<Element, { pinned: boolean; time: number }>();

/** The element or a container of it is fixed or sticky: it doesn't scroll with the window (or not always). */
function pinned(element: Element, window_: Window): boolean {
  const now = window_.performance.now();
  const cached = pinnedCache.get(element);
  if (cached && now - cached.time < PINNED_FOR) return cached.pinned;
  let found = false;
  for (let el: Element | null = element; el; el = el.parentElement ?? ((el.getRootNode() as ShadowRoot).host || null)) {
    const position = window_.getComputedStyle(el).position;
    if (position === "fixed" || position === "sticky") {
      found = true;
      break;
    }
  }
  pinnedCache.set(element, { pinned: found, time: now });
  return found;
}
