import type { WidthRange } from "@pilot/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { pageBreakpoints } from "../../../dom/breakpoints.ts";
import { inWidths } from "../../../edits/widths.ts";
import { px } from "../../px.ts";

/** How long the bar stays after the window's last resize, in ms. */
const RESIZE_LINGER = 800;

interface ViewportWidthProps {
  /** The window's width now (useViewportWidth). */
  width: number;
  /** The width chip, to mark the button when the window is outside its range. */
  widths: WidthRange | null;
  /**
   * The width or a breakpoint was clicked: `shift` when Shift was held (the
   * width as the range's upper end).
   */
  onPick(width: number, shift: boolean): void;
}

/**
 * The viewport width, hidden until needed: an invisible strip along the top
 * of the window. Hovering it, or resizing the window, shows a bar with a ruler
 * (ticks every 10px, longer every 50px), the page's breakpoints on it (see
 * pageBreakpoints), and the window's width as a button at the right end.
 * Clicking the width or a breakpoint sets the width chip (see clickWidth):
 * `from` that width, or with Shift `to` it. A breakpoint is drawn over the
 * width button where they meet.
 */
export function ViewportWidth({ width, widths, onPick }: ViewportWidthProps) {
  // Shown while the window is being resized (not on the first render).
  const [resizing, setResizing] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setResizing(true);
    const timer = setTimeout(() => setResizing(false), RESIZE_LINGER);
    return () => clearTimeout(timer);
  }, [width]);

  // Read again each time the bar shows (hover, resize), so it follows the
  // page's CSS as it changes (hot reload).
  const [breakpoints, setBreakpoints] = useState<number[]>(() => pageBreakpoints());
  const refresh = () => {
    const next = pageBreakpoints();
    setBreakpoints((current) => (current.join() === next.join() ? current : next));
  };
  useEffect(() => {
    if (resizing) refresh();
  }, [resizing]);

  const pick = (value: number) => ({
    title: `Click: changes from ${value}px. Shift+click: to ${value}px.`,
    // Keep focus where it is (the search), so typing goes on after a click.
    onMouseDown: (e: MouseEvent) => e.preventDefault(),
    onClick: (e: MouseEvent) => onPick(value, e.shiftKey),
  });

  return (
    <div class="viewport-width" data-resizing={resizing || undefined} onPointerEnter={refresh}>
      <div class="bar">
        <div class="ticks" />
        <button type="button" class="width" data-outside={!inWidths(widths, width) || undefined} {...pick(width)}>
          {width}
        </button>
        {breakpoints
          .filter((b) => b < width)
          .map((b) => (
            // Centered on its tick (the 1px line at b: its center is half a pixel in).
            <button key={b} type="button" class="breakpoint" style={{ left: px(b + 0.5) }} {...pick(b)}>
              {b}
            </button>
          ))}
      </div>
    </div>
  );
}
