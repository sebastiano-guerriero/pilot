import { describe, expect, it } from "vitest";
import { isModifierQuery, matchModifiers } from "./modifiers.ts";

const ids = (text: string) => matchModifiers(text).map((m) => m.id);

describe("modifiers", () => {
  it("a search starting with / is for modifiers", () => {
    expect(isModifierQuery("/")).toBe(true);
    expect(isModifierQuery("/fr")).toBe(true);
    expect(isModifierQuery("pt")).toBe(false);
  });

  it("/ alone lists them all; typing filters by name word or syntax", () => {
    expect(ids("/")).toEqual(["from-width", "to-width", "base", "all-widths", "hover", "focus", "focus-visible", "active"]);
    expect(ids("/fr")).toEqual(["from-width"]);
    expect(ids("/to")).toEqual(["to-width"]);
    expect(ids("/width")).toEqual(["from-width", "to-width", "all-widths"]);
    expect(ids("/base")).toEqual(["base"]);
    expect(ids("/all")).toEqual(["all-widths"]);
    expect(ids("/from-7")).toEqual(["from-width"]);
    expect(ids("/hover")).toEqual(["hover"]);
    expect(ids("/focus")).toEqual(["focus", "focus-visible"]);
    expect(ids("/visible")).toEqual(["focus-visible"]);
    expect(ids("/xyz")).toEqual([]);
  });
});
