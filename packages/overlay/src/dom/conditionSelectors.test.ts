// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { conditionOfSelector, isDynamic, needsInteraction, relaxSelector, variantName } from "./conditionSelectors.ts";

describe("relaxSelector: what a selector matches whatever's done on the page", () => {
  it("states, state attributes and :has() go, a compound left empty is *", () => {
    expect(relaxSelector(".card:hover .title")).toBe(".card .title");
    expect(relaxSelector(".toggle[data-checked] > .dot")).toBe(".toggle > .dot");
    expect(relaxSelector("[data-open] .x")).toBe("* .x");
    expect(relaxSelector(".list:has(img) li")).toBe(".list li");
    expect(relaxSelector('input[type="email"]:invalid ~ .hint')).toBe('input[type="email"] ~ .hint');
    // Inside :is()/:where(), and :not() of something dynamic.
    expect(relaxSelector(":is(.gh\\:bg-x):is(:where(.group\\/hero):hover *)")).toBe(":is(.gh\\:bg-x):is(:where(.group\\/hero) *)");
    expect(relaxSelector(".x:not(:focus)")).toBe(".x");
    expect(relaxSelector(".x:not(.y)")).toBe(".x:not(.y)");
    expect(isDynamic(".card .title")).toBe(false);
  });
});

describe("conditionOfSelector: the condition, relative to the element", () => {
  it("around it, as written; its own dynamic parts; its classes left out", () => {
    expect(conditionOfSelector(".card:hover .title")).toBe(".card:hover &");
    expect(conditionOfSelector(".toggle[data-checked] > .dot")).toBe(".toggle[data-checked] > &");
    expect(conditionOfSelector(':is(.data-\\[state\\=open\\]\\:bg-x)[data-state="open"]')).toBe('&[data-state="open"]');
    // Tailwind v4's group-hover, however it comes: nested (`&:is(A *)`), or flat (`:is(A .class)`): one condition.
    expect(conditionOfSelector(":is(.group-hover\\/hero\\:bg-amber-200):is(:where(.group\\/hero):hover *)")).toBe(":where(.group\\/hero):hover &");
    expect(conditionOfSelector(":is(.group-hover\\/hero\\:text-white):is(:where(.group\\/hero):hover *)")).toBe(":where(.group\\/hero):hover &");
    expect(conditionOfSelector(":is(:where(.group\\/hero):hover .group-hover\\/hero\\:bg-amber-200)")).toBe(":where(.group\\/hero):hover &");
    expect(conditionOfSelector(".peer:checked ~ .x")).toBe(".peer:checked ~ &");
    expect(conditionOfSelector(".list .item:has(img)")).toBe("&:has(img)");
    expect(conditionOfSelector(".card .title")).toBeNull();
  });
});

describe("variantName: Tailwind's name for it", () => {
  it("the variants of the element's class, unescaped", () => {
    expect(variantName(":is(.group-hover\\/hero\\:bg-amber-200):is(:where(.group\\/hero):hover *)")).toBe("group-hover/hero");
    expect(variantName(":is(.\\@max-\\[300px\\]\\:text-base)")).toBe("@max-[300px]");
    expect(variantName(':is(.data-\\[state\\=open\\]\\:bg-x)[data-state="open"]')).toBe("data-[state=open]");
    expect(variantName(".card:hover .title")).toBeNull();
  });
});

describe("needsInteraction: rules that hold only while something else is pointed at or focused", () => {
  it("an ancestor's or a sibling's hover or focus, however it's written", () => {
    expect(needsInteraction(":is(:where(.group):hover .group-hover\\:text-violet-400)")).toBe(true);
    expect(needsInteraction(".card:focus-within .title")).toBe(true);
    expect(needsInteraction(".peer:focus ~ .hint")).toBe(true);
  });
  it("not the page's states: they're how the element is", () => {
    expect(needsInteraction(".toggle[data-checked] > .dot")).toBe(false);
    expect(needsInteraction(".peer:checked ~ .x")).toBe(false);
    expect(needsInteraction(".title")).toBe(false);
  });
});
