import { useEffect, useId, useRef, useState } from "preact/hooks";

interface ScrubHandleProps {
  /**
   * A drag is about to start: get ready (e.g. remember the value it starts
   * from). Return false to refuse it (e.g. the value can't be stepped).
   */
  onStart(): boolean;
  /**
   * The drag moved: `steps` is the total from where it started (up is
   * positive), ×10 while Shift is held. The same `gesture` object for the
   * whole drag, so it's undone in one step.
   */
  onScrub(steps: number, gesture: object): void;
}

/** Drag distance (px) per step: the value moves with the pointer, as the wheel does. */
export const PX_PER_STEP = 1;

/**
 * The wheel: lines on a small drum seen edge-on, like the iOS timer picker.
 * Each line sits at an angle on the drum; its height on screen is
 * RADIUS × sin(angle), so lines bunch up toward the top and bottom edges as
 * the drum turns. At rest (angle 0) the lines are ~3px apart, as designed.
 */
const SIZE = { width: 8, height: 16 };
const CENTER = SIZE.height / 2;
const RADIUS = 8;
/** Angle between two lines (deg): RADIUS × sin(22°) ≈ 3px at the center. */
const SPACING = 22;
/** Lines past this angle get the edge blur. */
const BLUR_FROM = 35;
/** Drum rotation (deg) per px dragged: the center line follows the pointer. */
const DEG_PER_PX = SPACING / 3;

/**
 * A drag handle that changes a field's value, drawn as a spinning wheel: drag
 * up to increase, down to decrease, one step per pixel (Shift for ×10). The
 * cursor is the vertical resize one. 8×16px, placed 8px from the field's
 * right edge, so it lines up with a select's chevron; its target reaches the
 * field's right edge. Lines are drawn in currentColor.
 */
export function ScrubHandle({ onStart, onScrub }: ScrubHandleProps) {
  const id = useId();
  const [angle, setAngle] = useState(0);
  // The latest callbacks, for the window listeners of an ongoing drag.
  const latest = useRef({ onStart, onScrub });
  latest.current = { onStart, onScrub };
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  // The drag is followed on the window, not the handle: every move counts
  // wherever the pointer goes (off the handle, over the page), so the value
  // always follows the total distance from where the drag started, in either
  // direction. Pointer capture is also requested, for moves outside the window.
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || stop.current) return;
    e.preventDefault(); // don't move focus or select text
    if (!latest.current.onStart()) return;
    const handle = e.currentTarget as Element;
    try {
      handle.setPointerCapture?.(e.pointerId);
    } catch {
      // Not an active pointer (e.g. a synthetic event): the window listeners suffice.
    }
    const pointer = e.pointerId;
    const startY = e.clientY;
    const gesture = {};
    let steps = 0;

    const move = (m: PointerEvent) => {
      if (m.pointerId !== pointer) return;
      const dy = startY - m.clientY; // up is positive
      setAngle(dy * DEG_PER_PX);
      const next = Math.trunc(dy / PX_PER_STEP) * (m.shiftKey ? 10 : 1);
      if (next === steps) return;
      steps = next;
      latest.current.onScrub(steps, gesture);
    };
    const up = (u: PointerEvent) => {
      if (u.pointerId === pointer) stop.current?.();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    stop.current = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      stop.current = null;
      // Come to rest on a line, so lines land where they were designed.
      setAngle((a) => Math.round(a / SPACING) * SPACING);
    };
  };

  // Lines around the visible half of the drum, at `angle` + k × SPACING.
  const lines: Array<{ y: number; blur: boolean }> = [];
  const offset = ((angle % SPACING) + SPACING) % SPACING;
  for (let k = -5; k <= 5; k++) {
    const a = offset + k * SPACING;
    if (Math.abs(a) >= 88) continue;
    lines.push({ y: CENTER - RADIUS * Math.sin((a * Math.PI) / 180), blur: Math.abs(a) > BLUR_FROM });
  }

  return (
    <span class="scrub-handle" aria-hidden="true" onPointerDown={onPointerDown}>
      <svg width={SIZE.width} height={SIZE.height} viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} fill="none">
        <defs>
          {/* Fades the lines out toward the top and bottom edges. */}
          <linearGradient id={`${id}-fade`} x1="0" y1="1" x2="0" y2="15" gradientUnits="userSpaceOnUse">
            <stop stop-color="#fff" stop-opacity="0" />
            <stop offset="0.5" stop-color="#fff" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <mask id={`${id}-mask`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="1" width="8" height="14">
            <rect y="1" width="8" height="14" fill={`url(#${id}-fade)`} />
          </mask>
          {/* A little blur on the lines toward the edges, for depth. */}
          <filter id={`${id}-blur`} x="-1" y="-1" width="10" height="18" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="0.125" />
          </filter>
        </defs>
        <g mask={`url(#${id}-mask)`}>
          {lines.map((line) => (
            <path
              key={line.y}
              d={`M1.5 ${line.y}H6.5`}
              stroke="currentColor"
              stroke-linecap="round"
              filter={line.blur ? `url(#${id}-blur)` : undefined}
            />
          ))}
        </g>
      </svg>
    </span>
  );
}
