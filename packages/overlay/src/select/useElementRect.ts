import { useLayoutEffect, useState } from "preact/hooks";
import { type At, anchorAt, sameAt } from "../dom/anchor.ts";
import { pseudoRect } from "../dom/pseudoBox.ts";

/** An element's box (viewport px), and where what follows it is drawn (dom/anchor.ts; PageAnchor). */
export type PlacedRect = DOMRect & { at?: At | null };

/**
 * Live viewport rect of `element`, re-measured every frame so highlights and
 * the property search follow scrolling, resizes, animations and Pilot's own
 * inline-style edits. Only re-renders when the rect actually changes. With
 * it, `at`: the scroll it was measured at, so what follows the element is
 * drawn in the page (anchorAt), and scrolls with it.
 * Returns null when there's no element or it left the DOM (e.g. after HMR).
 * With `pseudo`, its ::before's or ::after's box (dom/pseudoBox.ts), null
 * where that can't be told.
 */
export function useElementRect(element: Element | null, pseudo?: "::before" | "::after"): PlacedRect | null {
  const [state, setState] = useState<{ element: Element | null; pseudo?: string; rect: PlacedRect | null }>(() => ({
    element,
    pseudo,
    rect: measure(element, pseudo),
  }));

  useLayoutEffect(() => {
    if (!element) return;
    let frame = 0;
    let last: PlacedRect | null = null;
    const tick = () => {
      const next = measure(element, pseudo);
      if (!sameRect(last, next)) {
        last = next;
        setState({ element, pseudo, rect: next });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [element, pseudo]);

  // On the render where `element` changes, the stored rect still belongs to the
  // previous element: measure the new one directly so nothing draws stale.
  return state.element === element && state.pseudo === pseudo ? state.rect : measure(element, pseudo);
}

function measure(element: Element | null, pseudo?: "::before" | "::after"): PlacedRect | null {
  if (!element?.isConnected) return null;
  const rect = pseudo ? pseudoRect(element, pseudo) : element.getBoundingClientRect();
  if (!rect) return null;
  return Object.assign(rect, { at: anchorAt(element, rect) });
}

function sameRect(a: PlacedRect | null, b: PlacedRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && sameAt(a.at ?? null, b.at ?? null);
}
