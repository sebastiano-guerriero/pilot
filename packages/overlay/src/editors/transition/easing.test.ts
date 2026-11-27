import { describe, expect, it } from "vitest";
import { bezierAt, easingFor, easingKind, parseBezierNumbers, scaleTime } from "./easing.ts";
import { linearPoints, settleFactor, springEasing, springOf } from "./spring.ts";

describe("springs", () => {
  it("last longer than they feel, more with more bounce, growing smoothly (none settles a bit late too)", () => {
    expect(settleFactor(30)).toBeCloseTo(1.647, 3);
    // No jump as another wobble counts, and never back: more bounce, never less time (as long as none until ~20%).
    for (let b = 0; b < 90; b++) expect(settleFactor(b + 1)).toBeGreaterThanOrEqual(settleFactor(b));
    expect(settleFactor(5)).toBe(settleFactor(0));
    expect(settleFactor(28) - settleFactor(26)).toBeLessThan(0.1);
    expect(settleFactor(70)).toBeGreaterThan(settleFactor(30));
    expect(settleFactor(0)).toBeGreaterThan(1);
  });

  it("are written as linear(), starting at 0 and ending at 1, and read back as the same spring", () => {
    const css = springEasing(30);
    expect(css).toMatch(/^linear\(0, .* 1\)$/);
    expect(springOf(css)).toEqual({ bounce: 30, factor: settleFactor(30) });
    expect(springOf(springEasing(0))?.bounce).toBe(0);
  });

  it("another generator's spring reads as one too (kvin.me's 30%, sampled more sparsely)", () => {
    const kvin =
      "linear(0, 0.0018, 0.0069 1.15%, 0.026 2.3%, 0.0637, 0.1135 5.18%, 0.2229 7.78%, 0.5977 15.84%, 0.7014, 0.7904, 0.8641, 0.9228, 0.9676 28.8%, 1.0032 31.68%, 1.0225, 1.0352 36.29%, 1.0431 38.88%, 1.046 42.05%, 1.0448 44.35%, 1.0407 47.23%, 1.0118 61.63%, 1.0025 69.41%, 0.9981 80.35%, 0.9992 99.94%)";
    expect(Math.abs((springOf(kvin)?.bounce ?? 0) - 30)).toBeLessThanOrEqual(1);
    expect(springOf("linear(0, 0.5, 1)")).toBeNull();
  });

  it("linear()'s points: positions filled in as CSS does", () => {
    expect(linearPoints("linear(0, 0.5, 0.8 80%, 1)")).toEqual([
      [0, 0],
      [0.4, 0.5],
      [0.8, 0.8],
      [1, 1],
    ]);
  });
});

describe("easings", () => {
  it("what the select shows: a keyword, cubic-bezier, spring, or custom", () => {
    expect(easingKind("ease-out")).toBe("ease-out");
    expect(easingKind("cubic-bezier(0.4, 0, 0.2, 1)")).toBe("cubic-bezier");
    expect(easingKind(springEasing(40))).toBe("spring");
    expect(easingKind("steps(4)")).toBe("custom");
    expect(easingKind("var(--ease-out)")).toBe("custom");
    expect(easingKind("")).toBe("");
  });

  it("a curve dragged is a cubic-bezier, or the keyword whose curve it lands on", () => {
    expect(easingFor([0.1, 1.33, 0.25, 1])).toBe("cubic-bezier(0.1, 1.33, 0.25, 1)");
    expect(easingFor([0, 0, 0.58, 1])).toBe("ease-out");
    expect(easingFor([0.25, 0.1, 0.25, 1])).toBe("ease");
  });

  it("a curve's four numbers, its x within 0–1; its value along it", () => {
    expect(parseBezierNumbers("0 0, .58 1")).toEqual([0, 0, 0.58, 1]);
    expect(parseBezierNumbers("1.2, 0, 0.58, 1")).toBeNull();
    expect(bezierAt([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 3);
  });

  it("a spring's duration is how long it feels: scaled by its factor, in its own unit", () => {
    const f = settleFactor(30);
    expect(scaleTime("500ms", f)).toBe(`${Math.round(500 * f)}ms`);
    expect(scaleTime("0.5s", f)).toBe(`${Math.round(500 * f) / 1000}s`);
    expect(scaleTime("var(--d)", f)).toBeNull();
  });
});
