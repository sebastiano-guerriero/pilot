// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cssProperty, LENGTH_UNITS } from "./properties.ts";
import { displayValue, parseValue, scrubIncrement, stepValue } from "./values.ts";

describe("parseValue", () => {
  it("takes a bare number as px", () => {
    expect(parseValue("width", " 120 ")).toBe("120px");
    expect(parseValue("width", "0")).toBe("0px");
  });

  it("accepts every supported unit, lh included", () => {
    for (const unit of LENGTH_UNITS) expect(parseValue("width", `12${unit}`), unit).toBe(`12${unit}`);
    expect(parseValue("width", "1.5LH")).toBe("1.5lh");
  });

  it("accepts the property's keywords and the global ones", () => {
    expect(parseValue("width", "auto")).toBe("auto");
    expect(parseValue("width", "Fit-Content")).toBe("fit-content");
    expect(parseValue("width", "inherit")).toBe("inherit");
    expect(parseValue("padding-top", "auto")).toBeNull(); // not a padding keyword
  });

  it("rejects negatives where the property doesn't allow them, and nonsense", () => {
    expect(parseValue("width", "-4")).toBeNull();
    expect(parseValue("width", "-4px")).toBeNull();
    expect(parseValue("width", "wide")).toBeNull();
    expect(parseValue("width", "12parsecs")).toBeNull();
    expect(parseValue("width", "")).toBeNull();
  });

  it("wraps math in calc() so the designer doesn't have to", () => {
    expect(parseValue("width", "100% - 20px")).toBe("calc(100% - 20px)");
    expect(parseValue("width", "100%-20px")).toBe("calc(100% - 20px)"); // spaces added
    expect(parseValue("width", "50% + 2rem")).toBe("calc(50% + 2rem)");
    expect(parseValue("width", "100vw/3")).toBe("calc(100vw / 3)");
    expect(parseValue("width", "min(100%, 300px) - 2rem")).toBe("calc(min(100%, 300px) - 2rem)");
  });

  it("accepts a typed calc() too (same result)", () => {
    expect(parseValue("width", "calc(100% - 20px)")).toBe("calc(100% - 20px)");
    expect(parseValue("width", "CALC(100%-20px)")).toBe("calc(100% - 20px)");
  });

  it("keeps other functions as typed", () => {
    expect(parseValue("width", "min(100%, 300px)")).toBe("min(100%, 300px)");
    expect(parseValue("width", "clamp(200px, 50%, 600px)")).toBe("clamp(200px, 50%, 600px)");
  });
});

describe("displayValue", () => {
  it("never shows the outer calc()", () => {
    expect(displayValue("calc(100% - 20px)")).toBe("100% - 20px");
    expect(displayValue("50%")).toBe("50%");
    expect(displayValue("calc(1px) + calc(2px)")).toBe("calc(1px) + calc(2px)"); // not one call
  });
});

describe("stepValue", () => {
  it("keeps the unit", () => {
    expect(stepValue("width", "100%", 1, "500px")).toBe("101%");
    expect(stepValue("width", "2.5rem", 1, "40px")).toBe("3.5rem");
    expect(stepValue("width", "3", 1, "3px")).toBe("4px");
  });

  it("steps an empty field or a keyword from the computed px", () => {
    expect(stepValue("width", "", 1, "122px")).toBe("123px");
    expect(stepValue("width", "auto", -10, "122px")).toBe("112px");
  });

  it("doesn't go below 0 where negatives aren't valid, and leaves math alone", () => {
    expect(stepValue("width", "2px", -10, "2px")).toBe("0px");
    expect(stepValue("width", "100% - 20px", 1, "300px")).toBeNull();
  });
});

describe("CSS property db", () => {
  it("has the properties' initial values", () => {
    expect(cssProperty("width").initial).toBe("auto");
    expect(cssProperty("padding-top").initial).toBe("0");
  });
});

describe("scrubIncrement", () => {
  it("0.1 for font-relative units, 1 otherwise", () => {
    expect(["2rem", "1.5em", "3lh", "12px", "50%", "10vw", "", "auto"].map(scrubIncrement)).toEqual([
      0.1, 0.1, 0.1, 1, 1, 1, 1, 1,
    ]);
  });
});

describe("other kinds of value", () => {
  it("order: whole numbers, no unit, negatives allowed", () => {
    expect(parseValue("order", "3")).toBe("3");
    expect(parseValue("order", "-1")).toBe("-1");
    expect(parseValue("order", "1.5")).toBeNull();
    expect(parseValue("order", "2px")).toBeNull();
    expect(stepValue("order", "", 1, "0")).toBe("1");
    expect(stepValue("order", "1", -10, "1")).toBe("-9");
  });

  it("grid lines: numbers but 0, span N, auto", () => {
    expect(parseValue("grid-column-start", "2")).toBe("2");
    expect(parseValue("grid-column-start", "-1")).toBe("-1");
    expect(parseValue("grid-column-start", "0")).toBeNull();
    expect(parseValue("grid-column-end", "span2")).toBe("span 2");
    expect(parseValue("grid-column-end", "auto")).toBe("auto");
    expect(parseValue("grid-column-end", "2px")).toBeNull();
  });

  it("grid lines step past 0, and from empty or auto start at 1 / -1", () => {
    expect(stepValue("grid-column-start", "1", -1, "auto")).toBe("-1");
    expect(stepValue("grid-column-start", "-1", 1, "auto")).toBe("1");
    expect(stepValue("grid-column-start", "", 1, "auto")).toBe("1");
    expect(stepValue("grid-column-start", "auto", -1, "auto")).toBe("-1");
    expect(stepValue("grid-column-end", "span 2", -5, "auto")).toBe("span 1");
  });

  it("col-span: a count is span N / span N, full is 1 / -1", () => {
    expect(parseValue("grid-column", "3")).toBe("span 3 / span 3");
    expect(parseValue("grid-column", "span 3")).toBe("span 3 / span 3");
    expect(parseValue("grid-column", "Full")).toBe("1 / -1");
    expect(parseValue("grid-column", "0")).toBeNull();
    expect(parseValue("grid-column", "2/4")).toBe("2 / 4");
    expect(parseValue("grid-column", "nope")).toBeNull();
  });

  it("col-span shows the count and full back", () => {
    expect(displayValue("span 3 / span 3", "grid-column")).toBe("3");
    expect(displayValue("2 / span 3", "grid-column")).toBe("3");
    expect(displayValue("span 3", "grid-column")).toBe("3");
    expect(displayValue("1 / -1", "grid-column")).toBe("full");
    expect(displayValue("2 / 4", "grid-column")).toBe("2 / 4");
    // Only grid-column reads this way.
    expect(displayValue("span 3", "grid-column-start")).toBe("span 3");
  });

  it("col-span steps the count, from 1", () => {
    expect(stepValue("grid-column", "3", 1, "auto")).toBe("span 4 / span 4");
    expect(stepValue("grid-column", "1", -1, "auto")).toBe("span 1 / span 1");
    expect(stepValue("grid-column", "", 1, "auto")).toBe("span 2 / span 2");
    expect(stepValue("grid-column", "", -1, "auto")).toBeNull();
    expect(stepValue("grid-column", "full", 1, "auto")).toBeNull();
  });
});

describe("ratio (aspect-ratio)", () => {
  it("x/y, x / y and x:y write x / y; one number is that ratio to 1", async () => {
    const { parseValue, normalizeRatio } = await import("./values.ts");
    expect(parseValue("aspect-ratio", "16/9")).toBe("16 / 9");
    expect(parseValue("aspect-ratio", "4 / 5")).toBe("4 / 5");
    expect(parseValue("aspect-ratio", "21:9")).toBe("21 / 9");
    expect(parseValue("aspect-ratio", "1.5")).toBe("1.5 / 1");
    expect(parseValue("aspect-ratio", "auto")).toBe("auto");
    expect(normalizeRatio("1/0")).toBeNull();
    expect(parseValue("aspect-ratio", "16/9/2")).toBeNull();
    expect(parseValue("aspect-ratio", "wide")).toBeNull();
  });

  it("isn't stepped", async () => {
    const { stepValue } = await import("./values.ts");
    expect(stepValue("aspect-ratio", "16 / 9", 1, undefined)).toBeNull();
  });
});

