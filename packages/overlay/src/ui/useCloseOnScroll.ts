import { type RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * Closes a floating menu (a select's, the variables', a right-click menu) when
 * anything outside it scrolls: the page, or Pilot's own UI (the dialog's
 * list). It's placed once, fixed in the window, so its trigger would move
 * away from it (the owner's call, as native selects do: close, not follow).
 * Its own list scrolling doesn't count. Pilot's scrolls happen in its shadow
 * root, whose scroll events don't reach the window: it listens there too.
 */
export function useCloseOnScroll(menu: RefObject<Element | null>, open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      const el = menu.current;
      if (el && e.composedPath().includes(el)) return;
      close.current();
    };
    const root = menu.current?.getRootNode();
    const shadow = root instanceof ShadowRoot ? root : null;
    window.addEventListener("scroll", onScroll, true);
    shadow?.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      shadow?.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);
}
