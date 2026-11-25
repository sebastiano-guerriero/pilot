import { describe, expect, it } from "vitest";
import { filterRange } from "./filter/filter.ts";
import { heldDrag } from "./heldDrag.ts";

describe("heldDrag", () => {
  it("within the limits: every step counts, nothing to stretch", () => {
    const held = heldDrag();
    const g = {};
    expect(held(g, 5, 10, 1, 0, 100)).toEqual({ offset: 5, overflow: 0 });
    expect(held(g, -5, 10, 1, 0, 100)).toEqual({ offset: -5, overflow: 0 });
  });

  it("past the minimum: held there, the overflow negative; turning back moves the value at once", () => {
    const held = heldDrag();
    const g = {};
    // 10% dragged 15 steps down: 0%, 5 steps past.
    expect(held(g, -15, 10, 1, 0, 100)).toEqual({ offset: -10, overflow: -5 });
    expect(held(g, -20, 10, 1, 0, 100)).toEqual({ offset: -10, overflow: -10 });
    // One step back: 1%, at once.
    expect(held(g, -19, 10, 1, 0, 100)).toEqual({ offset: -9, overflow: 0 });
  });

  it("past the maximum: held there, the overflow positive", () => {
    const held = heldDrag();
    expect(held({}, 30, 90, 1, 0, 100)).toEqual({ offset: 10, overflow: 20 });
  });

  it("a step of another size (a layer every 4 steps)", () => {
    const held = heldDrag();
    // 3 layers, 2 at the least: 8 steps down is 2 layers, then 4 steps past.
    expect(held({}, -8, 3, 1 / 4, 2, 12)).toEqual({ offset: -4, overflow: -4 });
  });

  it("a new drag starts over", () => {
    const held = heldDrag();
    held({}, -15, 10, 1, 0, 100);
    expect(held({}, -5, 10, 1, 0, 100)).toEqual({ offset: -5, overflow: 0 });
  });

  it("no limits (an angle): never held", () => {
    const held = heldDrag();
    expect(held({}, -400, 10, 1)).toEqual({ offset: -400, overflow: 0 });
  });
});

describe("filterRange", () => {
  it("a share 0–100, a length from 0, an angle any", () => {
    expect(filterRange("grayscale")).toEqual({ min: 0, max: 100 });
    expect(filterRange("blur")).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
    expect(filterRange("hue-rotate")).toEqual({ min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY });
  });
});
