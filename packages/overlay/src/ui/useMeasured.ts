import { useLayoutEffect, useState } from "preact/hooks";

/**
 * `measure(element)`, re-run every frame so overlays follow the page live
 * (scrolling, resizing, values being dragged). Re-renders only when the
 * result changes.
 */
export function useMeasured<T>(element: Element, measure: (element: Element) => T): T {
  const [value, setValue] = useState(() => measure(element));
  useLayoutEffect(() => {
    let frame = 0;
    let last = "";
    const tick = () => {
      const next = measure(element);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setValue(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [element]);
  return value;
}
