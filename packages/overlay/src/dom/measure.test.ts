import { describe, expect, it } from "vitest";
import { insideBorder, measure } from "./measure.ts";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height });
const values = (m: ReturnType<typeof measure>) => m.distances.map((d) => `${d.axis}:${d.value}`).sort();

describe("measure", () => {
  it("inside its parent: the four distances to its edges, at its middle", () => {
    const m = measure(box(120, 50, 100, 40), box(100, 20, 300, 200));
    expect(values(m)).toEqual(["x:180", "x:20", "y:130", "y:30"]);
    const left = m.distances.find((d) => d.axis === "x" && d.value === 20);
    expect(left).toMatchObject({ from: 100, to: 120, at: 70 });
    expect(m.guides).toEqual([]);
  });

  it("the same box (or the same edges): nothing", () => {
    expect(measure(box(0, 0, 50, 50), box(0, 0, 50, 50)).distances).toEqual([]);
  });

  it("beside, overlapping across: the gap, at the middle of where they overlap", () => {
    const m = measure(box(0, 0, 100, 100), box(140, 50, 100, 100));
    expect(m.distances).toEqual([
      { axis: "x", from: 100, to: 140, at: 75, value: 40 },
      { axis: "y", from: 0, to: 50, at: 50, value: 50 },
      { axis: "y", from: 100, to: 150, at: 50, value: 50 },
    ]);
  });

  it("diagonal (no overlap on either axis): both gaps from the selection's middle, with guides to the other's edges", () => {
    const m = measure(box(0, 0, 100, 100), box(150, 160, 50, 50));
    expect(m.distances).toEqual([
      { axis: "x", from: 100, to: 150, at: 50, value: 50 },
      { axis: "y", from: 100, to: 160, at: 50, value: 60 },
    ]);
    // The other box's left edge, down from the x line to its top; its top edge, across from the y line to its left.
    expect(m.guides).toEqual([
      { axis: "y", at: 150, from: 50, to: 160 },
      { axis: "x", at: 160, from: 50, to: 150 },
    ]);
  });

  it("rounds to a tenth", () => {
    expect(values(measure(box(0, 0, 10, 10), box(12.34, 0, 10, 10)))).toEqual(["x:2.3"]);
  });

  it("a container is measured inside its border: a card's 20px padding reads 20, not 21", () => {
    const card = insideBorder(box(100, 100, 300, 200), { top: 1, right: 1, bottom: 1, left: 1 });
    const title = box(121, 121, 100, 30);
    expect(values(measure(title, card)).filter((v) => v === "x:20" || v === "y:20")).toEqual(["x:20", "y:20"]);
  });
});
