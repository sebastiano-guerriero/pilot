import { useRef } from "preact/hooks";

/** A cubic-bezier's handles: (x1, y1) from the start, (x2, y2) from the end. */
export type Handles = [number, number, number, number];

interface EasingGraphProps {
  /** The easing's value at progress x (0 → 1). */
  curve(x: number): number;
  /** A cubic-bezier's handles, to drag; none for a curve that isn't one (a spring). */
  handles?: Handles;
  /**
   * A handle dragged: the new handles, with the same `gesture` for the whole
   * drag (one undo step). x stays within 0–1 (CSS's rule); y may overshoot.
   */
  onHandles?(next: Handles, gesture: object): void;
  /** Accessible name: "transition easing curve". */
  label: string;
  /**
   * The values the square shows at least, bottom to top: a cubic-bezier's −0.25 to 1.25 (0 and 1 centered, a
   * quarter either side for overshoot); a spring's 0 to the most bounce's overshoot. It takes in more to fit.
   */
  range: [number, number];
  /** Dotted lines across, at these values: where the curve starts (0) and ends (1). */
  lines?: number[];
  /** More dotted lines across, every this much of the value, as a pattern behind `lines` (a spring's: 0.25). */
  grid?: number;
}

/** The drawing's size: a square as wide as a row's value area (the owner's, 2026-11-27). */
const SIZE = 128;
/** Room around what's drawn, the same on every side: for the handles' dots. */
const PAD = 12;

/**
 * An easing's curve, progress across and value up: a square as wide as a
 * row's value area, under it, on the + button's background (the owner's
 * design, 2026-11-27), that never changes size. It shows `range` at least,
 * and takes in more to fit the curve and its handles: an overshoot further
 * than that brings the 0 and 1 lines closer, and nothing is ever cut. For a
 * cubic-bezier, its two handles: lines from the curve's ends to dots that
 * drag (x kept within 0–1; y free: a drag maps the pointer with the scale it
 * started with, the square refitting as it goes; Shift puts a handle on the
 * 0 or 1 line, the nearer, and moves it along it).
 */
export function EasingGraph({ curve, handles, onHandles, label, range, lines = [], grid }: EasingGraphProps) {
  const svg = useRef<SVGSVGElement>(null);
  const samples = Array.from({ length: 121 }, (_, k) => [k / 120, curve(k / 120)] as const);
  const ys = [...samples.map(([, y]) => y), ...(handles ? [handles[1], handles[3]] : [])];
  const lo = Math.min(range[0], ...ys);
  const hi = Math.max(range[1], ...ys);
  const unit = (SIZE - 2 * PAD) / (hi - lo);
  const sx = (x: number) => PAD + x * (SIZE - 2 * PAD);
  const sy = (y: number) => PAD + (hi - y) * unit;
  const path = samples.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(" ");

  const drag = (which: 0 | 1) => (e: PointerEvent) => {
    if (!handles || !onHandles || !svg.current) return;
    e.preventDefault();
    const el = e.currentTarget as Element;
    // Captured, the drag follows the pointer out of the graph (a pointer that's no longer down can't be: no matter).
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    const gesture = {};
    const box = svg.current.getBoundingClientRect();
    // The scale the drag started with: the pointer's height is a value in it, wherever the square refits to.
    const top = hi;
    const scale = unit;
    const move = (ev: PointerEvent) => {
      const px = ((ev.clientX - box.left) / box.width) * SIZE;
      const py = ((ev.clientY - box.top) / box.height) * SIZE;
      const x = Math.min(1, Math.max(0, (px - PAD) / (SIZE - 2 * PAD)));
      const free = top - (py - PAD) / scale;
      // Shift: on the 0 or 1 line, the nearer (an ease's flat start or end), moving along it.
      const y = ev.shiftKey ? (free >= 0.5 ? 1 : 0) : free;
      const r = (n: number) => Math.round(n * 100) / 100;
      const next: Handles = which === 0 ? [r(x), r(y), handles[2], handles[3]] : [handles[0], handles[1], r(x), r(y)];
      onHandles(next, gesture);
    };
    const up = () => {
      el.removeEventListener("pointermove", move as EventListener);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move as EventListener);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div class="easing-graph">
      <svg ref={svg} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
        {grid &&
          Array.from({ length: Math.floor((hi - lo) / grid) + 1 }, (_, i) => Math.round((Math.ceil(lo / grid) + i) * grid * 1000) / 1000)
            .filter((v) => v <= hi && !lines.includes(v))
            .map((v) => <line key={`grid-${v}`} class="grid" x1={sx(0)} y1={sy(v)} x2={sx(1)} y2={sy(v)} />)}
        {lines.map((v) => (
          <line key={v} class="guide" x1={sx(0)} y1={sy(v)} x2={sx(1)} y2={sy(v)} />
        ))}
        {handles && (
          <>
            <line class="arm" x1={sx(0)} y1={sy(0)} x2={sx(handles[0])} y2={sy(handles[1])} />
            <line class="arm" x1={sx(1)} y1={sy(1)} x2={sx(handles[2])} y2={sy(handles[3])} />
          </>
        )}
        <path class="curve" d={path} />
        {handles &&
          ([0, 1] as const).map((which) => (
            <circle
              key={which}
              class="handle"
              cx={sx(handles[which * 2] as number)}
              cy={sy(handles[which * 2 + 1] as number)}
              r={4}
              onPointerDown={drag(which) as unknown as (e: PointerEvent) => void}
            />
          ))}
      </svg>
    </div>
  );
}
