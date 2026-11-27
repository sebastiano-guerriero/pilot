import { describe, expect, it } from "vitest";
import {
  collapse,
  itemTiming,
  parseEasing,
  parsePropertyName,
  parseTime,
  parseTransitionProperty,
  stepTime,
  uniformOf,
  withAddedTiming,
  withItemTiming,
  withoutItemTiming,
} from "./transition.ts";

describe("transition's lists", () => {
  it("reads the properties as chips: none on its own, nothing set as null", () => {
    expect(parseTransitionProperty("opacity, transform")).toEqual(["opacity", "transform"]);
    expect(parseTransitionProperty("none")).toBe("none");
    expect(parseTransitionProperty("")).toBeNull();
  });

  it("one value while they're all the same (CSS repeats it), a list when one differs", () => {
    expect(collapse(["200ms", "200ms", "200ms"])).toBe("200ms");
    expect(collapse(["200ms", "500ms"])).toBe("200ms, 500ms");
    expect(uniformOf("200ms", 3)).toBe("200ms");
    expect(uniformOf("200ms, 200ms", 2)).toBe("200ms");
    expect(uniformOf("200ms, 500ms", 2)).toBeNull();
    expect(uniformOf("", 2)).toBe("");
  });

  it("one transition's timing: set on its own, the others keep theirs; emptied, it's the others' again", () => {
    // Nothing set: the others take CSS's 0s.
    expect(withItemTiming("", "transition-duration", 2, 1, "500ms")).toBe("0s, 500ms");
    expect(withItemTiming("200ms", "transition-duration", 3, 1, "500ms")).toBe("200ms, 500ms, 200ms");
    expect(withItemTiming("200ms, 500ms, 200ms", "transition-duration", 3, 1, "")).toBe("200ms");
    expect(withItemTiming("200ms, 500ms", "transition-duration", 2, 1, "200ms")).toBe("200ms");
    expect(itemTiming("200ms, 500ms", 3, 2)).toBe("200ms");
  });

  it("taking one off takes its timing; adding one gives it the value most have (a single value stays as it is)", () => {
    expect(withoutItemTiming("200ms, 500ms, 200ms", 3, 1)).toBe("200ms");
    expect(withoutItemTiming("200ms", 3, 1)).toBe("200ms");
    expect(withAddedTiming("200ms, 500ms, 200ms", 3)).toBe("200ms, 500ms, 200ms, 200ms");
    expect(withAddedTiming("200ms", 3)).toBe("200ms");
    // A tie: the first one's.
    expect(withAddedTiming("ease, ease-out", 2)).toBe("ease, ease-out, ease");
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
