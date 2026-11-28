// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conditionFrom, conditionKey, conditionLabel, conditionSelector, containerHolds, hasCss, holdsNow, sameCondition } from "./condition.ts";

let element: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = `<section class="card"><p class="title" id="title" data-open>Title</p></section>`;
  element = document.getElementById("title") as HTMLElement;
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("conditionFrom: what's typed after /", () => {
  it("words: kept as they are, for the agent to read (Pilot doesn't guess)", () => {
    expect(conditionFrom("  the parent .card has focus inside ")).toEqual({ words: "the parent .card has focus inside" });
    expect(hasCss(conditionFrom("when it feels right"))).toBe(false);
  });
  it("CSS typed as such: used as written, the element kept as the subject", () => {
    expect(conditionFrom(".card:hover &")).toEqual({ words: ".card:hover &", selector: ".card:hover &" });
    expect(conditionFrom("& + .error").selector).toBe("&:has(+ .error)");
    expect(conditionFrom("(prefers-reduced-motion: reduce)")).toEqual({ words: "(prefers-reduced-motion: reduce)", media: "(prefers-reduced-motion: reduce)" });
    // Not a selector the browser takes: words.
    expect(conditionFrom(".card:::hover &")).toEqual({ words: ".card:::hover &" });
  });
});

describe("labels and keys", () => {
  it("the agent's label once named, else the words", () => {
    expect(conditionLabel({ words: "the card is hovered" })).toBe("the card is hovered");
    expect(conditionLabel({ words: "the card is hovered", label: "group-hover", selector: ".card:hover &" })).toBe("group-hover");
  });
  it("one condition however it's put: its CSS is its key; words only, its words (case and spaces aside)", () => {
    expect(sameCondition({ words: "a", selector: "&[data-open]" }, { words: "b", selector: "&[data-open]" })).toBe(true);
    expect(sameCondition({ words: "The card  is hovered" }, { words: "the card is hovered" })).toBe(true);
    expect(sameCondition({ words: "the card is hovered" }, { words: "on sale" })).toBe(false);
    expect(conditionKey(null)).toBe("");
  });
});

describe("holdsNow, the selector", () => {
  it("matches the element for the selector (its & is the element); words only: can't tell", () => {
    expect(holdsNow({ words: "", selector: "&[data-open]" }, element)).toBe(true);
    expect(holdsNow({ words: "", selector: ".card &" }, element)).toBe(true);
    expect(holdsNow({ words: "", selector: ".nope &" }, element)).toBe(false);
    expect(holdsNow({ words: "it is open" }, element)).toBe(false);
    expect(conditionSelector({ words: "", selector: ".card:hover &" }, '[data-pilot-edit="3"]')).toBe('.card:hover [data-pilot-edit="3"]');
  });
});

describe("containerHolds: the browser asked through a probe", () => {
  it("reads the probe on the element, and leaves the page's sheets as they were", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const theirs = new CSSStyleSheet();
    document.adoptedStyleSheets = [theirs];
    // A DOM without container queries: the probe's answer stands in for the browser's.
    let seen: CSSStyleSheet[] = [];
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      seen = [...document.adoptedStyleSheets];
      return { getPropertyValue: () => "1" } as unknown as CSSStyleDeclaration;
    });
    expect(containerHolds("(max-width: 300px)", el)).toBe(true);
    expect(seen).toHaveLength(2);
    expect(document.adoptedStyleSheets).toEqual([theirs]);
    spy.mockImplementation(() => ({ getPropertyValue: () => "0" }) as unknown as CSSStyleDeclaration);
    expect(containerHolds("(max-width: 300px)", el)).toBe(false);
    expect(document.adoptedStyleSheets).toEqual([theirs]);
    spy.mockRestore();
    document.adoptedStyleSheets = [];
    el.remove();
  });
});
