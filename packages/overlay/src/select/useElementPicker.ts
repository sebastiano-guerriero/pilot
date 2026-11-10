import { useLayoutEffect, useState } from "preact/hooks";
import { type EditableElement, isEditable } from "../dom/target.ts";

/** Pointer events Pilot swallows in select mode so the page doesn't react to picking clicks. */
const BLOCKED_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
] as const;

const CURSOR_STYLE_ID = "pilot-select-cursor";

/**
 * Select mode. While `active`:
 * - tracks the element under the pointer (returned, for the hover highlight),
 * - intercepts clicks on the page (capture phase, before the app's own
 *   handlers) and reports the clicked element through `onPick`,
 * - shows a crosshair cursor over the page.
 *
 * Events coming from Pilot's own UI (inside `host`) pass through untouched.
 * Scrolling, keyboard and hover styles keep working normally.
 */
export function useElementPicker(
  active: boolean,
  host: HTMLElement,
  onPick: (element: EditableElement) => void,
): EditableElement | null {
  const [hovered, setHovered] = useState<EditableElement | null>(null);

  // Layout effect: listeners must be in place the moment select mode turns on,
  // before the next click can reach the page.
  useLayoutEffect(() => {
    if (!active) {
      setHovered(null);
      return;
    }

    const fromPage = (e: Event): EditableElement | null => {
      const path = e.composedPath();
      if (path.includes(host)) return null;
      // Deepest element, so components with their own shadow DOM still resolve.
      const el = path.find(isEditable);
      if (!el || el === document.documentElement) return null;
      return el;
    };

    const onMove = (e: PointerEvent) => setHovered(fromPage(e));
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) setHovered(null);
    };
    const onBlocked = (e: Event) => {
      const el = fromPage(e);
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "click") onPick(el);
    };

    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    document.addEventListener("mouseout", onLeave, true);
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, onBlocked, true);

    // The only thing Pilot adds to the page outside its Shadow DOM, and only
    // while select mode is on. Pilot's own UI resets it (`:host { all: initial }`).
    const cursor = document.createElement("style");
    cursor.id = CURSOR_STYLE_ID;
    cursor.textContent = "html, html * { cursor: crosshair !important; }";
    document.head.append(cursor);

    return () => {
      window.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("mouseout", onLeave, true);
      for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onBlocked, true);
      cursor.remove();
    };
  }, [active, host, onPick]);

  return hovered;
}
