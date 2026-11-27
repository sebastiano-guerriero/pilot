import { type ComponentChildren, createContext } from "preact";
import { createPortal } from "preact/compat";
import { useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";

interface PropertyPanelProps {
  /** The panel's title ("Mask Image"), also its accessible name. */
  title: string;
  /** What it opens beside: the property dialog's box, read on every render (it moves with the page). */
  beside(): DOMRect | null;
  /** The property's row in the dialog, read on every render: the panel's title is level with it. Without one, the dialog's top. */
  anchor?(): DOMRect | null;
  /**
   * Closed: × or Esc, focus then going back to what opened it (the caller's). Or `replaced`: another
   * panel opened, which has the focus (focus stays there).
   */
  onClose(replaced?: boolean): void;
  /** The rows (PropertyRow), first focused when it opens. */
  children: ComponentChildren;
  /** A line of help under the rows, in the property dialog's footer (a dotted line above, dimmed text). */
  footer?: ComponentChildren;
  /** The title with × (default). Without (the color picker): the title is only its accessible name; the drag strip stays. */
  header?: boolean;
  /** Above the rows, edge to edge (no rows' padding): the color picker's area. */
  top?: ComponentChildren;
}

/**
 * How far the panel comes over the dialog's edge (the owner's call): over
 * its scrollbar and 2px more. The scrollbar is 3px in and 4px wide
 * (ScrollThumb.css). And the closest the panel gets to the window's edges.
 */
const OVERLAP = 3 + 4 + 2;
const EDGE = 8;
/** As wide as the property dialog (PropertyDialog.css). */
const WIDTH = 260;

/** An open panel, and the one it was opened from (a shadow's color picker: the shadow's panel). */
interface OpenPanel {
  close(): void;
  parent: OpenPanel | null;
}
/** The panels open now. One opening closes the others, except those it was opened from (the owner's call). */
const openPanels = new Set<OpenPanel>();
/** The panel the rows are in, for a panel opened from them. */
const ParentPanel = createContext<OpenPanel | null>(null);

const FOCUSABLE = 'button:not([tabindex="-1"]):not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/**
 * A property too rich for one row (a mask; later filters, shadows) is edited
 * here, in a panel of its own beside the property dialog, as Figma and
 * Framer do: the dialog's look, a title with ×, its rows under a line. It
 * opens next to the property's row (its title level with the row's label),
 * over the dialog's scrollbar and 2px more, on the side with room; it follows the dialog (and
 * so the page's scroll), and can be dragged by the strip along its top edge.
 * Esc closes it (only it), Tab stays in it.
 */
export function PropertyPanel({ title, beside, anchor, onClose, children, footer, header = true, top: above }: PropertyPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  // One panel at a time (the owner's call): opening, it closes the others, but not the one it was
  // opened from, nor that one's (a color picker in a shadow's panel keeps the shadow's open).
  const parent = useContext(ParentPanel);
  const self = useRef<OpenPanel>({ close: () => {}, parent }).current;
  self.close = () => onClose(true);
  useLayoutEffect(() => {
    const from = new Set<OpenPanel>();
    for (let p = parent; p; p = p.parent) from.add(p);
    for (const other of [...openPanels]) if (!from.has(other)) other.close();
    openPanels.add(self);
    return () => void openPanels.delete(self);
  }, []);
  // The dialog's panel layer, where it's drawn (null outside a dialog: here); found before it's first painted.
  const spot = useRef<HTMLSpanElement>(null);
  const [layer, setLayer] = useState<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (layer !== undefined) return;
    setLayer(spot.current?.closest(".page-anchor")?.querySelector(":scope > .panel-layer") ?? null);
  });
  const [height, setHeight] = useState(0);
  // From the panel's top to its title's middle: what's level with the row's middle.
  const [titleMiddle, setTitleMiddle] = useState(0);
  // Dragged this far from where it opens.
  const [moved, setMoved] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);
  // Where it is before the drag, on screen (set each render): the drag stays within the window from there.
  const baseRef = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useLayoutEffect(() => {
    const panel = ref.current;
    const h = panel?.offsetHeight ?? 0;
    if (h !== height) setHeight(h);
    const title = panel?.querySelector(".panel-title")?.getBoundingClientRect();
    const middle = panel && title ? title.top + title.height / 2 - panel.getBoundingClientRect().top : 0;
    if (Math.abs(middle - titleMiddle) > 0.5) setTitleMiddle(middle);
  });
  // The dialog moves with the page's scroll and the window, and its row with the dialog's list: so does the panel.
  // The list scrolls in Pilot's shadow root, whose scroll events don't reach the window.
  // (Once it's drawn: the first render only finds where, see `spot`.)
  useEffect(() => {
    if (layer === undefined) return;
    const root = ref.current?.getRootNode();
    const shadow = root instanceof ShadowRoot ? root : null;
    window.addEventListener("scroll", redraw, true);
    shadow?.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    return () => {
      window.removeEventListener("scroll", redraw, true);
      shadow?.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
    };
  }, [layer]);
  // Open: the first field has the focus, unless one in it took it already (Transform's panel, opened on the row a
  // search named: translate's Y for `translate-y`).
  useEffect(() => {
    if (layer === undefined) return;
    const active = (ref.current?.getRootNode() as ShadowRoot | Document | undefined)?.activeElement;
    if (active && ref.current?.contains(active)) return;
    ref.current?.querySelector<HTMLElement>(`.panel-rows ${FOCUSABLE}`)?.focus();
  }, [layer]);

  const box = beside();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const row = anchor?.() ?? null;
  let left = box ? (box.right - OVERLAP + WIDTH <= vw - EDGE ? box.right - OVERLAP : box.left + OVERLAP - WIDTH) : vw - EDGE - WIDTH;
  // By the row: its title level with the row's label; without a header, its top level with the row's.
  let top = row ? (header ? row.top + row.height / 2 - titleMiddle : row.top) : box ? box.top : EDGE;
  const [left0, top0] = [left, top];
  // On screen, then the drag, then on screen again: a row scrolled out of the window holds the panel at
  // the edge, and a drag from there must move it at once (added before, it went into the part held off).
  const onScreenX = (x: number) => Math.min(Math.max(EDGE, x), vw - EDGE - WIDTH);
  const onScreenY = (y: number) => Math.min(Math.max(EDGE, y), Math.max(EDGE, vh - EDGE - height));
  const base = { x: onScreenX(left), y: onScreenY(top) };
  baseRef.current = base;
  const wanted = { x: base.x + moved.x, y: base.y + moved.y };
  left = onScreenX(wanted.x);
  top = onScreenY(wanted.y);
  // Drawn in the page, in the dialog's PageAnchor (a portal to its panel layer): the browser scrolls it with
  // the page, no lag. Its spot is worked out in the window, then taken from the anchor's. Fixed instead while
  // it's held on screen (the row or the dialog scrolled out of the window), as the dialog is: in the page it
  // would go with the scroll, then jump back.
  const held = left !== wanted.x || top !== wanted.y || base.x !== left0 || base.y !== top0;
  const page = layer?.parentElement?.hasAttribute("data-page") ? layer.parentElement : null;
  const origin = page && !held ? page.getBoundingClientRect() : { left: 0, top: 0 };

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
    if (!d) return;
    // No further than the window's edges: what's dragged past them would have to be dragged back first.
    const { x, y } = baseRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = Math.min(Math.max(EDGE - x, d.from.x + e.clientX - d.x), vw - EDGE - WIDTH - x);
    const dy = Math.min(Math.max(EDGE - y, d.from.y + e.clientY - d.y), Math.max(EDGE, vh - EDGE - height) - y);
    setMoved({ x: dx, y: dy });
  };
  const onDragEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  const panel = (
    <div
      ref={ref}
      class="property-panel"
      role="dialog"
      aria-label={title}
      style={{ position: page && !held ? "absolute" : "fixed", left: px(left - origin.left), top: px(top - origin.top) }}
      data-dragging={dragging || undefined}
      data-headerless={header ? undefined : ""}
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
      {header && (
        <div class="panel-header">
          <span class="panel-title">{title}</span>
          <button type="button" class="panel-close" aria-label={`Close ${title}`} onClick={() => onClose()}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {above}
      <div class="panel-rows">
        <ParentPanel.Provider value={self}>{children}</ParentPanel.Provider>
      </div>
      {footer && (
        <footer class="footer" aria-live="polite">
          {footer}
        </footer>
      )}
    </div>
  );
  // Where it's found first (`spot`): then drawn in the dialog's panel layer, or right here outside a dialog.
  if (layer === undefined) return <span ref={spot} hidden />;
  return layer ? createPortal(panel, layer) : panel;
}
