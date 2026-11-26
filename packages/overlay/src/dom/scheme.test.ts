// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAnchored } from "./anchored.ts";
import { baseValue, declaredValue } from "./declared.ts";
import { mediaScheme, schemeParts, selectorScheme, withoutScheme } from "./scheme.ts";

let style: HTMLStyleElement;
let element: HTMLElement;

const mount = (css: string) => {
  style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
};
beforeEach(() => {
  element = document.createElement("div");
  element.className = "card";
  document.body.append(element);
});
afterEach(() => {
  renderAnchored([], false);
  style?.remove();
  element.remove();
});

/** Every rule's text, nested ones too. */
const texts = (list: CSSRuleList | undefined): string[] =>
  Array.from(list ?? []).flatMap((r) => [r.cssText, ...texts((r as CSSRule & { cssRules?: CSSRuleList }).cssRules)]);
const pilotRules = () => texts(style.sheet?.cssRules).filter((t) => t.includes('data-pilot-edit="5"'));

describe("the color scheme", () => {
  it("reads the media query and the class forms; strips them", () => {
    expect(mediaScheme("(prefers-color-scheme: dark)")).toBe("dark");
    expect(withoutScheme("(min-width: 768px) and (prefers-color-scheme: dark)")).toBe("(min-width: 768px)");
    expect(selectorScheme(":root.dark .card")).toEqual({ scheme: "dark", stripped: ".card" });
    expect(selectorScheme(".card")).toEqual({ stripped: ".card" });
  });

  it("a dark rule counts with the dark pill only, whether the page is dark or not (a media query)", () => {
    mount(".card { color: black; } @media (prefers-color-scheme: dark) { .card { color: white; } }");
    expect(baseValue(element, "color")?.value).toBe("black");
    expect(baseValue(element, "color", ["dark"])?.value).toBe("white");
    expect(declaredValue(element, "color", ["dark"])?.value).toBe("white");
  });

  it("the same with a class on the root, the page not dark now", () => {
    mount(".card { color: black; } .dark .card { color: white; } .card:where(.dark, .dark *) { padding: 4px; }");
    expect(baseValue(element, "color")?.value).toBe("black");
    expect(baseValue(element, "color", ["dark"])?.value).toBe("white");
    expect(baseValue(element, "padding-top", ["dark"])?.value).toBe("4px");
  });

  it("Pilot's own rule for dark: the project's form, a class when its rules use one, else the media query", () => {
    mount(".card { color: black; } .dark .other { color: white; }");
    expect(schemeParts("dark")).toEqual({ selector: ":where(.dark, .dark *)" });
    // Light, with only a dark class: what isn't dark.
    expect(schemeParts("light")).toEqual({ selector: ":not(.dark, .dark *)" });
    style.remove();
    mount(".card { color: black; }");
    expect(schemeParts("dark")).toEqual({ selector: "", media: "(prefers-color-scheme: dark)" });
  });

  it("a change for dark goes beside the project's dark rule", () => {
    mount(".card { color: black; } @media (prefers-color-scheme: dark) { .card { color: white; } }");
    expect(renderAnchored([{ element, property: "color", text: "color: gray;", id: 5, states: ["dark"] }], false)).toEqual([]);
    const all = texts(style.sheet?.cssRules);
    // In the dark media query: nested in the project's rule (a browser), or a copy of its query right after it (happy-dom can't nest).
    const media = all.filter((t) => t.startsWith("@media (prefers-color-scheme: dark)") && t.includes('data-pilot-edit="5"'));
    expect(media.length).toBeGreaterThan(0);
    expect(media.join("\n")).toContain("color: gray");
  });
});

describe("pseudo-elements", () => {
  it("a ::before rule counts with the before pill only", () => {
    mount(".card { color: black; } .card::before { content: ''; color: red; }");
    expect(baseValue(element, "color")?.value).toBe("black");
    expect(baseValue(element, "color", ["before"])?.value).toBe("red");
  });

  it("beside the project's ::before rule: right after it, not nested (`::before { &:where() }` matches nothing)", () => {
    mount(".card { color: black; } .card::before { content: ''; color: red; }");
    expect(renderAnchored([{ element, property: "color", text: "color: blue;", id: 5, states: ["before"] }], false)).toEqual([]);
    const top = Array.from(style.sheet?.cssRules ?? []).map((r) => r.cssText);
    const at = top.findIndex((t) => t.includes('data-pilot-edit="5"'));
    expect(top[at]).toMatch(/^:is\(\.card\):where\(\[data-pilot-edit="5"\]\)::before \{/);
    expect(top[at - 1]).toContain(".card::before");
  });

  it("Pilot's own rule for one the project has none for: the pseudo-element last, after the states", () => {
    mount(".card { color: black; }");
    expect(renderAnchored([{ element, property: "color", text: "color: red;", id: 5, states: ["hover", "before"] }], false)).toEqual([]);
    expect(pilotRules().join("\n")).toMatch(/:hover::before\s*\{\s*color: red;?\s*\}/);
  });
});
