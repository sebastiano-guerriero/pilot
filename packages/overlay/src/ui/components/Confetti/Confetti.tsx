import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { px } from "../../px.ts";

/** One piece: where it starts on the button, how it's thrown, how it looks. */
export interface Piece {
  /** Start, in px from the burst's left edge (somewhere along the button). */
  x: number;
  /** Initial velocity, px/s (vy < 0 is up). */
  vx: number;
  vy: number;
  /** Turns over the whole flight, signed. */
  spin: number;
  shape: "strip" | "square" | "dot";
  color: "accent" | "high" | "higher";
}

/** How long a burst lasts, in ms. */
export const CONFETTI_MS = 1000;
/** Pieces per burst: enough to read as confetti, few enough to stay subtle. */
const COUNT = 18;
/** Gravity, px/s², and air drag, per second (horizontal drift slows down). */
const GRAVITY = 1100;
const DRAG = 2.2;
/** Keyframes per piece: the flight sampled, so the arc stays a curve. */
const STEPS = 16;

/**
 * The burst's pieces, thrown up from along the button in a cone (±50° off
 * vertical), mostly accent with some light ones. `random` is injectable for
 * tests.
 */
export function pieces(width: number, random: () => number = Math.random): Piece[] {
  return Array.from({ length: COUNT }, () => {
    const angle = ((random() - 0.5) * 100 * Math.PI) / 180;
    const speed = 260 + random() * 220;
    const pick = random();
    const shade = random();
    return {
      x: random() * width,
      vx: Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
      spin: (random() - 0.5) * 3,
      shape: pick < 0.5 ? "strip" : pick < 0.8 ? "square" : "dot",
      color: shade < 0.6 ? "accent" : shade < 0.85 ? "high" : "higher",
    };
  });
}

/** Where a piece is `t` seconds in: drag on the drift, gravity on the fall. */
export function flight(piece: Piece, t: number): { x: number; y: number } {
  return {
    x: (piece.vx * (1 - Math.exp(-DRAG * t))) / DRAG,
    y: piece.vy * t + (GRAVITY * t * t) / 2,
  };
}

interface ConfettiProps {
  /** The button it bursts from (viewport px). */
  from: { left: number; top: number; width: number; height: number };
  /** The burst is over: unmount it. */
  onDone(): void;
}

/**
 * A short confetti burst from a button (Mark as solved): small strips,
 * squares and dots thrown up from along it, arcing down and fading out over
 * a second. Rendered by App, not by the button's panel, since the panel
 * closes on that click. Nothing with reduced motion. Pointer events pass
 * through.
 */
export function Confetti({ from, onDone }: ConfettiProps) {
  const ref = useRef<HTMLDivElement>(null);
  const burst = useMemo(() => pieces(from.width), []);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const root = ref.current;
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!root || still || typeof root.animate !== "function") {
      done.current();
      return;
    }
    const seconds = CONFETTI_MS / 1000;
    const animations = [...root.children].map((child, i) => {
      const piece = burst[i] as Piece;
      const frames = Array.from({ length: STEPS + 1 }, (_, step) => {
        const k = step / STEPS;
        const { x, y } = flight(piece, k * seconds);
        return {
          transform: `translate(${px(x)}, ${px(y)}) rotate(${piece.spin * k}turn)`,
          // Full until 60% of the way, then fading out.
          opacity: k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4,
        };
      });
      return (child as HTMLElement).animate(frames, { duration: CONFETTI_MS, easing: "linear", fill: "forwards" });
    });
    let cancelled = false;
    Promise.all(animations.map((a) => a.finished))
      .catch(() => {})
      .then(() => {
        if (!cancelled) done.current();
      });
    return () => {
      cancelled = true;
      for (const a of animations) a.cancel();
    };
  }, []);

  return (
    <div
      ref={ref}
      class="confetti"
      aria-hidden="true"
      style={{ left: px(from.left), top: px(from.top + from.height / 2) }}
    >
      {burst.map((piece, i) => (
        <span key={i} class="piece" data-shape={piece.shape} data-color={piece.color} style={{ left: px(piece.x) }} />
      ))}
    </div>
  );
}
