import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";

interface PropertyPanelProps {
  /** The panel's title ("Mask Image"), also its accessible name. */
  title: string;
  /** What it opens beside: the property dialog's box, read on every render (it moves with the page). */
  beside(): DOMRect | null;
  /** Closed: × or Esc. Focus then goes back to what opened it (the caller's). */
  onClose(): void;
  /** The rows (PropertyRow), first focused when it opens. */
  children: ComponentChildren;
  /** A line of help under the rows, in the property dialog's footer (a dotted line above, dimmed text). */
  footer?: ComponentChildren;
}

/** Space between the dialog and the panel, and the closest the panel gets to the window's edges. */
const GAP = 8;
const EDGE = 8;
/** As wide as the property dialog (PropertyDialog.css). */
const WIDTH = 260;

const FOCUSABLE = 'button:not([tabindex="-1"]):not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/**
 * A property too rich for one row (a mask; later filters, shadows) is edited
 * here, in a panel of its own beside the property dialog, as Figma and
 * Framer do: the dialog's look, a title with ×, its rows under a line. It
 * opens on the side of the dialog with room, follows the dialog (and so the
 * page's scroll), and can be dragged by the strip along its top edge.
 * Esc closes it (only it), Tab stays in it.
 */
export function PropertyPanel({ title, beside, onClose, children, footer }: PropertyPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  // Dragged this far from where it opens.
  const [moved, setMoved] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    if (h !== height) setHeight(h);
  });
  // The dialog moves with the page's scroll and the window: so does the panel.
  useEffect(() => {
    window.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    return () => {
      window.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
    };
  }, []);
  // Open: the first field has the focus.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`.panel-rows ${FOCUSABLE}`)?.focus();
  }, []);

  const box = beside();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = box ? (box.right + GAP + WIDTH <= vw - EDGE ? box.right + GAP : box.left - GAP - WIDTH) : vw - EDGE - WIDTH;
  let top = box ? box.top : EDGE;
  left = Math.min(Math.max(EDGE, left + moved.x), vw - EDGE - WIDTH);
  top = Math.min(Math.max(EDGE, top + moved.y), Math.max(EDGE, vh - EDGE - height));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    // Tab stays in the panel: from the last field to the first, and back.
    const all = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const at = all.indexOf(e.composedPath()[0] as HTMLElement);
    const wrap = e.shiftKey ? at <= 0 : at === all.length - 1;
    if (!all.length || !wrap) return;
    e.preventDefault();
    e.stopPropagation();
    (e.shiftKey ? all.at(-1) : all[0])?.focus();
  };

  // Focus gone nowhere (Enter in a field blurs it): the panel keeps it, so
  // Esc still reaches it rather than the page (which would drop the selection).
  const onFocusOut = (e: FocusEvent) => {
    if (e.relatedTarget) return;
    requestAnimationFrame(() => {
      const panel = ref.current;
      if (panel?.isConnected && !(panel.getRootNode() as ShadowRoot | Document).activeElement) panel.focus();
    });
  };

  const onDragStart = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, from: moved };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) setMoved({ x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y });
  };
  const onDragEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={ref}
      class="property-panel"
      role="dialog"
      aria-label={title}
      style={{ left: px(left), top: px(top) }}
      data-dragging={dragging || undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onFocusOut={onFocusOut}
    >
      <div
        class="drag-handle"
        aria-hidden="true"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <Icon name="grip" />
      </div>
      <div class="panel-header">
        <span class="panel-title">{title}</span>
        <button type="button" class="panel-close" aria-label={`Close ${title}`} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div class="panel-rows">{children}</div>
      {footer && (
        <footer class="footer" aria-live="polite">
          {footer}
        </footer>
      )}
    </div>
  );
}
