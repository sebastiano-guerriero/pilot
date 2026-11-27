import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * The footer's message while a field that tilts or moves the element in 3D
 * is in use (rotate's X and Y, translate's Z), when its parent has no
 * perspective: without one, it squashes or doesn't show (PropertyDialog.css:
 * `.footer .alert`). Pilot doesn't add the perspective: on a container it
 * also makes a stacking context and moves `position: fixed` children (the
 * owner's design, 2026-11-27).
 */
const PERSPECTIVE_HINT = (
  <>
    <span class="alert">Add perspective</span> to the parent to see it in 3D
  </>
);

/** Whether `parent` has a perspective now (the page's, or Pilot's previewed): its 3D children lean back. */
export function hasPerspective(parent: Element | null): boolean {
  return !!parent && getComputedStyle(parent).perspective !== "none";
}

/**
 * Shows the perspective message while `active` (a 3D field in use) and the
 * element's parent has none. Only its own: set while it applies, cleared
 * when it stops, so another editor's message stays otherwise.
 */
export function usePerspectiveHint(element: Element, active: boolean, onHint?: (hint: ComponentChildren | null) => void): void {
  const flat = active && !hasPerspective(element.parentElement);
  const shown = useRef(false);
  useEffect(() => {
    if (flat === shown.current) return;
    shown.current = flat;
    onHint?.(flat ? PERSPECTIVE_HINT : null);
  }, [flat]);
  useEffect(
    () => () => {
      if (shown.current) onHint?.(null);
    },
    [],
  );
}
