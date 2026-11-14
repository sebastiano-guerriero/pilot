import { describe, expect, it } from "vitest";
import { type GridModel, drawnPositions, gapRects, gridLines, parseTracks } from "./gridLines.ts";

describe("parseTracks", () => {
  it("reads resolved track sizes, ignoring line names", () => {
    expect(parseTracks("293.328px 293.336px 293.336px")).toEqual([293.328, 293.336, 293.336]);
    expect(parseTracks("[full-start] 100px [content] 200px [full-end]")).toEqual([100, 200]);
  });

  it("is null when there are no px tracks to draw", () => {
    expect(parseTracks("none")).toBeNull();
    expect(parseTracks("")).toBeNull();
    expect(parseTracks("1fr 1fr")).toBeNull();
  });
});

describe("gridLines", () => {
  const base = { start: 100, size: 300, gap: 0, align: "normal" };

  it("numbers lines from 1 at the start edge, one more than the tracks", () => {
    expect(gridLines({ ...base, tracks: [100, 100, 100] })).toEqual([
      { number: 1, start: 100, end: 100 },
      { number: 2, start: 200, end: 200 },
      { number: 3, start: 300, end: 300 },
      { number: 4, start: 400, end: 400 },
    ]);
  });

  it("a line between tracks spans the gap; the outer lines don't", () => {
    expect(gridLines({ ...base, tracks: [90, 90, 90], gap: 15 })).toEqual([
      { number: 1, start: 100, end: 100 },
      { number: 2, start: 190, end: 205 },
      { number: 3, start: 295, end: 310 },
      { number: 4, start: 400, end: 400 },
    ]);
  });

  it("center and end shift tracks that don't fill the container", () => {
    const tracks = [100, 100];
    expect(gridLines({ ...base, tracks, align: "center" })[0]?.start).toBe(150);
    expect(gridLines({ ...base, tracks, align: "end" })[0]?.start).toBe(200);
    expect(gridLines({ ...base, tracks, align: "safe center" })[0]?.start).toBe(150);
    expect(gridLines({ ...base, tracks, align: "space-between" })[0]?.start).toBe(100);
  });
});

describe("gapRects", () => {
  // 3 columns of 90 with 15px gaps from x=100; 2 rows of 50 with a 10px gap from y=0.
  const grid: GridModel = {
    box: { left: 100, top: 0, width: 300, height: 110 },
    content: { left: 100, top: 0, width: 300, height: 110 },
    columns: gridLines({ start: 100, size: 300, tracks: [90, 90, 90], gap: 15, align: "normal" }),
    rows: gridLines({ start: 0, size: 110, tracks: [50, 50], gap: 10, align: "normal" }),
  };

  it("column gaps span the rows; row gaps are cut where column gaps cross them", () => {
    expect(gapRects(grid)).toEqual([
      { left: 190, top: 0, width: 15, height: 110 },
      { left: 295, top: 0, width: 15, height: 110 },
      { left: 100, top: 50, width: 90, height: 10 },
      { left: 205, top: 50, width: 90, height: 10 },
      { left: 310, top: 50, width: 90, height: 10 },
    ]);
  });

  it("one axis: the row gaps alone run the full width; the column gaps alone, the full height", () => {
    expect(gapRects(grid, { rows: true, columns: false })).toEqual([{ left: 100, top: 50, width: 300, height: 10 }]);
    expect(gapRects(grid, { rows: false, columns: true })).toEqual([
      { left: 190, top: 0, width: 15, height: 110 },
      { left: 295, top: 0, width: 15, height: 110 },
    ]);
  });

  it("no gaps, nothing to stripe", () => {
    const flat: GridModel = {
      ...grid,
      columns: gridLines({ start: 100, size: 300, tracks: [100, 200], gap: 0, align: "normal" }),
      rows: gridLines({ start: 0, size: 110, tracks: [110], gap: 0, align: "normal" }),
    };
    expect(gapRects(flat)).toEqual([]);
  });
});

describe("drawnPositions", () => {
  it("leaves out lines on the element's outline, within 1px", () => {
    // Border box from 100 to 400; no padding: lines 1 and the last sit on it.
    expect(drawnPositions({ number: 1, start: 100, end: 100 }, 100, 400)).toEqual([]);
    expect(drawnPositions({ number: 4, start: 399.4, end: 399.4 }, 100, 400)).toEqual([]);
    expect(drawnPositions({ number: 2, start: 190, end: 205 }, 100, 400)).toEqual([190, 205]);
  });

  it("keeps outer lines inside padding", () => {
    expect(drawnPositions({ number: 1, start: 124, end: 124 }, 100, 400)).toEqual([124]);
  });
});
