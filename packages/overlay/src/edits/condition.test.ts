// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { conditionKey, conditionName, conditionSelector, conditionVariant, holdsNow, readCondition, sameCondition } from "./condition.ts";

let element: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = `
    <section class="card" id="card">
      <div class="row" id="row">
        <span class="label" id="before">Label</span>
        <p class="title" id="title" data-open>Title</p>
        <em id="after">after</em>
      </div>
    </section>`;
  element = document.getElementById("title") as HTMLElement;
});
afterEach(() => {
  document.body.innerHTML = "";
});

const read = (words: string) => readCondition(words, element);
const selectorOf = (words: string) => {
  const r = read(words);
  return "condition" in r ? r.condition.selector : `error: ${r.error}`;
};

describe("readCondition: who and what, in words", () => {
  it("the parent (direct, or the nearest ancestor with its class)", () => {
    expect(selectorOf("the parent has focus inside")).toBe(":focus-within > &");
    expect(selectorOf("the parent .card has focus inside")).toBe(".card:focus-within &");
    expect(selectorOf("the parent .row is hovered")).toBe(".row:hover > &");
    expect(selectorOf("when the parent with class card is hovered")).toBe(".card:hover &");
    const r = read("the parent .card has focus inside");
    expect("target" in r && r.target?.id).toBe("card");
  });

  it("an ancestor, a container, inside", () => {
    expect(selectorOf("inside .card that is open")).toBe(".card[open] &");
    expect(selectorOf("the container .card has data-active")).toBe('.card[data-active] &');
  });

  it("siblings: the previous one before it, the next one through :has()", () => {
    expect(selectorOf("the previous sibling is checked")).toBe(":checked + &");
    expect(selectorOf("the next sibling is hovered")).toBe("&:has(+ *:hover)");
    const r = read("the previous sibling is checked");
    expect("target" in r && r.target?.id).toBe("before");
  });

  it("the element itself: an attribute, a class, a state", () => {
    expect(selectorOf("it has data-open")).toBe("&[data-open]");
    expect(selectorOf('data-state is "open"')).toBe('&[data-state="open"]');
    expect(selectorOf("aria-pressed is true")).toBe('&[aria-pressed="true"]');
    expect(selectorOf("it has class is-active")).toBe("&.is-active");
    expect(selectorOf("it is the first child")).toBe("&:first-child");
    expect(selectorOf("it is expanded")).toBe('&[aria-expanded="true"]');
  });

  it("negated: not, isn't, without", () => {
    expect(selectorOf("the parent isn't hovered")).toBe(":not(:hover) > &");
    expect(selectorOf("it doesn't have data-open")).toBe("&:not([data-open])");
  });

  it("an ancestor it names that isn't there: says so", () => {
    expect(selectorOf("the parent .nope is hovered")).toMatch(/^error: No \.nope around/);
  });

  it("words it can't read: how to reword them", () => {
    expect(selectorOf("when it feels right")).toMatch(/^error: Pilot can't read that yet/);
    expect(selectorOf("  ")).toMatch(/^error: Describe when/);
  });
});

describe("readCondition: media in words", () => {
  const mediaOf = (words: string) => {
    const r = read(words);
    return "condition" in r ? r.condition.media : `error: ${r.error}`;
  };
  it("reduced motion, print, orientation, touch, contrast", () => {
    expect(mediaOf("with reduced motion")).toBe("(prefers-reduced-motion: reduce)");
    expect(mediaOf("when printing")).toBe("print");
    expect(mediaOf("in landscape")).toBe("(orientation: landscape)");
    expect(mediaOf("on touch screens")).toBe("(hover: none)");
    expect(mediaOf("with more contrast")).toBe("(prefers-contrast: more)");
  });
});

describe("readCondition: CSS as written", () => {
  it("a selector with & for the element, kept as the subject", () => {
    expect(selectorOf(".card:hover &")).toBe(".card:hover &");
    expect(selectorOf("&[data-state=open]")).toBe("&[data-state=open]");
    // & first: it would style the other element, so it's the element having it.
    expect(selectorOf("& + .error")).toBe("&:has(+ .error)");
    expect(selectorOf("& .icon")).toBe("&:has(.icon)");
  });
  it("a media condition", () => {
    const r = read("(prefers-reduced-motion: reduce)");
    expect("condition" in r && r.condition.media).toBe("(prefers-reduced-motion: reduce)");
  });
  it("a selector the browser doesn't take: says so", () => {
    expect(selectorOf(".card:::hover &")).toMatch(/^error: /);
  });
});

describe("holdsNow, keys", () => {
  it("matches the element for the selector (its & is the element)", () => {
    expect(holdsNow({ words: "", selector: "&[data-open]" }, element)).toBe(true);
    expect(holdsNow({ words: "", selector: ".card &" }, element)).toBe(true);
    expect(holdsNow({ words: "", selector: ".nope &" }, element)).toBe(false);
  });
  it("one condition however it's put: the CSS is its key", () => {
    expect(sameCondition({ words: "it has data-open", selector: "&[data-open]" }, { words: "with data-open", selector: "&[data-open]" })).toBe(true);
    expect(conditionKey(null)).toBe("");
    expect(conditionSelector({ words: "", selector: ".card:hover &" }, '[data-pilot-edit="3"]')).toBe('.card:hover [data-pilot-edit="3"]');
  });
});

describe("conditionVariant, conditionName: Tailwind's words for it", () => {
  const variantOf = (words: string) => {
    const r = read(words);
    return "condition" in r ? conditionVariant(r.condition) : `error: ${r.error}`;
  };
  it("the element's own: data-*, aria-*, states, not-*", () => {
    expect(variantOf("it has data-open")).toBe("data-open");
    expect(variantOf('data-state is "open"')).toBe("data-[state=open]");
    expect(variantOf("it is expanded")).toBe("aria-expanded");
    expect(variantOf("it is the first child")).toBe("first");
    expect(variantOf("it doesn't have data-open")).toBe("not-data-open");
  });
  it("an ancestor or the parent: group-*, named by its class; the previous sibling: peer-*", () => {
    expect(variantOf("the parent .card has focus inside")).toBe("group-focus-within/card");
    expect(variantOf("inside .card that is open")).toBe("group-open/card");
    expect(variantOf("the previous sibling is checked")).toBe("peer-checked");
  });
  it("media: motion-reduce, print…; none: Tailwind's brackets", () => {
    expect(variantOf("with reduced motion")).toBe("motion-reduce");
    expect(variantOf("when printing")).toBe("print");
    expect(variantOf("on touch screens")).toBe("[@media(hover:none)]");
    expect(variantOf("the next sibling is hovered")).toBe("[&:has(+_*:hover)]");
  });
  it("the name: Tailwind's words, or the designer's when it's brackets", () => {
    expect(conditionName({ words: "it has data-selected", selector: "&[data-selected]" })).toBe("Data selected");
    expect(conditionName({ words: "the parent .card is hovered", selector: ".card:hover &" })).toBe("Group hover card");
    expect(conditionName({ words: "the next one is hovered", selector: "&:has(+ *:hover)" })).toBe("the next one is hovered");
  });
});
