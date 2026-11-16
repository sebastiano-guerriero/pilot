import { describe, expect, it } from "vitest";
import { joinColor, parseColor, parseOpacity, splitColor } from "./colors.ts";

describe("colors", () => {
  it("splits a value into its color and opacity", () => {
    expect(splitColor("")).toEqual({ color: "", opacity: null });
    expect(splitColor("#000")).toEqual({ color: "#000000", opacity: 100 });
    expect(splitColor("#1CF69E")).toEqual({ color: "#1cf69e", opacity: 100 });
    expect(splitColor("#00000080")).toEqual({ color: "#000000", opacity: 50 });
    expect(splitColor("rgb(255, 0, 0)")).toEqual({ color: "#ff0000", opacity: 100 });
    expect(splitColor("rgba(255, 0, 0, 0.25)")).toEqual({ color: "#ff0000", opacity: 25 });
    expect(splitColor("rgb(0 0 255 / 40%)")).toEqual({ color: "#0000ff", opacity: 40 });
    // Named colors keep their name.
    expect(splitColor("var(--brand)")).toEqual({ color: "var(--brand)", opacity: 100 });
    expect(splitColor("color-mix(in srgb, var(--brand) 30%, transparent)")).toEqual({ color: "var(--brand)", opacity: 30 });
  });

  it("joins them back: hex, 8-digit hex below 100, color-mix for a named color", () => {
    expect(joinColor("#000000", 100)).toBe("#000000");
    expect(joinColor("#000000", 50)).toBe("#00000080");
    expect(joinColor("#000000", 0)).toBe("#00000000");
    expect(joinColor("var(--brand)", 100)).toBe("var(--brand)");
    expect(joinColor("var(--brand)", 30)).toBe("color-mix(in srgb, var(--brand) 30%, transparent)");
    expect(joinColor("", 50)).toBe("");
  });

  it("reads a typed color: hex with or without #, 3 to 8 digits; other CSS colors as typed", () => {
    expect(parseColor("000")).toBe("#000000");
    expect(parseColor("#FfF")).toBe("#ffffff");
    expect(parseColor("1cf69e")).toBe("#1cf69e");
    expect(parseColor("00000080")).toBe("#00000080");
    expect(parseColor("var(--brand)")).toBe("var(--brand)");
    expect(parseColor("oklch(0.7 0.1 200)")).toBe("oklch(0.7 0.1 200)");
    expect(parseColor("12345")).toBeNull();
    expect(parseColor("")).toBeNull();
  });

  it("reads a typed opacity: 0–100, with or without %", () => {
    expect(parseOpacity("50")).toBe(50);
    expect(parseOpacity("50%")).toBe(50);
    expect(parseOpacity("150")).toBe(100);
    expect(parseOpacity("x")).toBeNull();
  });
});
