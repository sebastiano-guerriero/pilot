import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { px } from "../../px.ts";

/** Space between the thumb and the ends of the scrolling area, in px. */
const INSET = 4;
/** The thumb never gets shorter than this, in px. */
const MIN_HEIGHT = 20;
/** How long the thumb stays visible after the last scroll, in ms. */
const LINGER = 800;

interface Scroll {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * The thumb's place along the scrolling area (px from its top), or null when
 * there's nothing to scroll. Its length is the visible share of the content,
 * at least MIN_HEIGHT; it runs INSET px from each end.
 */
export function thumbGeometry({ scrollTop, scrollHeight, clientHeight }: Scroll): { top: number; height: number } | null {
  const range = scrollHeight - clientHeight;
  if (range < 1) return null;
  const track = clientHeight - 2 * INSET;
  const height = Math.max(MIN_HEIGHT, (track * clientHeight) / scrollHeight);
  const progress = Math.min(1, Math.max(0, scrollTop / range));
  return { top: INSET + (track - height) * progress, height };
}

interface ScrollThumbProps {
  /** The element that scrolls (its native scrollbar hidden in its own CSS). */
  target: RefObject<HTMLElement | null>;
  /**
   * `y` (default): up and down, over the right edge. `x`: sideways, over the
   * bottom edge (the same measures, along the width: `thumbGeometry` reads
   * them as top / height).
   */
  axis?: "x" | "y";
}

/**
 * A minimal scrollbar for `target`: just a thumb, drawn over its right edge
 * (or its bottom edge, `axis: "x"`)
 * (absolutely positioned in the target's positioned parent), so it takes no
 * room and the layout is the same in every browser, whatever its own
 * scrollbars do. It shows while the pointer is over the area or it's
 * scrolling, and can be dragged. Wheel, trackpad and keys scroll the target
 * itself, as usual.
 */
export function ScrollThumb({ target, axis = "y" }: ScrollThumbProps) {
  const x = axis === "x";
  const [scroll, setScroll] = useState<Scroll>({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const [hovered, setHovered] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const linger = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Measure on scroll, and whenever the area or its content changes size
  // (an editor growing, rows added or removed).
  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return;
    const measure = () => {
      const next = x
        ? { scrollTop: el.scrollLeft, scrollHeight: el.scrollWidth, clientHeight: el.clientWidth }
        : { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
      setScroll((s) =>
        s.scrollTop === next.scrollTop && s.scrollHeight === next.scrollHeight && s.clientHeight === next.clientHeight ? s : next,
      );
    };
    const onScroll = () => {
      measure();
      setScrolling(true);
      clearTimeout(linger.current);
      linger.current = setTimeout(() => setScrolling(false), LINGER);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    const area = el.parentElement;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    area?.addEventListener("pointerenter", enter);
    area?.addEventListener("pointerleave", leave);
    let resize: ResizeObserver | undefined;
    let children: MutationObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resize = new ResizeObserver(measure);
      const observeAll = () => {
        resize?.disconnect();
        resize?.observe(el);
        for (const child of el.children) resize?.observe(child);
      };
      observeAll();
      if (typeof MutationObserver !== "undefined") {
        children = new MutationObserver(() => {
          observeAll();
          measure();
        });
        children.observe(el, { childList: true });
      }
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      area?.removeEventListener("pointerenter", enter);
      area?.removeEventListener("pointerleave", leave);
      resize?.disconnect();
      children?.disconnect();
      clearTimeout(linger.current);
    };
  }, [target.current, axis]);
  useEffect(() => () => clearTimeout(linger.current), []);

  // Dragging the thumb scrolls the area by the same share of its range.
  const drag = useRef<{ y: number; scrollTop: number } | null>(null);
  const geometry = thumbGeometry(scroll);
  if (!geometry) return null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { y: x ? e.clientX : e.clientY, scrollTop: scroll.scrollTop };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent) => {
    const el = target.current;
    const d = drag.current;
    if (!el || !d) return;
    const track = scroll.clientHeight - 2 * INSET - geometry.height;
    const range = scroll.scrollHeight - scroll.clientHeight;
    const at = d.scrollTop + (((x ? e.clientX : e.clientY) - d.y) * range) / track;
    if (track > 0) {
      if (x) el.scrollLeft = at;
      else el.scrollTop = at;
    }
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      class="scroll-thumb"
      aria-hidden="true"
      data-visible={hovered || scrolling || dragging ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      data-axis={axis}
      style={x ? { left: px(geometry.top), width: px(geometry.height) } : { top: px(geometry.top), height: px(geometry.height) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
