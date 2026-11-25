// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { currentToken, insertToken, matchTokens, stepToken, tokenAlong, tokenAt, tokenKindsFor, tokenScale } from "./tokens.ts";

const tokens = [
  { name: "--space-2", value: "8px", kind: "length" as const },
  { name: "--space-4", value: "16px", kind: "length" as const },
  { name: "--radius", value: "12px", kind: "length" as const },
  { name: "--font-sans", value: "Inter, sans-serif", kind: "font" as const },
  { name: "--color-accent", value: "#1cf69e", kind: "color" as const },
];

describe("a field's variables", () => {
  it("fit the property: lengths, colors, fonts, numbers; none where no token fits", () => {
    expect(tokenKindsFor("padding-top")).toEqual(["length"]);
    expect(tokenKindsFor("background-color")).toEqual(["color"]);
    expect(tokenKindsFor("font-family")).toEqual(["font"]);
    expect(tokenKindsFor("opacity")).toEqual(["number"]);
    expect(tokenKindsFor("grid-column-start")).toEqual([]);
  });

  it("`--` at the start or after a space, `(` or `,`, up to the caret", () => {
    expect(tokenAt("--sp", 4)).toEqual({ start: 0, end: 4, query: "sp" });
    expect(tokenAt("calc(--sp", 9)).toEqual({ start: 5, end: 9, query: "sp" });
    expect(tokenAt("8px --", 6)).toEqual({ start: 4, end: 6, query: "" });
    expect(tokenAt("a--b", 4)).toBeNull();
    expect(tokenAt("--sp 2", 6)).toBeNull();
  });

  it("match by name (starting with it first) or by value, only the field's kinds", () => {
    expect(matchTokens(tokens, ["length"], "").map((t) => t.name)).toEqual(["--space-2", "--space-4", "--radius"]);
    expect(matchTokens(tokens, ["length"], "4").map((t) => t.name)).toEqual(["--space-4"]);
    expect(matchTokens(tokens, ["length"], "rad").map((t) => t.name)).toEqual(["--radius"]);
    expect(matchTokens(tokens, ["font"], "inter").map((t) => t.name)).toEqual(["--font-sans"]);
    expect(matchTokens(tokens, ["color"], "#1cf").map((t) => t.name)).toEqual(["--color-accent"]);
  });

  it("the ones meant for the property lead: the spacing scale for a padding, the radii for a radius", () => {
    expect(matchTokens(tokens, ["length"], "", "border-radius").map((t) => t.name)).toEqual(["--radius", "--space-2", "--space-4"]);
    expect(matchTokens(tokens, ["length"], "", "padding-top").map((t) => t.name)).toEqual(["--space-2", "--space-4", "--radius"]);
  });

  it("picked, `var(--name)` goes where the caret is, or just the name inside a var( already", () => {
    expect(insertToken("--sp", { start: 0, end: 4 }, "--space-4")).toEqual({ text: "var(--space-4)", caret: 14 });
    expect(insertToken("calc(--sp)", { start: 5, end: 9 }, "--space-4")).toEqual({ text: "calc(var(--space-4))", caret: 19 });
    expect(insertToken("var(--sp)", { start: 4, end: 8 }, "--space-4")).toEqual({ text: "var(--space-4)", caret: 14 });
    // The button, the whole value selected: it's replaced.
    expect(insertToken("16px", { start: 0, end: 4 }, "--space-4")).toEqual({ text: "var(--space-4)", caret: 14 });
  });
});

describe("stepping a token along its scale", () => {
  const scale = [
    { name: "--space-4", value: "1rem", kind: "length" as const },
    { name: "--space-1", value: "4px", kind: "length" as const },
    { name: "--space-2", value: "0.5rem", kind: "length" as const },
    { name: "--radius-lg", value: "12px", kind: "length" as const },
    { name: "--radius-sm", value: "4px", kind: "length" as const },
    { name: "--radius-full", value: "9999px", kind: "length" as const },
    { name: "--text-lg", value: "clamp(1rem, 2vw, 1.25rem)", kind: "length" as const },
    { name: "--text-sm", value: "clamp(0.8rem, 1vw, 0.9rem)", kind: "length" as const },
    { name: "--gray-500", value: "#6b7280", kind: "color" as const },
    { name: "--gray-100", value: "#f3f4f6", kind: "color" as const },
    { name: "--gray-900", value: "#111827", kind: "color" as const },
    { name: "--font-sans", value: "Inter", kind: "font" as const },
    { name: "--font-serif", value: "Georgia", kind: "font" as const },
    { name: "--gutter", value: "20px", kind: "length" as const },
  ];
  const names = (name: string) => tokenScale(scale, name)?.map((t) => t.name) ?? null;

  it("a scale is the tokens named like it but for the last part, by value, else by that part", () => {
    expect(names("--space-2")).toEqual(["--space-1", "--space-2", "--space-4"]);
    expect(names("--radius-sm")).toEqual(["--radius-sm", "--radius-lg", "--radius-full"]);
    expect(names("--text-sm")).toEqual(["--text-sm", "--text-lg"]);
    expect(names("--gray-900")).toEqual(["--gray-100", "--gray-500", "--gray-900"]);
    expect(names("--font-sans")).toBeNull();
    expect(names("--gutter")).toBeNull();
  });

  it("↑/↓ moves one token along it, whatever the step, and stays at the ends", () => {
    expect(stepToken("var(--space-2)", 1, scale, ["length"])).toBe("var(--space-4)");
    expect(stepToken("var(--space-2)", -10, scale, ["length"])).toBe("var(--space-1)");
    expect(stepToken("var(--space-4)", 1, scale, ["length"])).toBe("var(--space-4)");
    expect(stepToken("var(--gray-100)", 1, scale, ["color"])).toBe("var(--gray-500)");
    expect(stepToken("--space-1", 1, scale, ["length"])).toBe("var(--space-2)"); // as the field shows it
  });

  it("a Shift drag goes `offset` tokens along it, held at the ends; none that way (at an end), or no scale: null, the number then", () => {
    expect(tokenAlong("var(--space-1)", 2, scale, ["length"])).toBe("var(--space-4)");
    expect(tokenAlong("var(--space-1)", 9, scale, ["length"])).toBe("var(--space-4)"); // held at the end
    expect(tokenAlong("--space-2", -1, scale, ["length"])).toBe("var(--space-1)");
    expect(tokenAlong("var(--space-2)", 0, scale, ["length"])).toBe("var(--space-2)");
    expect(tokenAlong("var(--space-4)", 1, scale, ["length"])).toBeNull(); // nothing further: the number
    expect(tokenAlong("var(--space-1)", -3, scale, ["length"])).toBeNull();
    expect(tokenAlong("var(--gutter)", 1, scale, ["length"])).toBeNull();
    expect(tokenAlong("12px", 1, scale, ["length"])).toBeNull();
  });

  it("anything else steps its number instead: no scale, math, a token of another kind", () => {
    expect(stepToken("var(--gutter)", 1, scale, ["length"])).toBeNull();
    expect(stepToken("var(--space-2) + 4px", 1, scale, ["length"])).toBeNull();
    expect(stepToken("12px", 1, scale, ["length"])).toBeNull();
    expect(stepToken("var(--gray-100)", 1, scale, ["length"])).toBeNull();
  });
});

describe("currentToken", () => {
  it("the whole value when it's one variable; else the one at the caret; none for a number or a selection across math", () => {
    expect(currentToken("--space-4", 0, 9)).toEqual({ name: "--space-4", start: 0, end: 9 });
    expect(currentToken("var(--space-4)", 0, 0)).toEqual({ name: "--space-4", start: 0, end: 14 });
    const math = "calc(var(--space-2) * 2)";
    expect(currentToken(math, 12, 12)).toEqual({ name: "--space-2", start: 5, end: 19 });
    expect(currentToken(math, 22, 22)).toBeNull(); // on the 2
    expect(currentToken(math, 0, math.length)).toBeNull();
    expect(currentToken("16px", 0, 4)).toBeNull();
  });
});
