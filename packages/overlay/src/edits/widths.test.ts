import { describe, expect, it } from "vitest";
import { clickWidth, inWidths, partialWidth, takeWidths, widthSuggestion } from "./widths.ts";

describe("takeWidths", () => {
  it("takes a token once it's followed by a space", () => {
    expect(takeWidths("from-1200", null)).toEqual({ range: null, rest: "from-1200" });
    expect(takeWidths("from-1200 ", null)).toEqual({ range: { min: 1200 }, rest: "" });
    expect(takeWidths("to-767 gap", null)).toEqual({ range: { max: 767 }, rest: "gap" });
  });

  it("several tokens make a range, in either order", () => {
    expect(takeWidths("from-768 to-1199 pt", null)).toEqual({ range: { min: 768, max: 1199 }, rest: "pt" });
    expect(takeWidths("to-1199 from-768 ", null)).toEqual({ range: { min: 768, max: 1199 }, rest: "" });
    expect(takeWidths("from-1199 to-768 ", null)).toEqual({ range: { min: 768, max: 1199 }, rest: "" });
  });

  it("adds to the chip already there, replacing the same end", () => {
    expect(takeWidths("to-1199 ", { min: 768 })).toEqual({ range: { min: 768, max: 1199 }, rest: "" });
    expect(takeWidths("from-1024 ", { min: 768 })).toEqual({ range: { min: 1024 }, rest: "" });
  });

  it("only at the start, and only these words", () => {
    expect(takeWidths("gap from-12 ", null).range).toBeNull();
    expect(takeWidths("min-w ", null).range).toBeNull();
  });
});

describe("clickWidth", () => {
  it("starts with `from` the width, Shift: `to` it", () => {
    expect(clickWidth(null, 1200, false)).toEqual({ min: 1200 });
    expect(clickWidth(null, 767, true)).toEqual({ max: 767 });
  });

  it("a second width becomes the other end, in either order", () => {
    expect(clickWidth({ min: 768 }, 1199, false)).toEqual({ min: 768, max: 1199 });
    expect(clickWidth({ min: 1199 }, 768, false)).toEqual({ min: 768, max: 1199 });
    expect(clickWidth({ max: 767 }, 375, true)).toEqual({ min: 375, max: 767 });
  });

  it("the same width changes nothing; a full range starts over", () => {
    expect(clickWidth({ min: 768 }, 768, false)).toEqual({ min: 768 });
    expect(clickWidth({ min: 768, max: 1199 }, 1440, false)).toEqual({ min: 1440 });
    expect(clickWidth({ min: 768, max: 1199 }, 375, true)).toEqual({ max: 375 });
  });
});

describe("inWidths", () => {
  it("both ends included; no chip is every width", () => {
    expect(inWidths(null, 320)).toBe(true);
    expect(inWidths({ min: 768 }, 768)).toBe(true);
    expect(inWidths({ min: 768 }, 767)).toBe(false);
    expect(inWidths({ min: 768, max: 1199 }, 1199)).toBe(true);
    expect(inWidths({ min: 768, max: 1199 }, 1200)).toBe(false);
  });
});

describe("partialWidth", () => {
  it("a token on its way, before the space", () => {
    expect(partialWidth("from")).toEqual({ end: "from", digits: null });
    expect(partialWidth("from-")).toEqual({ end: "from", digits: "" });
    expect(partialWidth("to-76")).toEqual({ end: "to", digits: "76" });
    expect(partialWidth("fr")).toBeNull();
    expect(partialWidth("from-12 pt")).toBeNull();
    expect(partialWidth("top")).toBeNull();
  });
});

describe("widthSuggestion", () => {
  it("the rest of the viewport width, once the dash is typed", () => {
    expect(widthSuggestion("from", 1108)).toBeNull();
    expect(widthSuggestion("from-", 1108)).toBe("1108");
    expect(widthSuggestion("to-11", 1108)).toBe("08");
    expect(widthSuggestion("from-12", 1108)).toBeNull();
    expect(widthSuggestion("from-1108", 1108)).toBeNull();
  });
});

describe("Base and All widths", () => {
  it("`base ` and `all-widths ` are chips of their own; a width after Base gives it that end", () => {
    expect(takeWidths("base pt", null)).toEqual({ range: {}, rest: "pt" });
    expect(takeWidths("all-widths ", { min: 768 })).toEqual({ range: "all", rest: "" });
    expect(takeWidths("from-768 ", {})).toEqual({ range: { min: 768 }, rest: "" });
    expect(takeWidths("from-768 ", "all")).toEqual({ range: { min: 768 }, rest: "" });
  });

  it("clicking a width starts a range; any width is in them", () => {
    expect(clickWidth({}, 1200, false)).toEqual({ min: 1200 });
    expect(clickWidth("all", 1200, true)).toEqual({ max: 1200 });
    expect(inWidths({}, 300)).toBe(true);
    expect(inWidths("all", 300)).toBe(true);
  });
});
