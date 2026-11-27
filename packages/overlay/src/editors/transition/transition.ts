import { splitTopLevel } from "../../dom/declared.ts";

/**
 * transition as the editor sees it (TransitionEditor, the owner's model,
 * 2026-11-27): the transitions, the `transition` shorthand's entries, each
 * with what its panel sets (`opacity 300ms ease-out`); and the rows, the
 * timing longhands set on their own (`transition-duration: 500ms`), which
 * apply to every transition, over the shorthand's (CSS reads the longhand
 * after it). A page that sets only the property list (Tailwind's
 * `transition-opacity duration-300`) gives transitions with no timing of
 * their own, and its timing as rows.
 */

export const PROPERTY = "transition-property";

/** The timing longhands, in row order. */
export const TIMINGS = ["transition-duration", "transition-timing-function", "transition-delay"] as const;
export type Timing = (typeof TIMINGS)[number];

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

/** The `transition` shorthand: Pilot writes the panels' transitions as it, each with what its panel sets. */
export const SHORTHAND = "transition";

/** One transition as the shorthand writes it: its property, and the timing its panel sets ("" for what it doesn't). */
export interface Item {
  name: string;
  duration: string;
  easing: string;
  delay: string;
  /** `allow-discrete`, kept as written (no row edits it). */
  behavior: string;
}

const EASING_WORD = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/i;
const EASING_FUNCTION = /^(cubic-bezier|steps|linear)\(/i;

/**
 * The shorthand's transitions, as the shorthand reads each: a property (all
 * when none's named), the first time its duration, the second its delay, an
 * easing. `none` when it says so; null when there's nothing, or a part Pilot
 * can't place (a variable for a whole transition): then its property's list
 * is read instead.
 */
export function parseShorthand(value: string): Item[] | "none" | null {
  const v = value.trim();
  if (!v) return null;
  const items: Item[] = [];
  for (const part of splitList(v)) {
    const item: Item = { name: "", duration: "", easing: "", delay: "", behavior: "" };
    for (const token of splitTopLevel(part, " ").filter(Boolean)) {
      if (/^-?\d*\.?\d+(ms|s)$/i.test(token)) {
        if (!item.duration) item.duration = token.toLowerCase();
        else if (!item.delay) item.delay = token.toLowerCase();
        else return null;
      } else if (EASING_WORD.test(token) || EASING_FUNCTION.test(token)) {
        if (item.easing) return null;
        item.easing = EASING_WORD.test(token) ? token.toLowerCase() : token;
      } else if (/^(allow-discrete|normal)$/i.test(token)) item.behavior = token.toLowerCase();
      else if (/^-{0,2}[a-z_][\w-]*$/i.test(token) && !item.name) item.name = token.startsWith("--") ? token : token.toLowerCase();
      else return null;
    }
    items.push({ ...item, name: item.name || "all" });
  }
  if (items.length === 1 && items[0]?.name === "none") return "none";
  return items;
}

/** Transitions as the shorthand: each its property, then what its panel sets (a delay needs a duration before it). */
export function formatShorthand(items: Item[] | "none"): string {
  if (items === "none") return "none";
  return items
    .map((i) => [i.name, i.duration || (i.delay ? "0s" : ""), i.easing, i.delay, i.behavior === "allow-discrete" ? i.behavior : ""].filter(Boolean).join(" "))
    .join(", ");
}
