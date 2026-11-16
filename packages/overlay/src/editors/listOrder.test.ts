import { describe, expect, it } from "vitest";
import { displayRows } from "./display/DisplayEditor.tsx";
import { inListOrder, LIST_ORDER, listedIds, rowsOf } from "./listOrder.ts";
import { editors } from "./registry.ts";

describe("LIST_ORDER", () => {
  it("has a place for every editor that can be listed (those that write properties)", () => {
    const placed = new Set(listedIds());
    const missing = editors.filter((e) => e.properties.length > 0 && !placed.has(e.id)).map((e) => e.id);
    expect(missing, "add these to LIST_ORDER in editors/listOrder.ts").toEqual([]);
  });

  it("lists each entry once", () => {
    const entries = LIST_ORDER.flatMap((g) => g.entries).map((e) => (typeof e === "string" ? e : e.id));
    expect(entries.length).toBe(new Set(entries).size);
  });

  it("display's rows: grid and flex, each in its own order, inline- variants alike", () => {
    expect(rowsOf("display", "grid")).toEqual(["grid-columns", "gap", "justify-content", "align-items"]);
    expect(rowsOf("display", "inline-flex")).toEqual(["flex-direction", "flex-wrap", "gap", "justify-content", "align-items"]);
    expect(rowsOf("display", "block")).toEqual([]);
    // Every row named there is one display can show.
    for (const value of ["grid", "flex"]) {
      expect(displayRows(value).map((e) => e.id)).toEqual([...rowsOf("display", value)]);
    }
  });

  it("sorts editors by it: display, its rows when on their own, then the rest; col-span… last in layout", () => {
    const byId = (id: string) => editors.find((e) => e.id === id)!;
    const sorted = inListOrder(
      ["grid-column", "margin", "gap", "display", "height", "padding", "order", "width", "aspect-ratio"].map(byId),
    );
    expect(sorted.map((e) => e.id)).toEqual([
      "display",
      "gap",
      "width",
      "height",
      "aspect-ratio",
      "padding",
      "margin",
      "order",
      "grid-column",
    ]);
  });
});
