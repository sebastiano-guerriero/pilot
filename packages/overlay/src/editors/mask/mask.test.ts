import { describe, expect, it } from "vitest";
import { angleText, formatMask, maskChanges, NEW_MASK, parseMask, stopText } from "./mask.ts";

describe("mask-image as masks", () => {
  it("what + adds is Tailwind's mask-b-from-50%", () => {
    expect(formatMask([NEW_MASK])).toBe("linear-gradient(to bottom, black 50%, transparent)");
  });

  it("a fade reads back as it was written: sides, corners, angles, radial at a position", () => {
    for (const value of [
      "linear-gradient(to bottom, black 50%, transparent)",
      "linear-gradient(to top right, black 10px, transparent calc(100% - 20px))",
      "linear-gradient(45deg, black, transparent 80%)",
      "radial-gradient(black 30%, transparent 70%)",
      "radial-gradient(at top left, black 30%, transparent)",
    ]) {
      expect(formatMask(parseMask(value) as never), value).toBe(value);
    }
  });

  it("both edges of an axis are two layers (as Tailwind's mask-x), one mask", () => {
    const x = "linear-gradient(to right, black 70%, transparent), linear-gradient(to left, black 70%, transparent)";
    const masks = parseMask(x);
    expect(masks).toEqual([{ type: "linear", direction: "left and right", angle: "", from: "70%", to: "" }]);
    expect(formatMask(masks as never)).toBe(x);
  });

  it("the page's ways of writing them: no direction, a side's words swapped, white, positions in other words", () => {
    expect(parseMask("linear-gradient(black, transparent)")).toEqual([{ type: "linear", direction: "to bottom", angle: "", from: "", to: "" }]);
    expect((parseMask("linear-gradient(to right top, white 5%, transparent)") as never[])[0]).toMatchObject({ direction: "to top right" });
    expect((parseMask("radial-gradient(at left top, black, transparent)") as never[])[0]).toMatchObject({ at: "top left" });
    expect((parseMask("radial-gradient(at center center, black, transparent)") as never[])[0]).toMatchObject({ at: "center" });
  });

  it("anything else is a custom mask, its text as it is; none and nothing set are their own", () => {
    expect(parseMask("url(mask.svg)")).toEqual([{ type: "custom", text: "url(mask.svg)" }]);
    expect(parseMask("linear-gradient(red, blue, green)")).toEqual([{ type: "custom", text: "linear-gradient(red, blue, green)" }]);
    expect(parseMask("radial-gradient(circle at top, black, transparent)")?.[0]).toMatchObject({ type: "custom" });
    expect(parseMask("none")).toBe("none");
    expect(parseMask("")).toBeNull();
  });
});

describe("mask-composite with it", () => {
  const declared = (composite: string) => (p: string) => (p === "mask-composite" ? composite : "");
  it("a fade writes intersect, unless it's set; custom masks leave it", () => {
    const fade = formatMask([NEW_MASK]);
    expect(maskChanges(fade, declared(""))).toEqual([
      ["mask-image", fade],
      ["mask-composite", "intersect"],
    ]);
    expect(maskChanges(fade, declared("intersect"))).toEqual([["mask-image", fade]]);
    expect(maskChanges("url(a.svg)", declared(""))).toEqual([["mask-image", "url(a.svg)"]]);
  });

  it("cleared or none, an intersect goes with it; another composite stays", () => {
    expect(maskChanges("", declared("intersect"))).toEqual([
      ["mask-image", ""],
      ["mask-composite", ""],
    ]);
    expect(maskChanges("none", declared("intersect"))).toEqual([
      ["mask-image", "none"],
      ["mask-composite", ""],
    ]);
    expect(maskChanges("", declared("exclude"))).toEqual([["mask-image", ""]]);
  });
});

describe("the fields", () => {
  it("a bare number is a percentage in from/to, degrees in an angle", () => {
    expect(stopText("50")).toBe("50%");
    expect(stopText("calc(100% - 40px)")).toBe("calc(100% - 40px)");
    expect(angleText("45")).toBe("45deg");
    expect(angleText("0.25turn")).toBe("0.25turn");
    expect(angleText("wide")).toBeNull();
  });
});
