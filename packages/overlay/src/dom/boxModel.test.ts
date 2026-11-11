import { describe, expect, it } from "vitest";
import { type BoxModel, paddingRects } from "./boxModel.ts";

// A 200×100 box at (10, 20) with a 1px border and padding 8/16/12/4.
const model: BoxModel = {
  rect: { left: 10, top: 20, width: 200, height: 100 },
  border: { top: 1, right: 1, bottom: 1, left: 1 },
  padding: { top: 8, right: 16, bottom: 12, left: 4 },
};

const byside = (sides: Parameters<typeof paddingRects>[1]) =>
  Object.fromEntries(paddingRects(model, sides).map(({ side, ...r }) => [side, r]));

describe("paddingRects", () => {
  it("places each side inside the border", () => {
    expect(byside(["top"])).toEqual({ top: { left: 11, top: 21, width: 198, height: 8 } });
    expect(byside(["bottom"])).toEqual({ bottom: { left: 11, top: 107, width: 198, height: 12 } });
  });

  it("a lone left/right side covers the full inner height", () => {
    expect(byside(["left"])).toEqual({ left: { left: 11, top: 21, width: 4, height: 98 } });
    expect(byside(["right"])).toEqual({ right: { left: 193, top: 21, width: 16, height: 98 } });
  });

  it("left/right stop at shown top/bottom areas, so corners aren't covered twice", () => {
    const all = byside(["top", "right", "bottom", "left"]);
    expect(all.left).toEqual({ left: 11, top: 29, width: 4, height: 78 });
    expect(all.right).toEqual({ left: 193, top: 29, width: 16, height: 78 });
  });

  it("leaves out empty sides", () => {
    const zero: BoxModel = { ...model, padding: { ...model.padding, top: 0 } };
    expect(paddingRects(zero, ["top", "left"]).map((a) => a.side)).toEqual(["left"]);
  });
});
