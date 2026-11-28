// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { conditionOfSelector, isDynamic, relaxSelector, variantName } from "./conditionSelectors.ts";

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
    expect(conditionOfSelector(":is(.group-hover\\/hero\\:bg-amber-200):is(:where(.group\\/hero):hover *)")).toBe("&:is(:where(.group\\/hero):hover *)");
    expect(conditionOfSelector(":is(.group-hover\\/hero\\:text-white):is(:where(.group\\/hero):hover *)")).toBe("&:is(:where(.group\\/hero):hover *)");
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
