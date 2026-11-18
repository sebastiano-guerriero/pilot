import { useLayoutEffect, useState } from "preact/hooks";
import { type EditableElement, isEditable } from "../dom/target.ts";
import { TEXT_EDIT_ATTRIBUTE } from "../dom/text.ts";

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
 * - reports double-clicks through `onDoubleClick` (inline text editing),
 * - shows a crosshair cursor over the page.
 *
 * While an element's text is edited inline (`editing`), the pointer works
 * as in any text inside it (caret, selecting, the context menu) but still
 * never reaches the page's handlers, and a click there doesn't follow a
 * link or submit a form.
 *
 * Events coming from Pilot's own UI (inside `host`) pass through untouched.
 * Scrolling, keyboard and hover styles keep working normally.
 */
export function useElementPicker(
  active: boolean,
  host: HTMLElement,
  /** A click picked `element`; `shift`: held, to add it to the selection (or take it out). */
  onPick: (element: EditableElement, how: { shift: boolean }) => void,
  options: { editing?: Element | null; onDoubleClick?(element: EditableElement, at: { x: number; y: number }): void } = {},
): EditableElement | null {
  const { editing = null, onDoubleClick } = options;
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
      if (editing && e.composedPath().includes(editing)) {
        e.stopImmediatePropagation();
        if (e.type === "click" || e.type === "auxclick") e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "click") onPick(el, { shift: e instanceof MouseEvent && e.shiftKey });
      if (e.type === "dblclick" && e instanceof MouseEvent) onDoubleClick?.(el, { x: e.clientX, y: e.clientY });
    };

    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    document.addEventListener("mouseout", onLeave, true);
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, onBlocked, true);

    // The only thing Pilot adds to the page outside its Shadow DOM, and only
    // while select mode is on. Pilot's host element is excluded: `cursor` is
    // inherited, so matching the host would put the crosshair on all of
    // Pilot's UI too (and `:host` can't override a page `!important`). Pilot's
    // UI then shows its own cursors: arrow on panels, text in inputs,
    // pointer on buttons.
    const cursor = document.createElement("style");
    cursor.id = CURSOR_STYLE_ID;
    // The element edited inline shows the text cursor, and no focus ring of
    // its own: the selection outline marks it.
    cursor.textContent = `html, html *:not(${host.localName}) { cursor: crosshair !important; }
[${TEXT_EDIT_ATTRIBUTE}] { cursor: text !important; outline: none !important; }`;
    document.head.append(cursor);

    return () => {
      window.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("mouseout", onLeave, true);
      for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onBlocked, true);
      cursor.remove();
    };
  }, [active, host, onPick, editing, onDoubleClick]);

  return hovered;
}
