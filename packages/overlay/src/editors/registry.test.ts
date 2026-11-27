import { describe, expect, it } from "vitest";
import { abbreviationPenalty, matchEditors, searchEditors } from "./registry.ts";
import type { PropertyEditor } from "./types.ts";

const stub = (id: string, properties: string[]): PropertyEditor => ({
  id,
  label: id,
  properties,
  component: () => null,
});

const list = [stub("opacity", ["opacity"]), stub("padding", ["padding"]), stub("gap", ["gap", "row-gap", "column-gap"])];

describe("searchEditors", () => {
  it("matches by prefix", () => {
    expect(searchEditors("opa", list).map((e) => e.id)).toEqual(["opacity"]);
  });
  it("only searches names, properties and aliases: no extra keywords", () => {
    expect(searchEditors("fade", list)).toEqual([]);
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

  it("finds padding by p, pt, pr, pl, padding, padding-top", async () => {
    const { editors } = await import("./registry.ts");
    for (const q of ["p", "pt", "py", "pr", "pl", "pad", "padding", "padding-top"]) {
      expect(searchEditors(q, editors)[0]?.id, q).toBe("padding");
    }
  });

  it("finds the built-in width editor by w, width", async () => {
    const { editors } = await import("./registry.ts");
    for (const q of ["w", "wid", "width"]) {
      expect(searchEditors(q, editors)[0]?.id, q).toBe("width");
    }
  });

  it("transform lands on the Transform row (translate, rotate, scale and skew are in its panel), with transform-origin and transform-style", () => {
    const ids = (q: string) => matchEditors(q).map((e) => e.id);
    expect(ids("transform")).toEqual(["transform", "transform-origin", "transform-style"]);
    // translate, rotate and scale are its panel's rows: their names find it.
    for (const q of ["rotate", "translate", "scale"]) expect(ids(q)[0]).toBe("transform");
  });

  it("finds object-fit, isolation and overflow by their names and Tailwind's", async () => {
    const { editors } = await import("./registry.ts");
    const cases: Record<string, string[]> = {
      "object-fit": ["object-fit", "object", "object-cover", "object-scale-down"],
      isolation: ["isolation", "isolate", "isolation-auto"],
      overflow: ["overflow", "overflow-hidden", "overflow-auto"],
      "object-position": ["object-position", "object-top-left", "object-center", "object-bottom"],
    };
    for (const [id, queries] of Object.entries(cases)) {
      for (const q of queries) expect(searchEditors(q, editors)[0]?.id, q).toBe(id);
    }
  });

  it("finds the text, blend, interactivity and SVG editors by their names and Tailwind's", async () => {
    const { editors } = await import("./registry.ts");
    const cases: Record<string, string[]> = {
      "box-sizing": ["box-sizing", "box-border", "box-content"],
      float: ["float", "float-left", "float-start", "float-none"],
      "overscroll-behavior": ["overscroll", "overscroll-behavior", "overscroll-contain"],
      "font-variant-numeric": ["font-numeric", "font-variant-numeric", "tabular-nums", "slashed-zero"],
      "line-clamp": ["line-clamp", "-webkit-line-clamp"],
      "text-overflow": ["text-overflow", "text-ellipsis", "truncate"],
      "text-wrap": ["text-wrap", "text-balance", "text-pretty", "text-nowrap"],
      "text-indent": ["text-indent", "indent"],
      "vertical-align": ["vertical-align", "vertical", "align-middle", "align-text-top", "align-super"],
      "text-transform": ["text-transform", "uppercase", "lowercase", "capitalize", "normal-case"],
      "white-space": ["white-space", "whitespace"],
      "list-style-type": ["list-style-type", "list-disc", "list-decimal", "list-none"],
      "list-style-position": ["list-style-position", "list-position", "list-inside", "list-outside"],
      "mix-blend-mode": ["mix-blend-mode", "mix-blend"],
      "background-blend-mode": ["background-blend-mode", "bg-blend", "bg-blend-mode"],
      cursor: ["cursor"],
      "pointer-events": ["pointer-events"],
      "user-select": ["user-select", "select"],
      appearance: ["appearance"],
      "will-change": ["will-change"],
      fill: ["fill"],
      stroke: ["stroke"],
      "stroke-width": ["stroke-width"],
      // What line-clamp also writes doesn't find it.
      display: ["display"],
      overflow: ["overflow"],
    };
    for (const [id, queries] of Object.entries(cases)) {
      for (const q of queries) expect(searchEditors(q, editors)[0]?.id, q).toBe(id);
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
    expect(await ids("min")).toEqual(["min-width", "min-height"]); // tied: both
    expect(await ids("max-w")).toEqual(["max-width"]);
    expect(await ids("max")).toEqual(["max-width", "max-height"]);
  });

  it("ignores hyphens and spaces: minw, min w, minwidth", async () => {
    for (const q of ["minw", "min w", "MIN-W", "minwidth", "min width"]) expect(await ids(q), q).toEqual(["min-width"]);
    for (const q of ["maxw", "max w", "maxwidth"]) expect(await ids(q), q).toEqual(["max-width"]);
    expect(await ids("paddingtop")).toEqual(["padding"]);
  });

  it("abbreviations: the letters in order, from a word start", async () => {
    expect(await ids("wdt")).toEqual(["width", "min-width", "max-width"]);
    expect(await ids("wd")).toEqual(["width", "min-width", "max-width"]);
    expect(await ids("pdg")).toEqual(["padding"]);
    expect(await ids("mxw")).toEqual(["max-width"]);
    expect(await ids("mnw")).toEqual(["min-width"]);
    expect(await ids("xyz")).toEqual([]);
  });

  it("padding uses Tailwind's aliases: one editor for all of them", async () => {
    for (const q of ["p", "pad", "padding", "PADDING", "px", "py", "pt", "pb", "padding-left"]) {
      expect(await ids(q), q).toEqual(["padding"]);
    }
  });

  it("margin uses Tailwind's aliases", async () => {
    for (const q of ["m", "mt", "mx", "ms", "margin", "margin-top", "margin-inline"]) expect(await ids(q), q).toEqual(["margin"]);
  });

  it("height works like width: h brings the family, min-h and max-h one each", async () => {
    for (const q of ["h", "height"]) expect(await ids(q), q).toEqual(["height", "min-height", "max-height"]);
    expect(await ids("min-h")).toEqual(["min-height"]);
    expect(await ids("max-height")).toEqual(["max-height"]);
  });

  it("other properties are unaffected", async () => {
    expect(await ids("m")).toEqual(["margin"]);
    expect(await ids("")).toEqual([]);
    expect(await ids("zz")).toEqual([]);
  });

  it("shows every editor tied for a prefix-or-better match, but only the top substring match", () => {
    const list = [stub("min-width", ["min-width"]), stub("min-height", ["min-height"]), stub("gap", ["gap"])];
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

  it("a word being typed beats letters inside one: spa is col-span", () => {
    expect(matchEditors("spa").map((e) => e.id)).toEqual(["grid-column"]);
    expect(matchEditors("span").map((e) => e.id)).toEqual(["grid-column"]);
    expect(matchEditors("ite").map((e) => e.id)).toEqual(["align-items"]);
    expect(matchEditors("items").map((e) => e.id)).toEqual(["align-items"]);
    expect(matchEditors("justify").map((e) => e.id)).toEqual(["justify-content", "justify-items", "justify-self"]);
  });

  it("flex-direction and flex-wrap: their names and Tailwind's; flex stays display", async () => {
    const { editors } = await import("./registry.ts");
    const ids = async (q: string) => matchEditors(q, editors).map((e) => e.id);
    for (const q of ["flex-direction", "flex-row", "flex-col", "flex-col-reverse"]) expect(await ids(q), q).toEqual(["flex-direction"]);
    for (const q of ["flex-wrap", "flex-nowrap", "flex-wrap-reverse"]) expect(await ids(q), q).toEqual(["flex-wrap"]);
    expect(await ids("flex")).toEqual(["display"]);
  });

  it("typography: by name and Tailwind's font-*, text, italic, leading, tracking", async () => {
    const { editors } = await import("./registry.ts");
    const ids = async (q: string) => matchEditors(q, editors).map((e) => e.id);
    // All five: prefix ties aren't capped.
    expect(await ids("font")).toEqual(["font-family", "font-size", "font-style", "font-weight", "font-variant-numeric"]);
    for (const [q, id] of [
      ["font-family", "font-family"],
      ["font-sans", "font-family"],
      ["font-size", "font-size"],
      ["italic", "font-style"],
      ["font-bold", "font-weight"],
      ["weight", "font-weight"],
      ["line-height", "line-height"],
      ["leading", "line-height"],
      ["letter-spacing", "letter-spacing"],
      ["tracking", "letter-spacing"],
      ["text-align", "text-align"],
      ["text-left", "text-align"],
      ["text-justify", "text-align"],
      ["text-end", "text-align"],
      ["text-lg", "font-size"],
      ["text-2xl", "font-size"],
    ] as const) {
      expect(await ids(q), q).toEqual([id]);
    }
    // text is the text-* properties (Tailwind's text-lg still finds font-size).
    expect(await ids("text")).toEqual([
      "text-align",
      "text-indent",
      "text-wrap",
      "text-overflow",
      "text-decoration-line",
      "text-decoration-color",
      "text-decoration-style",
      "text-decoration-thickness",
      "text-underline-offset",
      "text-transform",
    ]);
    // size still finds the size editor (width and height), not font-size.
    expect(await ids("size")).toEqual(["size"]);
  });

  it("flex-grow, flex-shrink, flex-basis: by name and Tailwind's grow, shrink, basis", async () => {
    const { editors } = await import("./registry.ts");
    const ids = async (q: string) => matchEditors(q, editors).map((e) => e.id);
    for (const [q, id] of [
      ["flex-grow", "flex-grow"],
      ["grow", "flex-grow"],
      ["flex-shrink", "flex-shrink"],
      ["shrink", "flex-shrink"],
      ["flex-basis", "flex-basis"],
      ["basis", "flex-basis"],
    ] as const) {
      expect(await ids(q), q).toEqual([id]);
    }
  });
});

