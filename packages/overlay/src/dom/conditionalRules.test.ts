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
