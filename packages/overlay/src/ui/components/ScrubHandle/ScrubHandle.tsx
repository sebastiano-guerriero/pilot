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
   * whole drag, so it's undone in one step. Returns how many of those steps
   * are past a limit the value stops at (0, or a percent's 100), counted
   * from where it got there and negative below a minimum: let go there, the
   * wheel springs back a little (`recoil()`).
   */
  onScrub(steps: number, gesture: object): number | void;
  /**
   * The field's value as an angle, in degrees, when it is one: the handle is
   * then a dial instead of the wheel (DIAL), turned to it. Drags the same way.
   */
  degrees?: number | null;
}

/** An angle's text in degrees (`200deg`, `0.5turn`, `1rad`, `100grad`); null for anything else. */
export function degreesOf(text: string): number | null {
  const m = /^(-?\d*\.?\d+)(deg|turn|rad|grad)$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] as string).toLowerCase();
  return unit === "deg" ? n : unit === "turn" ? n * 360 : unit === "rad" ? (n * 180) / Math.PI : n * 0.9;
}

/**
 * The dial (the owner's design): a ring (contrast-high at 20%) and a tick
 * at the top, 16×16. The tick turns to the angle; an accent arc on the ring
 * fills from the top to it (clockwise, or back for a negative angle), a
 * whole ring from 360 on.
 */
function Dial({ degrees }: { degrees: number }) {
  const R = 5.5;
  const sweep = Math.abs(degrees) >= 360 ? Math.sign(degrees) * 360 : degrees;
  const end = (sweep * Math.PI) / 180;
  const x = 8 + R * Math.sin(end);
  const y = 8 - R * Math.cos(end);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r={R} stroke="var(--plt-color-contrast-high)" stroke-opacity="0.2" />
      {Math.abs(sweep) >= 360 ? (
        <circle cx="8" cy="8" r={R} stroke="var(--plt-color-accent)" />
      ) : (
        sweep !== 0 && (
          <path
            d={`M8 ${8 - R}A${R} ${R} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${x} ${y}`}
            stroke="var(--plt-color-accent)"
          />
        )
      )}
      <path d="M8 6V4.5" stroke="var(--plt-color-contrast-high)" stroke-linecap="round" transform={`rotate(${degrees} 8 8)`} />
    </svg>
  );
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

/** The most the wheel springs back when let go past a limit (deg): a line and a half. */
const MAX_RECOIL = SPACING * 1.5;
/** How quickly the spring back stops growing with the pull: iOS's rubber band at the end of a list. */
const RECOIL_STIFFNESS = 0.55;

/**
 * How far the wheel springs back (deg) when let go `px` past a limit
 * (signed, the pull's way): about half the pull after a nudge, then less
 * and less of it, never more than MAX_RECOIL. So a little pull comes back a
 * little, and a long one doesn't spin the wheel all the way back.
 */
export function recoil(px: number): number {
  const pulled = Math.abs(px) * DEG_PER_PX;
  return Math.sign(px) * MAX_RECOIL * (1 - 1 / ((pulled * RECOIL_STIFFNESS) / MAX_RECOIL + 1));
}

/** How long the spring back takes (ms): longer from further, within these. */
function springDuration(deg: number): number {
  return Math.min(420, 180 + Math.abs(deg) * 7);
}

/** Back home with a small overshoot, like something let go of (easeOutBack). */
function springEase(t: number): number {
  const s = 1.4;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/** How long the wheel takes to settle on its nearest line when let go (ms): at most half a line, so short. */
const SETTLE_DURATION = 120;

/** Into place without overshoot (easeOutCubic): a settle, not a spring. */
function settleEase(t: number): number {
  return 1 - (1 - t) ** 3;
}

function reducedMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * A drag handle that changes a field's value, drawn as a spinning wheel: drag
 * up to increase, down to decrease, one step per pixel (Shift for ×10). The
 * cursor is the vertical resize one. 8×16px, placed 8px from the field's
 * right edge, so it lines up with a select's chevron; its target reaches the
 * field's right edge. Lines are drawn in currentColor. For an angle
 * (`degrees`), it's a dial instead: 16×16, 4px from the right edge.
 */
export function ScrubHandle({ onStart, onScrub, degrees }: ScrubHandleProps) {
  const id = useId();
  const [angle, setAngle] = useState(0);
  // What's drawn is `turn + band`: the drum's turn (following the pointer),
  // and, let go past a limit, how far it still is from where it springs back
  // to (going to 0).
  const turn = useRef(0);
  const band = useRef(0);
  const spring = useRef<number | null>(null);
  const paint = () => setAngle(turn.current + band.current);
  // The latest callbacks, for the window listeners of an ongoing drag.
  const latest = useRef({ onStart, onScrub });
  latest.current = { onStart, onScrub };
  const stop = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stop.current?.();
      if (spring.current !== null) cancelAnimationFrame(spring.current);
    },
    [],
  );

  const stopSpring = () => {
    if (spring.current !== null) cancelAnimationFrame(spring.current);
    spring.current = null;
  };
  /**
   * The band goes to 0: the wheel moves to `turn`. Past a limit it springs
   * back (springEase, overshooting a little); otherwise it settles on its
   * nearest line (settleEase, short).
   */
  const springBack = (kind: "spring" | "settle" = "spring") => {
    stopSpring();
    const from = band.current;
    if (!from || reducedMotion() || typeof requestAnimationFrame !== "function") {
      band.current = 0;
      return paint();
    }
    const duration = kind === "spring" ? springDuration(from) : SETTLE_DURATION;
    const ease = kind === "spring" ? springEase : settleEase;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      band.current = from * (1 - ease(t));
      paint();
      spring.current = t < 1 ? requestAnimationFrame(frame) : null;
    };
    spring.current = requestAnimationFrame(frame);
  };

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
    // A spring still going: the drag picks the wheel up where it is.
    stopSpring();
    turn.current += band.current;
    band.current = 0;
    const pointer = e.pointerId;
    const startY = e.clientY;
    const gesture = {};
    let steps = 0;
    const from = turn.current;
    // How far past a limit the drag is, in px (0: not at one).
    let past = 0;

    const move = (m: PointerEvent) => {
      if (m.pointerId !== pointer) return;
      const dy = startY - m.clientY; // up is positive
      const scale = m.shiftKey ? 10 : 1;
      const next = Math.trunc(dy / PX_PER_STEP) * scale;
      if (next !== steps) {
        steps = next;
        const overflow = latest.current.onScrub(steps, gesture);
        past = typeof overflow === "number" ? (overflow * PX_PER_STEP) / scale : 0;
      }
      // The drum follows the pointer, past a limit too: no resistance.
      turn.current = from + dy * DEG_PER_PX;
      paint();
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
      // Come to rest on a line, so lines land where they were designed. Let
      // go past a limit, the drum springs back against the pull, by
      // `recoil()`: to the line nearest that, if it's on the way back, else
      // just there (a nudge: the nearest line could be the pull's way, or a
      // whole line further). Otherwise it settles on the nearest line, in a
      // short ease (it's at most half a line away).
      let rest = Math.round(turn.current / SPACING) * SPACING;
      if (past) {
        const shown = turn.current;
        const target = shown - recoil(past);
        rest = Math.round(target / SPACING) * SPACING;
        if ((rest - shown) * Math.sign(target - shown) <= 0) rest = target;
        band.current = shown - rest;
        turn.current = rest;
        springBack();
      } else {
        band.current = turn.current - rest;
        turn.current = rest;
        springBack("settle");
      }
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
    <span class="scrub-handle" aria-hidden="true" data-dial={degrees != null ? "" : undefined} onPointerDown={onPointerDown}>
      {degrees != null ? (
        <Dial degrees={degrees} />
      ) : (
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
      )}
    </span>
  );
}
