import { useLayoutEffect, useState } from "preact/hooks";

/**
 * Live viewport rect of `element`, re-measured every frame so highlights and
 * the property search follow scrolling, resizes, animations and Pilot's own
 * inline-style edits. Only re-renders when the rect actually changes.
 * Returns null when there's no element or it left the DOM (e.g. after HMR).
 */
export function useElementRect(element: Element | null): DOMRect | null {
  const [state, setState] = useState<{ element: Element | null; rect: DOMRect | null }>(() => ({
    element,
    rect: measure(element),
  }));

  useLayoutEffect(() => {
    if (!element) return;
    let frame = 0;
    let last: DOMRect | null = null;
    const tick = () => {
      const next = measure(element);
      if (!sameRect(last, next)) {
        last = next;
        setState({ element, rect: next });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [element]);

  // On the render where `element` changes, the stored rect still belongs to the
  // previous element: measure the new one directly so nothing draws stale.
  return state.element === element ? state.rect : measure(element);
}

function measure(element: Element | null): DOMRect | null {
  return element?.isConnected ? element.getBoundingClientRect() : null;
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
