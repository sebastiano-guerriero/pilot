import { useEffect, useReducer } from "preact/hooks";

/**
 * The window's scroll, read at render, and a render at each scroll when
 * `listen`: for what's placed from it (the dialogs' spot, kept on screen)
 * when nothing else renders it as the page scrolls (its element's box
 * doesn't move in the window: in a fixed or sticky container).
 */
export function useWindowScroll(listen: boolean): { x: number; y: number } {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!listen) return;
    const onScroll = () => rerender(undefined);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [listen]);
  return { x: window.scrollX, y: window.scrollY };
}
