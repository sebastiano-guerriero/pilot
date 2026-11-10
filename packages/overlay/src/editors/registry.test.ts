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
  it("matches Tailwind-style aliases exactly, ranked first", () => {
    const withAliases = [stub("position", ["position"]), { ...stub("padding", ["padding-top"]), aliases: ["p", "pt", "px"] }];
    expect(searchEditors("p", withAliases).map((e) => e.id)[0]).toBe("padding");
    expect(searchEditors("pt", withAliases).map((e) => e.id)).toEqual(["padding"]);
    expect(searchEditors("PX", withAliases).map((e) => e.id)).toEqual(["padding"]);
  });

  it("finds the built-in padding editor by p, pt, padding", async () => {
    const { editors } = await import("./registry.ts");
    for (const q of ["p", "pt", "pr", "pb", "pl", "px", "py", "pad", "padding", "padding-top", "spacing"]) {
      expect(searchEditors(q, editors)[0]?.id, q).toBe("padding");
    }
  });

  it("returns everything for an empty query", () => {
    expect(searchEditors("  ", list)).toHaveLength(3);
  });
});
