import { describe, expect, it } from "vitest";
import { MASK_COMPOSITE_VALUES } from "../../css/properties.ts";
import { clearsView, groupOf } from "../listOrder.ts";
import { matchEditors } from "../registry.ts";

describe("mask-composite", () => {
  it("is found by its name and Tailwind's classes", () => {
    for (const q of ["mask-composite", "composite", "mask-intersect", "mask-add"]) {
      expect(matchEditors(q).map((e) => e.id), q).toContain("mask-composite");
    }
  });

  it("offers CSS's four, its default first", () => {
    expect([...MASK_COMPOSITE_VALUES]).toEqual(["add", "subtract", "intersect", "exclude"]);
  });

  it("is in Visibility and, like a radius, hides the highlights when changed; visibility doesn't", () => {
    expect(groupOf("mask-composite")).toBe("Visibility");
    expect(clearsView("mask-composite")).toBe(true);
    expect(clearsView("visibility")).toBe(false);
  });
});
