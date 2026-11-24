// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { actionsBox } from "./SelectionActions.tsx";

const rect = (left: number, top: number, width: number, height = 40) => new DOMRect(left, top, width, height);

describe("actionsBox", () => {
  it("right-aligned with the box, above it; inside it, 4px in, when it touches the window's top", () => {
    expect(actionsBox(rect(100, 200, 120), 2, false, 1000)).toEqual({ left: 176, top: 176, right: 220, bottom: 196, inside: false, flipped: false });
    expect(actionsBox(rect(100, 10, 120), 1, false, 1000)).toMatchObject({ left: 196, top: 14, right: 216, inside: true, flipped: false });
  });

  it("near the window's left edge (a narrow element), aligned with its left edge instead, growing right", () => {
    // Right-aligned, two actions (44px) from a 30px box at 4px would start at -10.
    expect(actionsBox(rect(12, 200, 30), 2, false, 1000)).toEqual({ left: 12, top: 176, right: 56, bottom: 196, inside: false, flipped: true });
    expect(actionsBox(rect(12, 10, 30), 2, false, 1000)).toMatchObject({ left: 16, flipped: true });
  });

  it("an element partly off screen: kept 8px inside the window", () => {
    expect(actionsBox(rect(-50, 200, 60), 2, false, 1000)).toMatchObject({ left: 8, right: 52, flipped: true });
  });
});
