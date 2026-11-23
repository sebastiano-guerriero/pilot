// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { formatFilter, formatShadow, parseFilter, parseFilterValue, parseShadow, stepFilterValue } from "./filter.ts";

describe("parseFilter / formatFilter", () => {
  it("reads the functions in order; anything else is a custom filter; none is its own", () => {
    expect(parseFilter("")).toBeNull();
    expect(parseFilter("none")).toBe("none");
    expect(parseFilter("blur(4px) drop-shadow(0 4px 4px rgb(0 0 0 / 0.25)) url(#noise)")).toEqual([
      { fn: "blur", value: "4px" },
      { fn: "drop-shadow", value: "0 4px 4px rgb(0 0 0 / 0.25)" },
      { fn: "custom", text: "url(#noise)" },
    ]);
  });

  it("writes them back in order, separated by spaces", () => {
    const filters = parseFilter("grayscale(100%)  brightness(1.5)") as Exclude<ReturnType<typeof parseFilter>, null | "none">;
    expect(formatFilter(filters)).toBe("grayscale(100%) brightness(1.5)");
    expect(formatFilter("none")).toBe("none");
  });
});

describe("parseFilterValue", () => {
  it("a bare number takes the function's unit", () => {
    expect(parseFilterValue("blur", "4")).toBe("4px");
    expect(parseFilterValue("brightness", "150")).toBe("150%");
    expect(parseFilterValue("hue-rotate", "90")).toBe("90deg");
  });

  it("a number with a point is CSS's factor; a share stops at 100%", () => {
    expect(parseFilterValue("brightness", "1.5")).toBe("150%");
    expect(parseFilterValue("grayscale", "0.5")).toBe("50%");
    expect(parseFilterValue("grayscale", "150")).toBe("100%");
  });

  it("never negative, but angles can be; nonsense is refused", () => {
    expect(parseFilterValue("blur", "-2")).toBeNull();
    expect(parseFilterValue("brightness", "-10%")).toBeNull();
    expect(parseFilterValue("hue-rotate", "-45")).toBe("-45deg");
    expect(parseFilterValue("brightness", "bright")).toBeNull();
  });
});

describe("stepFilterValue", () => {
  it("steps in the function's unit, within its range, from the start value when empty", () => {
    expect(stepFilterValue("blur", "4px", 1)).toBe("5px");
    expect(stepFilterValue("blur", "0px", -1)).toBe("0px");
    expect(stepFilterValue("grayscale", "100%", 10)).toBe("100%");
    expect(stepFilterValue("brightness", "", 1)).toBe("151%");
    expect(stepFilterValue("brightness", "1.5", 1)).toBe("151%");
    expect(stepFilterValue("hue-rotate", "0deg", -1)).toBe("-1deg");
    expect(stepFilterValue("drop-shadow", "0 4px 4px black", 1)).toBeNull();
  });
});

describe("parseShadow / formatShadow", () => {
  it("splits a drop-shadow into x, y, blur and color, the color before or after", () => {
    expect(parseShadow("0 4px 4px #00000040")).toEqual({ x: "0", y: "4px", blur: "4px", color: "#00000040" });
    expect(parseShadow("rgb(0 0 0 / 0.25) 2px 3px")).toEqual({ x: "2px", y: "3px", blur: "", color: "rgb(0 0 0 / 0.25)" });
    expect(parseShadow("0 4px 8px var(--shadow)")).toEqual({ x: "0", y: "4px", blur: "8px", color: "var(--shadow)" });
    expect(parseShadow("var(--x) var(--y)")).toEqual({ x: "var(--x)", y: "var(--y)", blur: "", color: "" });
  });

  it("doesn't split what isn't two or three lengths and a color", () => {
    expect(parseShadow("var(--shadow)")).toBeNull();
    expect(parseShadow("1px 2px 3px 4px red")).toBeNull();
    expect(parseShadow("1px 2px red blue")).toBeNull();
  });

  it("writes the parts back; empty offsets are 0, an empty blur or color left out", () => {
    expect(formatShadow({ x: "", y: "4px", blur: "", color: "" })).toBe("0 4px");
    expect(formatShadow({ x: "1px", y: "2px", blur: "3px", color: "red" })).toBe("1px 2px 3px red");
  });
});
