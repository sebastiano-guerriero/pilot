import { useRef } from "preact/hooks";
import { cssProperty } from "../../css/properties.ts";
import { scrubIncrement, stepValue } from "../../css/values.ts";
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
 * - At the minimum (0, unless negatives are allowed), dragging further doesn't
 *   count: turning back moves the value right away.
 * What it steps from is fixed when the drag starts (the computed value
 * changes with every step, so it can't be read again mid-drag).
 */
export function useScrub({ onChange, onRevert }: Pick<PropertyEditorProps, "onChange" | "onRevert">) {
  const drag = useRef<{ gesture: object; base: string; start: number; shift: number } | null>(null);
  return (target: ScrubTarget, steps: number, startText: string, gesture: object) => {
    const { property } = target;
    const writes = target.writes ?? property;
    if (drag.current?.gesture !== gesture) {
      const base = target.base();
      const start = Number.parseFloat(stepValue(property, startText, 0, base) ?? "");
      drag.current = { gesture, base, start, shift: 0 };
    }
    const d = drag.current;
    const increment = scrubIncrement(startText);
    let offset = steps - d.shift;
    if (!cssProperty(property).negative && Number.isFinite(d.start) && d.start + offset * increment < 0) {
      const floor = -d.start / increment;
      d.shift += offset - floor;
      offset = floor;
    }
    if (offset === 0 && startText) return onRevert?.(writes, gesture);
    const next = stepValue(property, startText, offset * increment, d.base);
    if (next) onChange(writes, next, { gesture });
  };
}
