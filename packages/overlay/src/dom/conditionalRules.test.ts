// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conditionalRules, conditionValue } from "./declared.ts";

let style: HTMLStyleElement;
beforeEach(() => {
  style = document.createElement("style");
  document.head.append(style);
});
afterEach(() => {
  style.remove();
  document.body.innerHTML = "";
});

const found = (element: Element) => conditionalRules(element).map((f) => `${f.condition.label} | ${f.condition.selector ?? ""} | ${f.condition.media ?? ""} | ${f.rules.length}`);

describe("conditionalRules: the project's own conditions on an element, whether they hold now or not", () => {
  // Tailwind v3's form (v4 nests it in `:is(:where(.group) *)`, which browsers match and the tests' DOM doesn't:
  // checked in the browser).
  it("Tailwind's group-hover: one condition for every utility under it, named by the class", () => {
    document.body.innerHTML = `<section class="group/hero"><button id="b" class="group-hover/hero:bg-amber-200 group-hover/hero:text-white">x</button></section>`;
    style.textContent = [
      "@media (hover: hover) { .group\\/hero:hover .group-hover\\/hero\\:bg-amber-200 { background-color: #fde68a; } }",
      "@media (hover: hover) { .group\\/hero:hover .group-hover\\/hero\\:text-white { color: white; } }",
    ].join("\n");
    expect(found(document.getElementById("b") as Element)).toEqual(["group-hover/hero | .group\\/hero:hover & |  | 2"]);
  });

  it("plain CSS: an ancestor's state, an attribute, what it contains; by their CSS", () => {
    document.body.innerHTML = `<div class="card"><div class="toggle"><span id="dot" class="dot"></span></div></div>`;
    style.textContent = [".card:hover .dot { color: red; }", ".toggle[data-checked] > .dot { left: 10px; }", ".dot:has(img) { padding: 2px; }"].join("\n");
    expect(found(document.getElementById("dot") as Element)).toEqual([
      ".card:hover & | .card:hover & |  | 1",
      ".toggle[data-checked] > & | .toggle[data-checked] > & |  | 1",
      "&:has(img) | &:has(img) |  | 1",
    ]);
  });

  it("a media query that isn't a width: a condition; widths, the element's own states and Pilot's rules aren't", () => {
    document.body.innerHTML = `<p id="p" class="t motion-reduce:transition-none">x</p>`;
    style.textContent = [
      "@media (prefers-reduced-motion: reduce) { .motion-reduce\\:transition-none { transition: none; } }",
      "@media (min-width: 768px) { .t { padding: 4px; } }",
      ".t:hover { color: red; }",
      '.card:hover .t:where([data-pilot-edit="1"]) { color: blue; }',
      ".other:hover .x { color: red; }",
      // A reset's, for every element.
      '[hidden]:where(:not([hidden="until-found"])) { display: none !important; }',
    ].join("\n");
    expect(found(document.getElementById("p") as Element)).toEqual(["motion-reduce |  | (prefers-reduced-motion: reduce) | 1"]);
  });
});

describe("conditionValue: the project's value under one of its conditions", () => {
  it("read from its rules, whether it holds now or not", () => {
    document.body.innerHTML = `<div class="card"><span id="t" class="title"></span></div>`;
    style.textContent = ".title { color: black; } .card:hover .title { color: red; }";
    const t = document.getElementById("t") as Element;
    const [found] = conditionalRules(t);
    expect(conditionValue(t, "color", found!.condition)?.value).toBe("red");
    expect(conditionValue(t, "padding-top", found!.condition)).toBeNull();
  });
});

describe("edits under the project's condition: beside its rule", async () => {
  const { renderAnchored } = await import("./anchored.ts");

  it("a change for it goes beside its rule, never beside the element's own; none of the project's: the layer's", () => {
    document.body.innerHTML = `<div class="card"><span id="t" class="title" data-pilot-edit="7"></span></div>`;
    style.textContent = ".title { color: black; } .card:hover .title { color: red; }";
    const t = document.getElementById("t") as Element;
    const condition = { selector: ".card:hover &" };
    expect(renderAnchored([{ element: t, property: "color", text: "color: blue;", id: 7, condition }], false)).toEqual([]);
    // Beside `.card:hover .title` (nested in it, or right after it as `:is(…)` where a DOM can't nest), not `.title`.
    const all = (list: CSSRuleList): CSSRule[] => Array.from(list).flatMap((r) => [r, ...all((r as CSSRule & { cssRules?: CSSRuleList }).cssRules ?? ([] as unknown as CSSRuleList))]);
    const placed = all(style.sheet?.cssRules as CSSRuleList).find((r) => (r as CSSStyleRule).selectorText?.includes('data-pilot-edit="7"')) as CSSStyleRule;
    const where = (placed.parentRule as CSSStyleRule | null)?.selectorText ?? placed.selectorText;
    expect(where.includes(".card:hover .title")).toBe(true);
    // A condition the project doesn't have: left to Pilot's layer.
    expect(renderAnchored([{ element: t, property: "color", text: "color: blue;", id: 7, condition: { selector: ".nope:hover &" } }], false)).toHaveLength(1);
    renderAnchored([], false);
  });

  it("a condition with the element's own state too (group-hover:hover:): listed, with its states", () => {
    document.body.innerHTML = `<div class="card"><span id="t" class="title"></span></div>`;
    style.textContent = ".card:hover .title:focus { outline: 1px solid; }";
    const [found] = conditionalRules(document.getElementById("t") as Element);
    expect([found?.condition.selector, found?.states]).toEqual([".card:hover &", ["focus"]]);
    expect(conditionValue(document.getElementById("t") as Element, "outline-style", found!.condition)).toBeNull();
    expect(conditionValue(document.getElementById("t") as Element, "outline-style", found!.condition, ["focus"])?.value).toBe("solid");
  });
});

describe("a condition inside a width (md:group-hover:)", () => {
  it("kept with its widths, named without the breakpoint (the width chip says it), read for exactly those widths", () => {
    document.body.innerHTML = `<div class="group"><p id="p" class="group-hover:text-red md:group-hover:text-blue"></p></div>`;
    style.textContent = [
      ".group:hover .group-hover\\:text-red { color: red; }",
      "@media (min-width: 768px) { .group:hover .md\\:group-hover\\:text-blue { color: blue; } }",
    ].join("\n");
    const p = document.getElementById("p") as Element;
    const found = conditionalRules(p);
    expect(found.map((f) => [f.condition.label, f.widths ?? null])).toEqual([
      ["group-hover", null],
      ["group-hover", { min: 768 }],
    ]);
    const condition = found[0]!.condition;
    expect(conditionValue(p, "color", condition)?.value).toBe("red");
    expect(conditionValue(p, "color", condition, [], { min: 768 })?.value).toBe("blue");
  });
});
