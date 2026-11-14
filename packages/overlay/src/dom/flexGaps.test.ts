import { describe, expect, it } from "vitest";
import { type FlexModel, flexGapRects } from "./flexGaps.ts";

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe("flexGapRects", () => {
  // A row of three 50×20 items, 10px apart, from x=0.
  const row: FlexModel = {
    direction: "row",
    rowGap: 0,
    columnGap: 10,
    content: box(0, 0, 200, 20),
    items: [box(0, 0, 50, 20), box(60, 0, 50, 20), box(120, 0, 50, 20)],
  };

  it("a row: the column-gap between neighbors, as tall as the line", () => {
    expect(flexGapRects(row)).toEqual([
      { left: 50, top: 0, width: 10, height: 20, axis: "column" },
      { left: 110, top: 0, width: 10, height: 20, axis: "column" },
    ]);
    expect(flexGapRects(row, { rows: true, columns: false })).toEqual([]);
  });

  it("the gap's own size, centered when the items are spread further apart", () => {
    const spread = { ...row, items: [box(0, 0, 50, 20), box(150, 0, 50, 20)] };
    expect(flexGapRects(spread)).toEqual([{ left: 95, top: 0, width: 10, height: 20, axis: "column" }]);
  });

  it("wrapping: the row-gap between lines, across the content box", () => {
    const wrapped: FlexModel = {
      direction: "row",
      rowGap: 8,
      columnGap: 10,
      content: box(0, 0, 120, 48),
      items: [box(0, 0, 50, 20), box(60, 0, 50, 20), box(0, 28, 50, 20)],
    };
    expect(flexGapRects(wrapped)).toEqual([
      { left: 50, top: 0, width: 10, height: 20, axis: "column" },
      { left: 0, top: 20, width: 120, height: 8, axis: "row" },
    ]);
    expect(flexGapRects(wrapped, { rows: true, columns: false })).toEqual([
      { left: 0, top: 20, width: 120, height: 8, axis: "row" },
    ]);
  });

  it("a column: the row-gap between neighbors, as wide as the line", () => {
    const column: FlexModel = {
      direction: "column",
      rowGap: 12,
      columnGap: 0,
      content: box(0, 0, 80, 100),
      items: [box(0, 0, 80, 30), box(0, 42, 60, 30)],
    };
    expect(flexGapRects(column)).toEqual([{ left: 0, top: 30, width: 80, height: 12, axis: "row" }]);
  });

  it("no gap set: nothing to stripe", () => {
    expect(flexGapRects({ ...row, columnGap: 0 })).toEqual([]);
  });
});
