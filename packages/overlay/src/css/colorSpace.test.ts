import { describe, expect, it } from "vitest";
import { formatOklch, fromHsv, fromOklch, hexOf, maxChroma, oklchInSrgb, parseCssColor, toHsv, toOklch } from "./colorSpace.ts";

describe("color spaces", () => {
  it("reads the forms the browser computes colors to", () => {
    expect(hexOf(parseCssColor("#abc")?.rgb ?? { r: 0, g: 0, b: 0 })).toBe("#aabbcc");
    expect(parseCssColor("#00000080")?.alpha).toBeCloseTo(0.5, 2);
    expect(hexOf(parseCssColor("rgb(255, 0, 0)")?.rgb ?? { r: 0, g: 0, b: 0 })).toBe("#ff0000");
    expect(parseCssColor("rgba(0, 0, 0, 0.25)")?.alpha).toBe(0.25);
    expect(parseCssColor("rgb(0 128 255 / 50%)")?.alpha).toBe(0.5);
    const ok = parseCssColor("oklch(0.7 0.1 280 / 40%)");
    expect(ok?.oklch).toEqual({ l: 0.7, c: 0.1, h: 280 });
    expect(ok?.alpha).toBeCloseTo(0.4);
    expect(hexOf(parseCssColor("color(srgb 1 0.5 0)")?.rgb ?? { r: 0, g: 0, b: 0 })).toBe("#ff8000");
    expect(parseCssColor("var(--brand)")).toBeNull();
  });

  it("OKLCH round-trips through sRGB, and keeps lightness and hue when out of gamut", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#b0a8e0", "#123456"]) {
      const rgb = parseCssColor(hex)?.rgb ?? { r: 0, g: 0, b: 0 };
      expect(hexOf(fromOklch(toOklch(rgb)))).toBe(hex);
    }
    expect(toOklch({ r: 1, g: 1, b: 1 }).l).toBeCloseTo(1, 3);
    // Too much chroma for sRGB: the chroma goes down, the hue stays.
    const vivid = fromOklch({ l: 0.7, c: 0.4, h: 150 });
    expect(Math.abs(toOklch(vivid).h - 150)).toBeLessThan(2);
    expect(Math.abs(toOklch(vivid).l - 0.7)).toBeLessThan(0.01);
  });

  it("HSV round-trips; a gray has no hue", () => {
    for (const hex of ["#ff0000", "#336699", "#b0a8e0"]) {
      const rgb = parseCssColor(hex)?.rgb ?? { r: 0, g: 0, b: 0 };
      expect(hexOf(fromHsv(toHsv(rgb)))).toBe(hex);
    }
    expect(toHsv({ r: 0.5, g: 0.5, b: 0.5 })).toEqual({ h: 0, s: 0, v: 0.5 });
  });

  it("writes oklch() short: 3 decimals for lightness and chroma, 1 for hue; a gray keeps its hue", () => {
    expect(formatOklch({ l: 0.70001, c: 0.123456, h: 280.04 })).toBe("oklch(0.7 0.123 280)");
    expect(formatOklch({ l: 0.5, c: 0, h: 120 })).toBe("oklch(0.5 0 120)");
  });

  it("the most chroma sRGB shows at a lightness and hue: blue's peaks low, none at black or white", () => {
    // Blue's own corner (0.313) only touches the gamut: the run up to it ends at ~0.266.
    expect(maxChroma(0.452, 264.05)).toBeGreaterThan(0.25);
    expect(maxChroma(0.9, 264)).toBeLessThan(0.08);
    expect(maxChroma(0, 100)).toBe(0);
    expect(maxChroma(1, 100)).toBe(0);
    expect(oklchInSrgb({ l: 0.6, c: maxChroma(0.6, 30), h: 30 })).not.toBeNull();
  });

  it("tells what sRGB can't show", () => {
    expect(oklchInSrgb({ l: 0.7, c: 0.05, h: 280 })).not.toBeNull();
    expect(oklchInSrgb({ l: 0.7, c: 0.37, h: 150 })).toBeNull();
  });
});
