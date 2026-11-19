// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cssProperty, LENGTH_UNITS } from "./properties.ts";
import { displayValue, parseValue, scrubIncrement, stepSize, stepValue } from "./values.ts";

describe("parseValue", () => {
  it("idents (will-change): names, comma-separated, joined with a comma and a space", () => {
    expect(parseValue("will-change", "Opacity")).toBe("opacity");
    expect(parseValue("will-change", "opacity,transform")).toBe("opacity, transform");
    expect(parseValue("will-change", "12px")).toBeNull();
    expect(parseValue("will-change", "opacity,")).toBeNull();
    expect(stepValue("will-change", "opacity", 1, undefined)).toBeNull();
  });

  it("position (object-position): sides, lengths and percentages, Tailwind's _ as a space", () => {
    expect(parseValue("object-position", "Top Left")).toBe("top left");
    expect(parseValue("object-position", "25%_75%")).toBe("25% 75%");
    expect(parseValue("object-position", "right 10 bottom 2rem")).toBe("right 10px bottom 2rem");
    expect(parseValue("object-position", "center")).toBe("center");
    expect(parseValue("object-position", "middle")).toBeNull();
    expect(parseValue("object-position", "1px 2px 3px 4px 5px")).toBeNull();
    expect(stepValue("object-position", "top", 1, undefined)).toBeNull();
  });

  it("marker (list-style-type): a style's name, or any text, quoted with its case", () => {
    expect(parseValue("list-style-type", "Lower-Greek")).toBe("lower-greek");
    expect(parseValue("list-style-type", "—")).toBe('"—"');
    expect(parseValue("list-style-type", '"→ "')).toBe('"→ "');
    expect(parseValue("list-style-type", "Step")).toBe("step");
    expect(parseValue("list-style-type", "A.")).toBe('"A."');
    expect(stepValue("list-style-type", "disc", 1, undefined)).toBeNull();
  });

  it("vertical-align: its keywords, or a length (negatives too) or percentage", () => {
    expect(parseValue("vertical-align", "middle")).toBe("middle");
    expect(parseValue("vertical-align", "-2")).toBe("-2px");
    expect(parseValue("vertical-align", "10%")).toBe("10%");
  });

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
  it("flex-grow and flex-shrink: numbers without a unit, decimals too, never negative", () => {
    expect(parseValue("flex-grow", "1")).toBe("1");
    expect(parseValue("flex-grow", "0.5")).toBe("0.5");
    expect(parseValue("flex-grow", ".5")).toBe("0.5");
    expect(parseValue("flex-shrink", "0")).toBe("0");
    expect(parseValue("flex-grow", "-1")).toBeNull();
    expect(parseValue("flex-grow", "2px")).toBeNull();
    expect(stepValue("flex-grow", "0.5", 1, "0.5")).toBe("1.5");
    expect(stepValue("flex-grow", "", 1, "0")).toBe("1");
    expect(stepValue("flex-shrink", "0", -1, "0")).toBe("0");
  });

  it("font-family: names as typed, case kept, joined with commas", () => {
    expect(parseValue("font-family", "Inter")).toBe("Inter");
    expect(parseValue("font-family", "  Inter ,sans-serif ")).toBe("Inter, sans-serif");
    expect(parseValue("font-family", '"Geist Mono", monospace')).toBe('"Geist Mono", monospace');
    expect(parseValue("font-family", "var(--font-sans)")).toBe("var(--font-sans)");
    expect(parseValue("font-family", "Inherit")).toBe("inherit");
    expect(parseValue("font-family", "Inter,")).toBeNull();
    expect(stepValue("font-family", "Inter", 1, undefined)).toBeNull();
  });

  it("line-height: a bare number stays unitless and steps by tenths; lengths as usual", () => {
    expect(parseValue("line-height", "1.5")).toBe("1.5");
    expect(parseValue("line-height", "24px")).toBe("24px");
    expect(parseValue("line-height", "150%")).toBe("150%");
    expect(parseValue("line-height", "normal")).toBe("normal");
    expect(parseValue("line-height", "-1")).toBeNull();
    expect(stepValue("line-height", "1.5", 1, "24px")).toBe("1.6");
    expect(stepValue("line-height", "1.5", 10, "24px")).toBe("2.5");
    expect(stepValue("line-height", "24px", 1, "24px")).toBe("25px");
    expect(stepValue("line-height", "", 1, "normal")).toBe("1.3");
    expect(stepValue("line-height", "1.2em", 0.2, "19px")).toBe("1.4em");
    expect(stepSize("line-height", "1.5")).toBe(0.1);
    expect(stepSize("line-height", "24px")).toBe(1);
    expect(stepSize("width", "1.5")).toBe(1);
    expect(stepSize("line-height", "", "normal")).toBe(0.1);
    expect(stepSize("line-height", "", "24px")).toBe(1);
  });

  it("font-size, font-weight, letter-spacing", () => {
    expect(parseValue("font-size", "16")).toBe("16px");
    expect(parseValue("font-size", "1.25rem")).toBe("1.25rem");
    expect(parseValue("font-size", "larger")).toBe("larger");
    expect(parseValue("font-size", "-2")).toBeNull();
    expect(parseValue("font-weight", "450")).toBe("450");
    expect(parseValue("font-weight", "bold")).toBe("bold");
    expect(parseValue("font-weight", "-100")).toBeNull();
    expect(parseValue("letter-spacing", "-0.02em")).toBe("-0.02em");
    expect(parseValue("letter-spacing", "normal")).toBe("normal");
  });

  it("border-radius: a length or a percentage, never negative", () => {
    expect(parseValue("border-radius", "8")).toBe("8px");
    expect(parseValue("border-radius", "50%")).toBe("50%");
    expect(parseValue("border-radius", "-4")).toBeNull();
    expect(stepValue("border-radius", "", 1, "0px")).toBe("1px");
  });

  it("flex-basis: a length or a size keyword", () => {
    expect(parseValue("flex-basis", "200")).toBe("200px");
    expect(parseValue("flex-basis", "50%")).toBe("50%");
    expect(parseValue("flex-basis", "auto")).toBe("auto");
    expect(parseValue("flex-basis", "content")).toBe("content");
    expect(parseValue("flex-basis", "-10")).toBeNull();
  });

  it("z-index: whole numbers, negatives and auto; steps from auto start at 0", () => {
    expect(parseValue("z-index", "10")).toBe("10");
    expect(parseValue("z-index", "-1")).toBe("-1");
    expect(parseValue("z-index", "auto")).toBe("auto");
    expect(parseValue("z-index", "2px")).toBeNull();
    expect(stepValue("z-index", "auto", 1, "auto")).toBe("1");
    expect(stepValue("z-index", "0", -1, "0")).toBe("-1");
  });

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


describe("percent (opacity)", () => {
  it("50 and 50% write 50%; a fraction is its share of 100; within 0–100", () => {
    expect(parseValue("opacity", "50")).toBe("50%");
    expect(parseValue("opacity", "50%")).toBe("50%");
    expect(parseValue("opacity", "0.5")).toBe("50%");
    expect(parseValue("opacity", ".25")).toBe("25%");
    expect(parseValue("opacity", "1")).toBe("1%");
    expect(parseValue("opacity", "1.0")).toBe("100%");
    expect(parseValue("opacity", "0")).toBe("0%");
    expect(parseValue("opacity", "150")).toBe("100%");
    expect(parseValue("opacity", "-10")).toBeNull();
    expect(parseValue("opacity", "var(--fade)")).toBe("var(--fade)");
  });

  it("shows 0–100 without the %, the page's fractions too", () => {
    expect(displayValue("50%", "opacity")).toBe("50");
    expect(displayValue("0.5", "opacity")).toBe("50");
    expect(displayValue("1", "opacity")).toBe("100");
    expect(displayValue("0", "opacity")).toBe("0");
    expect(displayValue("var(--fade)", "opacity")).toBe("var(--fade)");
  });

  it("steps the field's 0–100 by whole numbers within 0–100, an empty field from the computed fraction", () => {
    expect(stepValue("opacity", "50", -1, "0.5")).toBe("49%");
    expect(stepValue("opacity", "50%", 1, "0.5")).toBe("51%");
    expect(stepValue("opacity", "1", 1, "0.01")).toBe("2%");
    expect(stepValue("opacity", "100%", 1, "1")).toBe("100%");
    expect(stepValue("opacity", "0%", -1, "0")).toBe("0%");
    expect(stepValue("opacity", "", -1, "1")).toBe("99%");
  });
});
