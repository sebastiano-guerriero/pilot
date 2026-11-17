import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import { type DomRow, ancestorsWithin, isSelectableRow, domRows } from "../../../dom/domTree.ts";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";

interface DomTreeProps {
  /** The selected element: its row is marked, and the tree opens down to it. */
  selected: Element | null;
  /** How the rows name elements (see PilotOptions.nameAttributes). */
  nameAttributes?: readonly string[];
  /** A row is hovered (null: none): its element is highlighted on the page. */
  onHover(element: Element | null): void;
  /** A row was picked (clicked, or reached with the arrow keys): select its element. */
  onSelect(element: Element): void;
  onClose(): void;
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
export function DomTree({ selected, nameAttributes, onHover, onSelect, onClose }: DomTreeProps) {
  const root = document.body;
  const [expanded, setExpanded] = useState<Set<Element>>(() => new Set());
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const listRef = useRef<HTMLDivElement>(null);

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

  const rows = domRows(root, expanded, nameAttributes);
  const selectedIndex = rows.findIndex((r) => !r.pseudo && r.element === selected);

  // Keep the selected row in view, sideways too: its name, not the whole
  // row (rows are as wide as the longest, see the CSS).
  useLayoutEffect(() => {
    if (selectedIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"] .name`)
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
    <div class="dom-tree" role="dialog" aria-label="DOM tree">
      <div class="header">
        <span class="title">DOM tree</span>
        <button type="button" class="close" aria-label="Close the DOM tree" title="Close (Alt+D)" onClick={onClose}>
          <Icon name="close-small" />
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
              <span class="name">{row.name}</span>
              {row.text && <span class="text">{row.text}</span>}
            </div>
          ))}
        </div>
        <ScrollThumb target={listRef} />
      </div>
    </div>
  );
}
