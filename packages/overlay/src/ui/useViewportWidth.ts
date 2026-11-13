import { useEffect, useState } from "preact/hooks";

/**
 * The window's width in CSS px, kept current while it's resized. The width
 * media queries test (`window.innerWidth`, scrollbar included), so it's the
 * one to compare with breakpoints, not the page's client width.
 */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}
