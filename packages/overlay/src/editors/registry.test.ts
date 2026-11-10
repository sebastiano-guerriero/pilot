import { describe, expect, it } from "vitest";
import { searchEditors } from "./registry.ts";
import type { PropertyEditor } from "./types.ts";

const stub = (id: string, properties: string[], keywords?: string[]): PropertyEditor => ({
  id,
  label: id,
  properties,
  keywords,
  component: () => null,
});

const list = [stub("opacity", ["opacity"], ["transparency", "fade"]), stub("padding", ["padding"]), stub("gap", ["gap", "row-gap", "column-gap"])];

describe("searchEditors", () => {
  it("matches by prefix", () => {
    expect(searchEditors("opa", list).map((e) => e.id)).toEqual(["opacity"]);
  });
  it("matches by keyword", () => {
    expect(searchEditors("fade", list).map((e) => e.id)).toEqual(["opacity"]);
  });
  it("ranks exact matches above partial ones", () => {
    expect(searchEditors("gap", list).map((e) => e.id)[0]).toBe("gap");
  });
  it("returns everything for an empty query", () => {
    expect(searchEditors("  ", list)).toHaveLength(3);
  });
});
