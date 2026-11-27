import { describe, expect, it } from "vitest";
import { formatShorthand, parseEasing, parsePropertyName, parseShorthand, parseTime, parseTransitionProperty, stepTime } from "./transition.ts";

describe("transition's lists", () => {
  it("reads the properties as chips: none on its own, nothing set as null", () => {
    expect(parseTransitionProperty("opacity, transform")).toEqual(["opacity", "transform"]);
    expect(parseTransitionProperty("none")).toBe("none");
    expect(parseTransitionProperty("")).toBeNull();
  });

  it("the shorthand's transitions: each its property, then its own timing; written back the same way", () => {
    expect(parseShorthand("opacity 300ms ease-out, transform 0.2s 50ms")).toEqual([
      { name: "opacity", duration: "300ms", easing: "ease-out", delay: "", behavior: "" },
      { name: "transform", duration: "0.2s", easing: "", delay: "50ms", behavior: "" },
    ]);
    // No property named: all.
    expect(parseShorthand("0.2s")?.[0]).toMatchObject({ name: "all", duration: "0.2s" });
    expect(parseShorthand("none")).toBe("none");
    expect(parseShorthand("")).toBeNull();
    expect(parseShorthand("var(--transition)")).toBeNull();
    // A delay needs a duration before it.
    expect(formatShorthand([{ name: "opacity", duration: "", easing: "", delay: "50ms", behavior: "" }])).toBe("opacity 0s 50ms");
    expect(formatShorthand(parseShorthand("opacity 300ms cubic-bezier(0, 0, 0.58, 1), --x 1s") as never)).toBe(
      "opacity 300ms cubic-bezier(0, 0, 0.58, 1), --x 1s",
    );
  });
});

describe("transition's values", () => {
  it("times: a bare number is ms; a delay may be negative, a duration not", () => {
    expect(parseTime("transition-duration", "300")).toBe("300ms");
    expect(parseTime("transition-duration", "0.3S")).toBe("0.3s");
    expect(parseTime("transition-duration", "-100")).toBeNull();
    expect(parseTime("transition-delay", "-100ms")).toBe("-100ms");
    expect(parseTime("transition-duration", "fast")).toBeNull();
  });

  it("steps 10ms (0.1s in seconds), never below 0 but for a delay", () => {
    expect(stepTime("transition-duration", "150ms", 1)).toBe("160ms");
    expect(stepTime("transition-duration", "0.3s", 10)).toBe("1.3s");
    expect(stepTime("transition-duration", "", -1)).toBe("0ms");
    expect(stepTime("transition-delay", "", -1)).toBe("-10ms");
  });

  it("a custom property's name keeps its case; keywords aren't names", () => {
    expect(parsePropertyName("Grid-Template-Rows")).toBe("grid-template-rows");
    expect(parsePropertyName("--Progress")).toBe("--Progress");
    expect(parsePropertyName("none")).toBeNull();
    expect(parsePropertyName("two words")).toBeNull();
    expect(parseEasing("cubic-bezier(0.4,  0, 0.2, 1)")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });
});
