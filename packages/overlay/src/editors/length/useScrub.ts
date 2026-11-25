import { useRef } from "preact/hooks";
import { cssProperty } from "../../css/properties.ts";
import { scrubIncrement, stepSize, stepValue } from "../../css/values.ts";
import { allTokens } from "../../dom/tokens.ts";
import { tokenAlong, tokenKindsFor } from "../../ui/components/TokenMenu/tokens.ts";
import { PX_PER_STEP } from "../../ui/components/ScrubHandle/ScrubHandle.tsx";
import { heldDrag } from "../heldDrag.ts";
import type { PropertyEditorProps } from "../types.ts";

/** How far a Shift drag goes for each variable along a scale (px): slower than a number's step, so each one can be landed on. */
const TOKEN_PX = 8;

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
 * - With Shift on a field holding a variable with a scale (`--space-3`): the
 *   variables along it, one every TOKEN_PX, held at either end; back at the
 *   start, the variable it held. With none in that direction (at the
 *   scale's end), the number, as without Shift (the owner's call).
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
  const drag = useRef<{ gesture: object; base: string; start: number } | null>(null);
  const held = useRef(heldDrag()).current;
  return (target: ScrubTarget, steps: number, startText: string, gesture: object, shiftKey = false): number => {
    const { property } = target;
    const writes = target.writes ?? property;
    // Shift on a variable: along its scale, a variable every TOKEN_PX of drag (steps are ×10 with Shift).
    if (shiftKey) {
      const offset = Math.trunc((steps / 10) * (PX_PER_STEP / TOKEN_PX));
      const kinds = tokenKindsFor(property);
      const token = kinds.length ? tokenAlong(startText, offset || Math.sign(steps), allTokens(), kinds) : null;
      if (token) {
        if (offset === 0) onRevert?.(writes, gesture);
        else onChange(writes, token, { gesture });
        return 0;
      }
    }
    if (drag.current?.gesture !== gesture) {
      const base = target.base();
      const start = Number.parseFloat(stepValue(property, startText, 0, base) ?? "");
      drag.current = { gesture, base, start };
    }
    const d = drag.current;
    const increment = scrubIncrement(startText);
    // What one step moves the value by (a unitless line-height steps by tenths).
    const moved = increment * stepSize(property, startText, d.base);
    // Held at the minimum (0, unless negatives are allowed), or a percent's 100 (opacity).
    const { kind, negative } = cssProperty(property);
    const { offset, overflow } = held(gesture, steps, d.start, moved, negative ? Number.NEGATIVE_INFINITY : 0, kind === "percent" ? 100 : Number.POSITIVE_INFINITY);
    if (offset === 0 && startText) {
      onRevert?.(writes, gesture);
      return overflow;
    }
    const next = stepValue(property, startText, offset * increment, d.base);
    if (next) onChange(writes, next, { gesture });
    return overflow;
  };
}
