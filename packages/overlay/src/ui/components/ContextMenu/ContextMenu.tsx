import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";

export interface ContextMenuItem {
  label: string;
  /** Nothing to do now (nothing copied to paste): shown dimmed, not picked. */
  disabled?: boolean;
  onSelect(): void;
}

interface ContextMenuProps {
  /** Where it was opened: the pointer, in viewport px. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** Closed: picked, Esc, a click elsewhere, a scroll. */
  onClose(): void;
}

/** The closest it gets to the window's edges. */
const EDGE = 8;

/**
 * A menu at the pointer (a right-click on a property's name): actions, the
 * variables list's look (TokenMenu.css), placeholder pending the design.
 * ↑/↓ move, Enter picks, Esc closes (only it); the focus goes back where it
 * was.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState(-1);
  const enabled = items.flatMap((item, i) => (item.disabled ? [] : [i]));

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && (el.offsetWidth !== size.width || el.offsetHeight !== size.height)) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  });
  useEffect(() => {
    const before = (ref.current?.getRootNode() as ShadowRoot | Document | undefined)?.activeElement as HTMLElement | null;
    ref.current?.focus();
    // A click anywhere else, or a scroll, closes it.
    const away = (e: Event) => {
      if (!ref.current || !e.composedPath().includes(ref.current)) onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      if (before?.isConnected) before.focus();
    };
  }, []);

  const pick = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    onClose();
    item.onSelect();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && enabled.length) {
      e.preventDefault();
      const at = enabled.indexOf(active);
      const next = at < 0 ? (e.key === "ArrowDown" ? 0 : enabled.length - 1) : (at + (e.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      setActive(enabled[next] as number);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      e.stopPropagation();
      pick(active);
    } else if (e.key === "Tab") {
      e.preventDefault();
      onClose();
    }
  };

  const left = Math.max(EDGE, Math.min(x, window.innerWidth - EDGE - size.width));
  const top = y + size.height > window.innerHeight - EDGE ? Math.max(EDGE, y - size.height) : y;
  return (
    <div
      ref={ref}
      class="context-menu"
      role="menu"
      tabIndex={-1}
      style={{ left: px(left), top: px(top) }}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          class="context-item"
          role="menuitem"
          aria-disabled={item.disabled || undefined}
          data-active={i === active || undefined}
          onPointerMove={() => !item.disabled && setActive(i)}
          onPointerLeave={() => setActive(-1)}
          onClick={() => pick(i)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
