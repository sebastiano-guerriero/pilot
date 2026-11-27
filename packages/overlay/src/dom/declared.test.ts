// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beats,
  declaredValue,
  declaredWithout,
  isFromReset,
  matchedRules as matchedRulesFor,
  backgroundColor,
  pickSide,
  resolve,
  sourcesOf,
  specificity,
  splitTopLevel,
} from "./declared.ts";
import { SELECT_CURSOR_STYLE_ID } from "./preview.ts";

describe("specificity", () => {
  it("counts ids, classes/attributes/pseudo-classes, and types/pseudo-elements", () => {
    expect(specificity("div")).toEqual([0, 0, 1]);
    expect(specificity(".a.b")).toEqual([0, 2, 0]);
    expect(specificity("#x .a > p")).toEqual([1, 1, 1]);
    expect(specificity('a[href^="http"]:hover::before')).toEqual([0, 2, 2]);
    expect(specificity("*")).toEqual([0, 0, 0]);
  });

  it(":is/:not/:has take their most specific argument; :where counts nothing", () => {
    expect(specificity(":is(#a, .b) span")).toEqual([1, 0, 1]);
    expect(specificity("div:not(.x, .y.z)")).toEqual([0, 2, 1]);
    expect(specificity(":where(#a .b) p")).toEqual([0, 0, 1]);
    expect(specificity("li:nth-child(2n of .on)")).toEqual([0, 2, 1]);
  });

  it("reads escaped class names, like Tailwind's", () => {
    expect(specificity(".md\\:px-4")).toEqual([0, 1, 0]);
    expect(specificity(".w-1\\/2:hover")).toEqual([0, 2, 0]);
  });
});

describe("splitTopLevel", () => {
  it("splits selector lists and values, not what's inside parentheses or quotes", () => {
    expect(splitTopLevel(".a, :is(.b, .c), [d=',']", ",")).toEqual([".a", ":is(.b, .c)", "[d=',']"]);
    expect(splitTopLevel("calc(1px + 2px) var(--x, 4px)", " ")).toEqual(["calc(1px + 2px)", "var(--x, 4px)"]);
  });
});

describe("shorthands and logical properties", () => {
  it("a side can come from its logical longhand, the logical pair, or the shorthand", () => {
    expect(sourcesOf("padding-left").map((s) => s.property)).toEqual([
      "padding-left",
      "padding-inline-start",
      "padding-inline",
      "padding",
    ]);
    expect(sourcesOf("margin-bottom").map((s) => s.property)).toEqual([
      "margin-bottom",
      "margin-block-end",
      "margin-block",
      "margin",
    ]);
    // inset's sides have no prefix: `top` comes from inset-block-start, inset-block, inset.
    expect(sourcesOf("top")).toEqual([
      { property: "top" },
      { property: "inset-block-start" },
      { property: "inset-block", side: { of: "pair", index: 0 } },
      { property: "inset", side: { of: "box", index: 0 } },
    ]);
    expect(sourcesOf("left").map((s) => s.property)).toEqual(["left", "inset-inline-start", "inset-inline", "inset"]);
    expect(sourcesOf("width")).toEqual([{ property: "width" }]);
  });

  it("picks a side's value from a shorthand's text", () => {
    expect(pickSide("10px 18px", { of: "box", index: 1 })).toBe("18px");
    expect(pickSide("1px 2px 3px", { of: "box", index: 3 })).toBe("2px");
    expect(pickSide("calc(var(--spacing) * 4)", { of: "box", index: 2 })).toBe("calc(var(--spacing) * 4)");
    expect(pickSide("8px 12px", { of: "pair", index: 1 })).toBe("12px");
    expect(pickSide("1px 2px 3px 4px 5px", { of: "box", index: 0 })).toBeNull();
  });
});

describe("the cascade", () => {
  const rule = (layer: number[], specificity: [number, number, number], order: number) => ({
    layer,
    specificity,
    order,
  });
  const normal = (r: ReturnType<typeof rule>) => ({ important: false, rule: r });
  const important = (r: ReturnType<typeof rule>) => ({ important: true, rule: r });
  const UNLAYERED = [Number.POSITIVE_INFINITY];

  it("important beats normal, whatever the specificity", () => {
    expect(beats(important(rule(UNLAYERED, [0, 0, 1], 0)), normal(rule(UNLAYERED, [1, 0, 0], 1)))).toBe(true);
  });

  it("then specificity, then order of appearance", () => {
    expect(beats(normal(rule(UNLAYERED, [0, 2, 0], 0)), normal(rule(UNLAYERED, [0, 1, 5], 9)))).toBe(true);
    expect(beats(normal(rule(UNLAYERED, [0, 1, 0], 2)), normal(rule(UNLAYERED, [0, 1, 0], 1)))).toBe(true);
  });

  it("layers: unlayered and later layers win normal declarations; important ones flip", () => {
    const base = [0, Number.POSITIVE_INFINITY]; // @layer base
    const utilities = [1, Number.POSITIVE_INFINITY]; // @layer utilities, declared after base
    // A later layer wins even against higher specificity in an earlier one.
    expect(beats(normal(rule(utilities, [0, 1, 0], 0)), normal(rule(base, [1, 0, 0], 1)))).toBe(true);
    // Unlayered beats any layer.
    expect(beats(normal(rule(UNLAYERED, [0, 0, 1], 0)), normal(rule(utilities, [1, 0, 0], 1)))).toBe(true);
    // Important: earlier layers win, and layered beats unlayered.
    expect(beats(important(rule(base, [0, 0, 1], 0)), important(rule(utilities, [0, 1, 0], 1)))).toBe(true);
    expect(beats(important(rule(base, [0, 0, 1], 0)), important(rule(UNLAYERED, [0, 1, 0], 1)))).toBe(true);
  });

  it("styles directly in a layer beat its sub-layers", () => {
    const direct = [0, Number.POSITIVE_INFINITY]; // in @layer a
    const sub = [0, 0, Number.POSITIVE_INFINITY]; // in @layer a.b
    expect(beats(normal(rule(direct, [0, 0, 1], 0)), normal(rule(sub, [0, 1, 0], 1)))).toBe(true);
  });
});

describe("isFromReset", () => {
  const rule = (selector: string, value = "0") => ({ value, important: false, source: { selector } });
  it("a rule for every element: *, :where(*), :is(*), any value", () => {
    for (const s of ["*", " * ", ":where(*)", ":is( * )", "::before", "::after", ":after", "*::after", "::placeholder", "::backdrop"])
      expect(isFromReset(rule(s, "border-box"), "box-sizing"), s).toBe(true);
  });
  it("a rule for a kind of element (button, h1, :where(input)) only when it sets nothing of its own: inherit, or the property's default", () => {
    for (const s of ["button", " h1 ", ":where(input)", "input::file-selector-button", "my-element"]) expect(isFromReset(rule(s, "inherit"), "color"), s).toBe(true);
    expect(isFromReset(rule("button", "0"), "border-top-left-radius")).toBe(true);
    expect(isFromReset(rule("button", "0px"), "border-top-left-radius")).toBe(true);
    expect(isFromReset(rule("button", "transparent"), "background-color")).toBe(true);
    expect(isFromReset(rule("button", "1"), "opacity")).toBe(true);
    // What it sets on purpose: a project's heading, preflight's image.
    expect(isFromReset(rule("h1", "2rem"), "font-size")).toBe(false);
    expect(isFromReset(rule("img", "block"), "display")).toBe(false);
    expect(isFromReset(rule("button", "4px"), "border-top-left-radius")).toBe(false);
  });
  it("not an element's own rule, the style attribute, or nothing", () => {
    for (const s of ["*.card", ".card", "button.primary", "button:hover", "nav a", "a[href]", "#main", "html *", "* + *", "*:hover", ".card::after", "::selection"])
      expect(isFromReset(rule(s, "inherit"), "color"), s).toBe(false);
    expect(isFromReset({ value: "0", important: false, source: "inline" }, "margin-top")).toBe(false);
    expect(isFromReset(null, "margin-top")).toBe(false);
  });
});

describe("declaredValue (with real stylesheets)", () => {
  let style: HTMLStyleElement;
  let element: HTMLElement;
  const sheet = (css: string) => {
    style.textContent = css;
  };

  beforeEach(() => {
    style = document.createElement("style");
    document.head.append(style);
    element = document.createElement("div");
    element.className = "card wide";
    element.id = "main";
    document.body.append(element);
  });
  afterEach(() => {
    style.remove();
    element.remove();
  });

  it("finds a value set by a stylesheet, as written (not computed)", () => {
    sheet(".card { max-width: 50%; }");
    expect(declaredValue(element, "max-width")).toMatchObject({
      value: "50%",
      important: false,
      source: { selector: ".card" },
    });
  });

  it("nothing declared: null", () => {
    sheet(".other { max-width: 50%; }");
    expect(declaredValue(element, "max-width")).toBeNull();
  });

  it("leaves out select mode's crosshair cursor: it's Pilot's, not the page's", () => {
    sheet(".card { cursor: pointer; }");
    const cursor = document.createElement("style");
    cursor.id = SELECT_CURSOR_STYLE_ID;
    cursor.textContent = "html, html *:not(pilot-root) { cursor: crosshair !important; }";
    document.head.append(cursor);
    // happy-dom doesn't set it; browsers do.
    const own = Array.from(document.styleSheets).find((s) => Array.from(s.cssRules).some((r) => r.cssText.includes("crosshair")));
    if (own && !own.ownerNode) Object.defineProperty(own, "ownerNode", { value: cursor });
    expect(declaredValue(element, "cursor")?.value).toBe("pointer");
    cursor.remove();
  });

  it("the more specific rule wins; at equal specificity, the later one", () => {
    sheet("#main { width: 10px; } .card.wide { width: 20px; } .card { width: 30px; }");
    expect(declaredValue(element, "width")?.value).toBe("10px");
    sheet(".card { width: 1px; } .wide { width: 2px; }");
    expect(declaredValue(element, "width")?.value).toBe("2px");
  });

  it("inline beats rules, unless a rule is !important", async () => {
    sheet("#main { width: 10px; }");
    element.style.width = "99px";
    expect(declaredValue(element, "width")).toMatchObject({ value: "99px", source: "inline" });
    sheet(".card { width: 5px !important; }");
    // Matched rules are cached until the end of the task; happy-dom (unlike
    // browsers) keeps the same stylesheet object when a <style>'s text changes.
    await Promise.resolve();
    expect(declaredValue(element, "width")).toMatchObject({ value: "5px", important: true });
  });

  it("a corner comes from border-radius, filled as a box's sides; its elliptical form isn't one value per corner", () => {
    sheet(".card { border-radius: var(--r, 8px) 4px; }");
    expect(declaredValue(element, "border-top-left-radius")?.value).toBe("var(--r, 8px)");
    expect(declaredValue(element, "border-bottom-left-radius")?.value).toBe("4px");
    expect(pickSide("10px / 20px", { of: "box", index: 0 })).toBeNull();
  });

  it("a side comes from a shorthand", () => {
    sheet(".card { padding: 10px 18px; }");
    expect(declaredValue(element, "padding-right")?.value).toBe("18px");
    expect(declaredValue(element, "padding-top")?.value).toBe("10px");
  });

  it("rules in a @media that doesn't apply are ignored", () => {
    sheet("@media print { .card { width: 1px; } } .wide { min-width: 3px; }");
    expect(declaredValue(element, "width")).toBeNull();
    expect(declaredValue(element, "min-width")?.value).toBe("3px");
  });

  it("declaredWithout: the next declaration once the winner (or the inline style) is left out", () => {
    sheet(".card { gap: 8px; } #main { gap: 16px; }");
    element.style.gap = "4px";
    const winner = declaredValue(element, "gap");
    expect(winner?.value).toBe("4px");
    const rules = declaredWithout(element, "gap", { inline: true });
    expect(rules).toMatchObject({ value: "16px", source: { selector: "#main" } });
    expect(declaredWithout(element, "gap", { inline: true, skip: [rules?.rule as CSSStyleDeclaration] })?.value).toBe("8px");
    expect(
      declaredWithout(element, "gap", {
        inline: true,
        skip: matchedRulesFor(element).map((r) => r.style),
      }),
    ).toBeNull();
  });

  it("selectors that don't parse don't break the rest", () => {
    sheet(".card { width: 7px; } .card:-unknown-thing { width: 8px; }");
    expect(declaredValue(element, "width")?.value).toBe("7px");
  });
});

describe("a shorthand's implicit reset", () => {
  /** A rule's style as Chrome reads `text`: the longhands a shorthand leaves out are `initial`. */
  const rule = (cssText: string, values: Record<string, string>, order = 0) => ({
    style: {
      cssText,
      getPropertyValue: (p: string) => values[p] ?? "",
      getPropertyPriority: () => "",
    } as unknown as CSSStyleDeclaration,
    selector: ".a",
    specificity: [0, 1, 0] as [number, number, number],
    layer: [Infinity],
    order,
  });

  it("isn't declared: text-decoration: none sets the line, not the color", () => {
    const shorthand = rule("text-decoration: none;", {
      "text-decoration-line": "none",
      "text-decoration-color": "initial",
      "text-decoration-style": "initial",
    });
    expect(resolve("text-decoration-line", undefined, [shorthand])?.value).toBe("none");
    expect(resolve("text-decoration-color", undefined, [shorthand])).toBeNull();
  });

  it("still wins the cascade: a less specific rule's color doesn't show through", () => {
    const own = rule("text-decoration-color: red;", { "text-decoration-color": "red" }, 0);
    const later = rule("text-decoration: none;", { "text-decoration-line": "none", "text-decoration-color": "initial" }, 1);
    expect(resolve("text-decoration-color", undefined, [own, later])).toBeNull();
  });

  it("initial written by the page is declared", () => {
    const written = rule("text-decoration-color: initial;", { "text-decoration-color": "initial" });
    expect(resolve("text-decoration-color", undefined, [written])?.value).toBe("initial");
  });
});

describe("background-color out of a background shorthand", () => {
  it("a lone var(), or the one color in the last layer; else nothing", () => {
    expect(backgroundColor("var(--color-brand)")).toBe("var(--color-brand)");
    expect(backgroundColor("url(a.png), var(--color-brand)")).toBe("var(--color-brand)");
    expect(backgroundColor("var(--a) var(--b)")).toBeNull();
    expect(backgroundColor("url(a.png)")).toBeNull();
  });

  it("is where background-color reads from, after itself", () => {
    expect(sourcesOf("background-color").map((s) => s.property)).toEqual(["background-color", "background"]);
  });
});
