import { splitTopLevel } from "../../dom/declared.ts";

/**
 * transition as the editor sees it (TransitionEditor): the properties that
 * animate (`transition-property`, a list: each a chip), and their timing, the
 * three longhands (duration, easing, delay), each a list too. CSS pairs the
 * lists by position and repeats a shorter one, so one value is the same
 * timing for every transition (Tailwind's way: `transition-opacity
 * duration-300 ease-out`), and a list gives each its own. Pilot writes one
 * value while they're all the same, a list only when one differs.
 */

export const PROPERTY = "transition-property";

/** The timing longhands, in row order. */
export const TIMINGS = ["transition-duration", "transition-timing-function", "transition-delay"] as const;
export type Timing = (typeof TIMINGS)[number];

/** What applies when a timing isn't set (CSS's initial values). */
export const TIMING_INITIAL: Record<Timing, string> = {
  "transition-duration": "0s",
  "transition-timing-function": "ease",
  "transition-delay": "0s",
};

/** What the first transition starts with when no duration is set (without one, 0s, nothing animates): Tailwind's. */
export const NEW_DURATION = "150ms";

/**
 * The property select's options, in menu order (then custom and none): what's
 * commonly animated, all first. Any other property is custom.
 */
export const TRANSITION_PROPERTIES = [
  "all",
  "opacity",
  "transform",
  "translate",
  "rotate",
  "scale",
  "color",
  "background-color",
  "border-color",
  "box-shadow",
  "filter",
  "width",
  "height",
] as const;

/** The easing select's presets (then custom: cubic-bezier(), steps(), linear(), a variable). */
export const EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const;

/** A list value's items: `opacity, transform` → two; "" → none. */
export function splitList(value: string): string[] {
  const v = value.trim();
  return v ? splitTopLevel(v, ",").map((p) => p.trim()).filter(Boolean) : [];
}

/** transition-property as its chips: null when nothing is set, `none` when it says so. */
export function parseTransitionProperty(value: string): string[] | "none" | null {
  const items = splitList(value);
  if (!items.length) return null;
  if (items.length === 1 && items[0]?.toLowerCase() === "none") return "none";
  return items;
}

/** A list as one value: one item while they're all the same (CSS repeats it), else each. */
export function collapse(values: string[]): string {
  const first = values[0] ?? "";
  return values.every((v) => v === first) ? first : values.join(", ");
}

/** A timing list for `n` transitions, as CSS reads it: repeated to length, or cut; nothing set is `initial`. */
export function expand(list: string[], n: number, initial: string): string[] {
  return Array.from({ length: n }, (_, i) => (list.length ? (list[i % list.length] as string) : initial));
}

/** The value every one of `n` transitions has for a timing ("" when it isn't set), or null when they differ. */
export function uniformOf(value: string, n: number): string | null {
  const list = splitList(value);
  if (!list.length) return "";
  const values = expand(list, Math.max(1, n), "");
  return values.every((v) => v === values[0]) ? (values[0] as string) : null;
}

/** The value most of `values` have (the first of a tie). */
function commonOf(values: string[]): string {
  let best = values[0] ?? "";
  let most = 0;
  for (const v of values) {
    const count = values.filter((x) => x === v).length;
    if (count > most) {
      best = v;
      most = count;
    }
  }
  return best;
}

/**
 * A timing's value with transition `i` (of `n`) set to `next`; `next` "" is
 * "the same as the others": the value most of them have.
 */
export function withItemTiming(value: string, timing: Timing, n: number, i: number, next: string): string {
  // Nothing set, and CSS's own asked for: nothing to write.
  if (!splitList(value).length && (!next || next === TIMING_INITIAL[timing])) return value;
  const values = expand(splitList(value), n, TIMING_INITIAL[timing]);
  values[i] = next || commonOf(values.filter((_, j) => j !== i));
  return collapse(values);
}

/** A timing's value with transition `i` (of `n`) taken off: its own value goes with it. */
export function withoutItemTiming(value: string, n: number, i: number): string {
  const list = splitList(value);
  if (list.length <= 1) return value;
  const values = expand(list, n, "");
  values.splice(i, 1);
  return collapse(values);
}

/**
 * A timing's value with a transition added after the `n` there are: it takes the value most of them have (one
 * shared by all stays as it is). Rejected: copying the last one's (the owner, 2026-11-27: the most common reads as
 * the transition's timing, the last one may be the exception).
 */
export function withAddedTiming(value: string, n: number): string {
  const list = splitList(value);
  if (list.length <= 1 || n === 0) return value;
  const values = expand(list, n, "");
  return collapse([...values, commonOf(values)]);
}

/** Transition `i`'s own value for a timing (repeated as CSS does), "" when none is set. */
export function itemTiming(value: string, n: number, i: number): string {
  const list = splitList(value);
  return list.length ? (expand(list, n, "")[i] as string) : "";
}

/** Whether the browser takes `text` for `property` (where CSS.supports is real). */
function supported(property: string, text: string): boolean {
  return typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports(property, text);
}

const FUNCTION = /^(var|calc|min|max|clamp)\(/i;

/**
 * A property's name as transition-property takes it (custom: `grid-template-rows`, `--progress`), or null.
 * Lowercase, but a custom property's case is kept.
 */
export function parsePropertyName(text: string): string | null {
  const t = text.trim();
  if (!/^-{0,2}[a-z_][\w-]*$/i.test(t)) return null;
  const name = t.startsWith("--") ? t : t.toLowerCase();
  if (name === "none" || name === "initial" || name === "inherit" || name === "unset") return null;
  return supported(PROPERTY, name) ? name : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A duration or delay typed: a bare number is milliseconds (Tailwind's
 * duration-300), `0.3s` and `300ms` as written; negative only for a delay
 * (it starts partway through). var() and calc() as typed, checked. Null when
 * it isn't one.
 */
export function parseTime(timing: Timing, text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (FUNCTION.test(t)) return supported(timing, text.trim()) ? text.trim() : null;
  const m = /^(-?\d*\.?\d+)(ms|s)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 0 && timing !== "transition-delay") return null;
  return `${round2(n)}${m[2] ?? "ms"}`;
}

/**
 * A time `delta` steps from `text` (↑/↓, the wheel; Shift is 10 steps): 10ms
 * a step in ms, 0.1s in s; from empty, from 0ms. Never below 0 but for a
 * delay. Null when it doesn't step (var()).
 */
export function stepTime(timing: Timing, text: string, delta: number): string | null {
  const from = text.trim() ? parseTime(timing, text) : "0ms";
  const m = from && /^(-?\d*\.?\d+)(ms|s)$/.exec(from);
  if (!m) return null;
  const unit = m[2] as "ms" | "s";
  let n = round2(Number(m[1]) + delta * (unit === "ms" ? 10 : 0.1));
  if (timing !== "transition-delay") n = Math.max(0, n);
  return `${n}${unit}`;
}

/** An easing typed (custom): a keyword, cubic-bezier(), steps(), linear(), var(); checked by the browser. */
export function parseEasing(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return null;
  const v = FUNCTION.test(t) || /^[a-z-]+\(/i.test(t) ? t : t.toLowerCase();
  return supported("transition-timing-function", v) ? v : null;
}
