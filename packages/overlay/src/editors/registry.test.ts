import { describe, expect, it } from "vitest";
import { abbreviationPenalty, matchEditors, searchEditors } from "./registry.ts";
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
    // Ranked first; weaker matches (position as an abbreviation of "pt") come
    // after it in the full ranking, but the dialog only shows the best.
    expect(searchEditors("pt", withAliases).map((e) => e.id)[0]).toBe("padding");
    expect(matchEditors("pt", withAliases).map((e) => e.id)).toEqual(["padding"]);
    expect(matchEditors("PX", withAliases).map((e) => e.id)).toEqual(["padding"]);
  });

  it("finds the padding rows by p, pt, padding", async () => {
    const { editors } = await import("./registry.ts");
    for (const q of ["p", "pt", "py", "pad", "padding", "padding-top", "spacing"]) {
      expect(searchEditors(q, editors)[0]?.id, q).toBe("padding-top");
    }
    expect(searchEditors("pr", editors)[0]?.id).toBe("padding-right");
    expect(searchEditors("pl", editors)[0]?.id).toBe("padding-left");
  });

  it("finds the built-in width editor by w, width", async () => {
    const { editors } = await import("./registry.ts");
    for (const q of ["w", "wid", "width", "size"]) {
      expect(searchEditors(q, editors)[0]?.id, q).toBe("width");
    }
  });

  it("returns everything for an empty query", () => {
    expect(searchEditors("  ", list)).toHaveLength(3);
  });
});

describe("matchEditors (what the dialog shows)", () => {
  const ids = async (q: string) => {
    const { editors } = await import("./registry.ts");
    return matchEditors(q, editors).map((e) => e.id);
  };

  it("a query on the family's main property brings the whole family", async () => {
    for (const q of ["w", "wid", "width", "WIDTH"]) expect(await ids(q), q).toEqual(["width", "min-width", "max-width"]);
  });

  it("a query on a member shows just that member", async () => {
    expect(await ids("min-w")).toEqual(["min-width"]);
    expect(await ids("min-width")).toEqual(["min-width"]);
    expect(await ids("min")).toEqual(["min-width"]);
    expect(await ids("max-w")).toEqual(["max-width"]);
    expect(await ids("max")).toEqual(["max-width"]);
  });

  it("ignores hyphens and spaces: minw, min w, minwidth", async () => {
    for (const q of ["minw", "min w", "MIN-W", "minwidth", "min width"]) expect(await ids(q), q).toEqual(["min-width"]);
    for (const q of ["maxw", "max w", "maxwidth"]) expect(await ids(q), q).toEqual(["max-width"]);
    expect(await ids("paddingtop")).toEqual(["padding-top"]);
  });

  it("abbreviations: the letters in order, from a word start", async () => {
    expect(await ids("wdt")).toEqual(["width", "min-width", "max-width"]);
    expect(await ids("wd")).toEqual(["width", "min-width", "max-width"]);
    expect(await ids("pdg")).toEqual(["padding-top", "padding-right", "padding-bottom", "padding-left"]);
    expect(await ids("mxw")).toEqual(["max-width"]);
    expect(await ids("mnw")).toEqual(["min-width"]);
    expect(await ids("xyz")).toEqual([]);
  });

  it("padding rows follow Tailwind: p all four, px/py two, pt one", async () => {
    const all = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
    for (const q of ["p", "pad", "padding", "PADDING"]) expect(await ids(q), q).toEqual(all);
    expect(await ids("px")).toEqual(["padding-right", "padding-left"]);
    expect(await ids("py")).toEqual(["padding-top", "padding-bottom"]);
    expect(await ids("pt")).toEqual(["padding-top"]);
    expect(await ids("pb")).toEqual(["padding-bottom"]);
    expect(await ids("padding-left")).toEqual(["padding-left"]);
  });

  it("margin and border use Tailwind's aliases", async () => {
    for (const q of ["m", "mt", "mx", "margin", "margin-top"]) expect(await ids(q), q).toEqual(["margin"]);
    for (const q of ["border", "border-t", "border-x", "bordertop", "border-top-width"]) expect(await ids(q), q).toEqual(["border"]);
  });

  it("other properties are unaffected", async () => {
    expect(await ids("m")).toEqual(["margin"]);
    expect(await ids("border")).toEqual(["border"]);
    expect(await ids("")).toEqual([]);
    expect(await ids("zz")).toEqual([]);
  });

  it("shows every editor tied for a prefix-or-better match, but only the top substring match", () => {
    const list = [stub("min-width", ["min-width"]), stub("min-height", ["min-height"]), stub("gap", ["gap"], ["spacing"])];
    expect(matchEditors("min", list).map((e) => e.id)).toEqual(["min-width", "min-height"]);
    expect(matchEditors("i", list).map((e) => e.id)).toHaveLength(1);
  });
});

describe("abbreviationPenalty", () => {
  it("counts the letters skipped, starting at a word start", () => {
    expect(abbreviationPenalty("wdt", "width")).toBe(1);
    expect(abbreviationPenalty("mxw", "max-width")).toBe(1);
    expect(abbreviationPenalty("wdt", "min-width")).toBe(2); // from a later word: one step worse
    expect(abbreviationPenalty("dt", "width")).toBeNull(); // d doesn't start a word
    expect(abbreviationPenalty("wtd", "width")).toBeNull(); // out of order
  });
});
