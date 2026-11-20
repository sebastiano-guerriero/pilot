// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { copiedProperties, copyProperties, cssText, rowEntries } from "./propertyClipboard.ts";

describe("a row's properties to copy", () => {
  it("the ones set; a shorthand set itself stands for its longhands", () => {
    const props = ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left"];
    expect(rowEntries(props, { padding: "10px 18px", "padding-top": "10px", "padding-right": "18px", "padding-bottom": "10px", "padding-left": "18px" })).toEqual([
      ["padding", "10px 18px"],
    ]);
    expect(rowEntries(props, { "padding-top": "4px", "padding-left": "8px" })).toEqual([
      ["padding-top", "4px"],
      ["padding-left", "8px"],
    ]);
  });

  it("as CSS, a declaration a line; copied, kept for a paste (nothing set: nothing kept)", () => {
    const entries = rowEntries(["-webkit-line-clamp", "overflow"], { "-webkit-line-clamp": "3", overflow: "hidden" });
    expect(cssText(entries)).toBe("-webkit-line-clamp: 3;\noverflow: hidden;");
    copyProperties(entries);
    expect(copiedProperties()).toEqual(entries);
    copyProperties([]);
    expect(copiedProperties()).toBeNull();
  });
});
