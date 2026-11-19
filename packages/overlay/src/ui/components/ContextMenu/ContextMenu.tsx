import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";

export interface MenuItem {
  label: string;
  onSelect(): void;
  disabled?: boolean;
}

interface ContextMenuProps {
  /** Where it was asked for (the pointer), in the window: its top-left corner, kept on screen. */
  x: number;
  y: number;
  items: MenuItem[];
  /** Closed: an item picked, Esc, Tab, or a click outside. */
  onClose(): void;
}

/** Its distance from the window's edges, in px, when it would go off screen. */
const EDGE = 8;

/**
 * A menu of actions at the pointer (the DOM tree's right-click). Keys: ↑/↓
 * move between items, Enter or Space picks one, Esc or Tab closes it; a
 * click outside closes it. It takes focus while open, and keys in it don't
 * reach what's behind it. Placeholder look, from PropertySelect's menu,
 * pending the design.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ left: x, top: y });
  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
  const [active, setActive] = useState(enabled[0] ?? -1);

  // Kept on screen: moved left or up by what would stick out.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setSpot({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    });
    menu.focus();
  }, [x, y]);

  // A click anywhere else closes it (Pilot's UI or the page).
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !e.composedPath().includes(ref.current)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const pick = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    onClose();
    item.onSelect();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const at = enabled.indexOf(active);
    switch (e.key) {
      case "ArrowDown":
        setActive(enabled[(at + 1) % enabled.length] ?? -1);
        break;
      case "ArrowUp":
        setActive(enabled[(at - 1 + enabled.length) % enabled.length] ?? -1);
        break;
      case "Enter":
      case " ":
        pick(active);
        break;
      case "Escape":
      case "Tab":
        onClose();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      class="context-menu"
      role="menu"
      tabIndex={-1}
      style={{ left: px(spot.left), top: px(spot.top) }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          class="item"
          role="menuitem"
          aria-disabled={item.disabled || undefined}
          data-active={index === active || undefined}
          onPointerEnter={() => !item.disabled && setActive(index)}
          onClick={() => pick(index)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
