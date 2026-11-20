import { useRef } from "preact/hooks";
import { cssProperty } from "../../css/properties.ts";
import { scrubIncrement, stepSize, stepValue } from "../../css/values.ts";
import type { PropertyEditorProps } from "../types.ts";

/** What a drag changes. */
export interface ScrubTarget {
  /** The property whose kind of value is stepped (units, minimum): `padding-top`. */
  property: string;
  /** The property written, when it's another one (a shorthand: `padding`). */
  writes?: string;
  /** What an empty field steps from: the computed value, or "0px". */
  base(): string;
}

/**
 * Dragging a field's handle (ScrubHandle): `steps` is the total from where
 * the drag started, in the same unit, as one undo step.
 * - From a value: back at the start, the exact earlier value is restored (no
 *   fake edit).
 * - From an empty field: it steps from the base (the computed value, 0 for
 *   gap, so the first step up is 1px), and never goes back to empty: only
 *   deleting the field's text does that.
 * - At the minimum (0, unless negatives are allowed), or a percent's 100,
 *   dragging further doesn't count: turning back moves the value right away.
 * What it steps from is fixed when the drag starts (the computed value
 * changes with every step, so it can't be read again mid-drag).
 *
 * Returns how many steps the drag is past the limit the value stopped at
 * (negative below a minimum), counted from where it got there: the handle
 * stretches by that (ScrubHandle). 0 when the value isn't held at a limit.
 */
export function useScrub({ onChange, onRevert }: Pick<PropertyEditorProps, "onChange" | "onRevert">) {
  const drag = useRef<{ gesture: object; base: string; start: number; shift: number; heldAt: number | null } | null>(null);
  return (target: ScrubTarget, steps: number, startText: string, gesture: object): number => {
    const { property } = target;
    const writes = target.writes ?? property;
    if (drag.current?.gesture !== gesture) {
      const base = target.base();
      const start = Number.parseFloat(stepValue(property, startText, 0, base) ?? "");
      drag.current = { gesture, base, start, shift: 0, heldAt: null };
    }
    const d = drag.current;
    const increment = scrubIncrement(startText);
    // What one step moves the value by (a unitless line-height steps by tenths).
    const moved = increment * stepSize(property, startText, d.base);
    let offset = steps - d.shift;
    // Past the limit: the steps beyond it this time (`offset - limit`).
    let past = 0;
    if (!cssProperty(property).negative && Number.isFinite(d.start) && d.start + offset * moved < 0) {
      const floor = -d.start / moved;
      past = offset - floor;
      d.shift += past;
      offset = floor;
    }
    // A percent (opacity) stops at 100 the same way.
    if (cssProperty(property).kind === "percent" && Number.isFinite(d.start) && d.start + offset * moved > 100) {
      const ceiling = (100 - d.start) / moved;
      past = offset - ceiling;
      d.shift += past;
      offset = ceiling;
    }
    // Where the drag reached the limit, while it stays past it: turning back
    // moves the value at once (above), and that ends it.
    if (past === 0) d.heldAt = null;
    else d.heldAt ??= steps - past;
    const overflow = d.heldAt === null ? 0 : steps - d.heldAt;
    if (offset === 0 && startText) {
      onRevert?.(writes, gesture);
      return overflow;
    }
    const next = stepValue(property, startText, offset * increment, d.base);
    if (next) onChange(writes, next, { gesture });
    return overflow;
  };
}
