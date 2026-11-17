import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import { type DomRow, ancestorsWithin, isSelectableRow, domRows } from "../../../dom/domTree.ts";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";

interface DomTreeProps {
  /** The selected element: its row is marked, and the tree opens down to it. */
  selected: Element | null;
  /** A row is hovered (null: none): its element is highlighted on the page. */
  onHover(element: Element | null): void;
  /** A row was picked (clicked, or reached with the arrow keys): select its element. */
  onSelect(element: Element): void;
  onClose(): void;
}

/** The panel's width and its distance from the window's edges, in px (DomTree.css). */
const WIDTH = 240;
const EDGE = 8;
/** The shortest the panel can be resized to: the header and a few rows. */
export const MIN_HEIGHT = 120;

type Spot = { left: number; top: number };

/**
 * Kept while the page is open, so reopening the panel puts it back as it
 * was left: where it was dragged (null: not dragged, centered again) and the
 * height it was resized to (null: not resized, as tall as its rows).
 */
const remembered: { spot: Spot | null; maxHeight: number | null } = { spot: null, maxHeight: null };

/**
 * Where the panel is drawn: its spot (or, with none, 8px from the left edge
 * and centered top to bottom), kept on screen, 8px from the window's edges.
 */
export function panelPosition(spot: Spot | null, height: number, viewport: { width: number; height: number }): Spot {
  const want = spot ?? { left: EDGE, top: Math.round((viewport.height - height) / 2) };
  return {
    left: Math.max(EDGE, Math.min(want.left, viewport.width - WIDTH - EDGE)),
    top: Math.max(EDGE, Math.min(want.top, viewport.height - height - EDGE)),
  };
}

/** A stable key per element, for the rows. */
const keys = new WeakMap<Element, number>();
let nextKey = 1;
const keyOf = (el: Element, pseudo = "") => {
  let k = keys.get(el);
  if (!k) keys.set(el, (k = nextKey++));
  return `${k}${pseudo}`;
};

/**
 * The DOM tree: the page's elements as a tree (dom/domTree.ts), to select
 * any of them, wherever they are: overlapped, zero-size, under an ::after.
 * Docked to the left, full height. Placeholder look, pending the design.
 * - Opens down to the selection (its ancestors expanded, its children one
 *   level open), and follows it: selecting on the page moves the tree too.
 * - Hovering a row highlights its element on the page; clicking it selects it.
 * - Keys, with focus in the panel: ↑/↓ select the previous/next row, → opens
 *   a row (or goes to its first child), ← closes it (or goes to its parent),
 *   Esc closes the panel. Focus stays in the panel while moving.
 * - ::before / ::after show as rows of their own (what may be covering
 *   things), not selectable: changes are for elements.
 * The tree updates as the page changes (a MutationObserver on the body).
 */
export function DomTree({ selected, onHover, onSelect, onClose }: DomTreeProps) {
  const root = document.body;
  // Open down to the selection from the first render, so the panel opens
  // centered on its real height (and the effect below keeps it following).
  const [expanded, setExpanded] = useState<Set<Element>>(() =>
    selected ? new Set([...ancestorsWithin(selected, root), selected]) : new Set(),
  );
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const listRef = useRef<HTMLDivElement>(null);

  // Size and place. The panel is as tall as its rows, up to the height it
  // was resized to and the window's (8px from each edge); its rows scroll
  // beyond that. It opens 8px from the left edge, centered top to bottom.
  // Its top then stays put as rows open and close (the rows under the
  // pointer don't jump), and only moves up when growing would take it off
  // screen; that sticks, so shrinking keeps the top where it is, like the
  // property dialog.
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [height, setHeight] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(remembered.spot);
  const [maxHeight, setMaxHeight] = useState<number | null>(remembered.maxHeight);
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const position = panelPosition(spot, height, viewport);
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0;
    if (h !== height) setHeight(h);
    if (!h) return;
    // Fix the spot once measured: centered on the height it opens with, or
    // moved to stay on screen.
    const shown = panelPosition(spot, h, viewport);
    if (!spot || spot.left !== shown.left || spot.top !== shown.top) setSpot(shown);
  });
  const limit = Math.min(maxHeight ?? Number.POSITIVE_INFINITY, viewport.height - 2 * EDGE);

  // Dragging the strip along the top edge moves the panel, as the property
  // dialog's does, kept on screen. Dragging the bottom edge resizes it.
  const drag = useRef<{ x: number; y: number; from: Spot } | null>(null);
  const resize = useRef<{ y: number; from: number } | null>(null);
  const [dragging, setDragging] = useState<"move" | "resize" | null>(null);
  const capture = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragStart = (e: PointerEvent) => {
    if (e.button !== 0) return;
    capture(e);
    drag.current = { x: e.clientX, y: e.clientY, from: position };
    setDragging("move");
  };
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const moved = { left: d.from.left + e.clientX - d.x, top: d.from.top + e.clientY - d.y };
    // Kept on screen: store where it's actually drawn, so the next drag starts there.
    setSpot((remembered.spot = panelPosition(moved, height, viewport)));
  };
  const onResizeStart = (e: PointerEvent) => {
    if (e.button !== 0) return;
    capture(e);
    resize.current = { y: e.clientY, from: height };
    setDragging("resize");
  };
  const onResizeMove = (e: PointerEvent) => {
    const r = resize.current;
    if (!r) return;
    // Down to MIN_HEIGHT, and down to the window's bottom edge (less 8px).
    const room = viewport.height - EDGE - position.top;
    setMaxHeight((remembered.maxHeight = Math.round(Math.max(MIN_HEIGHT, Math.min(r.from + e.clientY - r.y, room)))));
  };
  const onDragEnd = () => {
    drag.current = null;
    resize.current = null;
    setDragging(null);
  };

  // Open down to the selection, and one level into it.
  useLayoutEffect(() => {
    if (!selected) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const el of ancestorsWithin(selected, root)) next.add(el);
      next.add(selected);
      return next;
    });
  }, [selected]);

  // The page changes (rows added, removed, moved): rebuild, once per frame.
  useEffect(() => {
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => refresh(0));
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const rows = domRows(root, expanded);
  const selectedIndex = rows.findIndex((r) => !r.pseudo && r.element === selected);

  // Keep the selected row in view, sideways too: its name, not the whole
  // row (rows are as wide as the longest, see the CSS).
  useLayoutEffect(() => {
    if (selectedIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"] .tag`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedIndex, selected]);

  const toggle = (element: Element, open: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(element);
      else next.delete(element);
      return next;
    });

  const selectRow = (row: DomRow | undefined) => {
    if (row && isSelectableRow(row)) onSelect(row.element);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const current = rows[selectedIndex];
    const step = (from: number, by: 1 | -1) => {
      for (let i = from + by; i >= 0 && i < rows.length; i += by) {
        if (isSelectableRow(rows[i] as DomRow)) return rows[i];
      }
      return undefined;
    };
    switch (e.key) {
      case "ArrowDown":
        selectRow(step(selectedIndex, 1));
        break;
      case "ArrowUp":
        selectRow(step(selectedIndex < 0 ? rows.length : selectedIndex, -1));
        break;
      case "ArrowRight":
        if (!current?.expandable) return;
        if (!current.expanded) toggle(current.element, true);
        else selectRow(step(selectedIndex, 1));
        break;
      case "ArrowLeft":
        if (current?.expanded) toggle(current.element, false);
        else if (current?.element.parentElement && current.element.parentElement !== root) onSelect(current.element.parentElement);
        break;
      case "Escape":
        onClose();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  // Leaving the panel ends its hover highlight.
  useEffect(() => () => onHover(null), []);

  return (
    <div
      ref={panelRef}
      class="dom-tree"
      role="dialog"
      aria-label="DOM tree"
      style={{ left: px(position.left), top: px(position.top), maxHeight: px(limit) }}
      data-dragging={dragging || undefined}
    >
      {/* The drag strip: 12px along the top edge, over the header (it adds
          no height), with the grip as the visual clue. */}
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
      <div class="header">
        <span class="title">DOM tree</span>
        <button type="button" class="close" aria-label="Close the DOM tree" title="Close (Alt+D)" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div class="frame">
        <div
          class="rows"
          ref={listRef}
          role="tree"
          tabIndex={0}
          aria-label="Page elements"
          onKeyDown={onKeyDown}
          onPointerLeave={() => onHover(null)}
        >
          {rows.map((row, index) => (
            <div
              key={keyOf(row.element, row.pseudo)}
              class="row"
              role="treeitem"
              aria-level={row.depth + 1}
              aria-expanded={row.expandable ? row.expanded : undefined}
              aria-selected={index === selectedIndex}
              data-index={index}
              data-pseudo={row.pseudo ? "" : undefined}
              style={{ paddingLeft: px(8 + row.depth * 12) }}
              onPointerEnter={() => onHover(row.element)}
              onClick={() => selectRow(row)}
            >
              <span
                class="toggle"
                data-open={row.expanded || undefined}
                aria-hidden="true"
                onClick={(e) => {
                  if (!row.expandable) return;
                  e.stopPropagation();
                  toggle(row.element, !row.expanded);
                }}
              >
                {row.expandable && <Icon name="chevron-down" />}
              </span>
              <span class="label">
                <span class="tag">{row.tag}</span>
                {row.identifiers && <span class="identifiers">{row.identifiers}</span>}
                {row.details && <span class="details">({row.details})</span>}
                {row.text && <span class="text">{row.text}</span>}
              </span>
            </div>
          ))}
        </div>
        {/* Rows fade out at the list's top and bottom edges as they scroll, like
            the property dialog's list. Below the scroll thumbs. */}
        <div class="fade" data-edge="top" aria-hidden="true" />
        <div class="fade" data-edge="bottom" aria-hidden="true" />
        <ScrollThumb target={listRef} />
        <ScrollThumb target={listRef} axis="x" />
      </div>
      {/* The resize strip: 6px along the bottom edge (it adds no height). */}
      <div
        class="resize-handle"
        aria-hidden="true"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      />
    </div>
  );
}
