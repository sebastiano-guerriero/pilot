// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cssProperty, LENGTH_UNITS } from "./properties.ts";
import { displayValue, parseValue, stepValue } from "./values.ts";

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
  it("has the defaults the editors show as placeholders", () => {
    expect(cssProperty("width").initial).toBe("auto");
    expect(cssProperty("padding-top").initial).toBe("0");
  });
});
