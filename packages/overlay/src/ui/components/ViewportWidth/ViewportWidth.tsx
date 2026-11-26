import { describeWidths } from "@pilot/protocol";
import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import { type RGBA, colorBehind, darkTextOn, over } from "../../../dom/backdrop.ts";
import { pageBreakpoints } from "../../../dom/breakpoints.ts";
import { type Span, sameKey } from "../../../edits/reach.ts";
import { type WidthChip, inWidths } from "../../../edits/widths.ts";
import { px } from "../../px.ts";
import type { Reach } from "../PropertyDialog/PropertyDialog.tsx";

/** The grey bars' layers, top first (ViewportWidth.css): black at 20% over white at 40%. */
const GREY_BAR: RGBA[] = [
  [0, 0, 0, 0.2],
  [255, 255, 255, 0.4],
];

/** Where the labels' middle is with the bars shown (ViewportWidth.css: 26px down, 20px tall). */
const LABEL_MIDDLE = 36;

/** How long the bars stay after the property is no longer in use: their way out (ViewportWidth.css), in ms. */
const LEAVE_MS = 150;

/** How long the bar stays after the window's last resize, in ms. */
const RESIZE_LINGER = 800;

interface ViewportWidthProps {
  /** The window's width now (useViewportWidth). */
  width: number;
  /** The width chip, to mark the button when the window is outside its range. */
  widths: WidthChip | null;
  /**
   * The property in use, where its values apply among the widths: shown, as
   * bars under the ruler, while it's there (PropertyDialog's onReach).
   */
  reach?: Reach | null;
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
 *
 * While a property is in use and has rules for some widths (`reach`), the
 * bar shows too, with bars under the breakpoints: where each of its values
 * applies (edits/reach.ts spansOf), green where the edits go, grey for its
 * other rules, none where nothing declares it. Where a value applies, not
 * how its media query is written: `md:pt-4` before `lg:pt-12` is md to lg
 * (the owner's design, 2026-11-26). The ruler is the window, so a bar past
 * its width is cut at the right edge. Then the ruler shows only the widths
 * where the bars meet, and no window width: the page's other breakpoints
 * change nothing for this property, and the green bar running to the right
 * edge already says "here". Those between two grey bars are dimmed: only the
 * green bar's ends bound the edit. Hovering it, or resizing, shows it all
 * again, at full strength.
 */
export function ViewportWidth({ width, widths, reach = null, onPick }: ViewportWidthProps) {
  // The bars stay a moment after the property is no longer in use, so they leave as the ruler does.
  // Kept in the same render (not an effect's), so they never blink out before fading.
  const last = useRef<Reach | null>(reach);
  const [, gone] = useReducer((n: number) => n + 1, 0);
  if (reach) last.current = reach;
  const bars = reach ?? last.current;
  useEffect(() => {
    if (reach) return;
    const timer = setTimeout(() => {
      last.current = null;
      gone(0);
    }, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [reach]);

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
    if (resizing || reach) refresh();
  }, [resizing, !!reach]);

  const pick = (value: number) => ({
    title: `Click: changes from ${value}px. Shift+click: to ${value}px.`,
    // Keep focus where it is (the search), so typing goes on after a click.
    onMouseDown: (e: MouseEvent) => e.preventDefault(),
    onClick: (e: MouseEvent) => onPick(value, e.shiftKey),
  });

  // Where the bars meet: the widths where the property's value changes. While it's in use, the only
  // breakpoints shown (the page's others change nothing for it), Pilot's own too (`from-500`).
  const edges = bars ? bars.spans.map((s) => s.min).filter((b) => b > 0) : [];
  // An end of the green bar (where the edit's reach starts or stops), or between two others: dimmed.
  const greenEdge = (b: number) =>
    !!bars && bars.spans.some((s, i) => isTarget(s, bars) && (s.min === b || bars.spans[i + 1]?.min === b));
  const labels = [...new Set([...breakpoints, ...edges])].sort((a, b) => a - b);

  // The dimmed labels' text, dark or light for the page under them (their background is translucent, as
  // the grey bars'): read where each one is, again as the page scrolls under them. None: can't tell
  // (an image, a gradient), white with a ring.
  const root = useRef<HTMLDivElement>(null);
  const dimmed = bars ? edges.filter((b) => b < width && !greenEdge(b)) : [];
  const dimmedKey = dimmed.join();
  const [tones, setTones] = useState<Record<number, "dark" | "light">>({});
  useEffect(() => {
    if (!dimmedKey) return;
    const node = root.current?.getRootNode();
    const host = node instanceof ShadowRoot ? node.host : null;
    const read = () => {
      const next: Record<number, "dark" | "light"> = {};
      for (const b of dimmed) {
        const page = colorBehind(b + 0.5, LABEL_MIDDLE, host);
        if (page) next[b] = darkTextOn(over(page, GREY_BAR)) ? "dark" : "light";
      }
      setTones((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    read();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [dimmedKey, width]);

  return (
    <div
      ref={root}
      class="viewport-width"
      data-resizing={resizing || undefined}
      data-reach={reach ? "" : undefined}
      data-bars={bars ? "" : undefined}
      onPointerEnter={refresh}
    >
      <div class="bar">
        <div class="ticks" />
        {bars && (
          // Keyed by the property: another property in use glows the green bar again.
          <div key={bars.property} class="reach" aria-hidden="true">
            {bars.spans
              .filter((s) => s.min < width && (s.value !== "" || isTarget(s, bars)))
              .map((s) => (
                <div
                  key={`${s.min}`}
                  class="span"
                  data-target={isTarget(s, bars) || undefined}
                  data-cut={s.max === undefined || s.max >= width || undefined}
                  style={spanBox(s, width)}
                  title={`${spanWidths(s)}: ${bars.property} ${s.value || "not set"}`}
                />
              ))}
          </div>
        )}
        <button type="button" class="width" data-outside={!inWidths(widths, width) || undefined} {...pick(width)}>
          {width}
        </button>
        {labels
          .filter((b) => b < width)
          .map((b) => (
            // Centered on its tick (the 1px line at b: its center is half a pixel in).
            <button
              key={b}
              type="button"
              class="breakpoint"
              data-edge={edges.includes(b) ? (greenEdge(b) ? "target" : "other") : undefined}
              data-tone={tones[b]}
              style={{ left: px(b + 0.5) }}
              {...pick(b)}
            >
              {b}
            </button>
          ))}
      </div>
    </div>
  );
}

/** The span is where the edits go: its value is declared where they're recorded (All widths: everywhere). */
function isTarget(span: Span, reach: Reach): boolean {
  return reach.target === "all" || sameKey(span.key, reach.target);
}

/** `0–767px`, `from 1024px`. */
function spanWidths(span: Span): string {
  return span.min === 0 && span.max === undefined ? "every width" : describeWidths({ ...(span.min > 0 && { min: span.min }), ...(span.max !== undefined && { max: span.max }) }).replace(/^to /, "0–");
}

/**
 * Where a span's bar is drawn. Width `w` is the pixel from `w` to `w + 1`, as
 * its tick (and a breakpoint's label is centered on it). Two bars meet in the
 * middle of the breakpoint between them: the next one starts a pixel after
 * the tick, leaving the tick's pixel as the 1px gap between them, which also
 * keeps two grey bars side by side apart. The first is 1px from the window's
 * left edge the same way. Cut at the window's width.
 */
function spanBox(span: Span, width: number): { left: string; width: string } {
  const left = span.min + 1;
  const right = Math.min(span.max === undefined ? width : span.max + 1, width);
  return { left: px(left), width: px(Math.max(0, right - left)) };
}
