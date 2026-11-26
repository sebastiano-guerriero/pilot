// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "./history.ts";
import { applyChange, hasWidthRules, spansOf, targetAt } from "./reach.ts";

let style: HTMLStyleElement;
let element: HTMLElement;
let history: EditHistory;

beforeEach(() => {
  style = document.createElement("style");
  // `pt-2 md:pt-4 lg:pt-12`, written as plain CSS.
  style.textContent = [
    ".card { padding-top: 8px; }",
    "@media (min-width: 768px) { .card { padding-top: 16px; } }",
    "@media (min-width: 1024px) { .card { padding-top: 48px; } }",
    ".card:hover { padding-top: 4px; }",
  ].join("\n");
  document.head.append(style);
  element = document.createElement("div");
  element.className = "card";
  document.body.append(element);
  history = new EditHistory({ render() {} });
});
afterEach(() => {
  style.remove();
  element.remove();
});

const spans = (property = "padding-top") => spansOf(element, property, undefined, history);

describe("spansOf", () => {
  it("where each value applies, not how its media query is written: md to lg, then lg on", () => {
    expect(spans()).toEqual([
      { min: 0, max: 767, key: "base", value: "8px" },
      { min: 768, max: 1023, key: { min: 768 }, value: "16px" },
      { min: 1024, key: { min: 1024 }, value: "48px" },
    ]);
    expect(hasWidthRules(spans())).toBe(true);
  });

  it("a property set only outside media queries has no width rules (no bars)", () => {
    style.textContent = ".card { padding-top: 8px; }";
    expect(spans()).toEqual([{ min: 0, key: "base", value: "8px" }]);
    expect(hasWidthRules(spans())).toBe(false);
  });

  it("a state's rules on their own", () => {
    expect(spansOf(element, "padding-top", ["hover"], history)).toEqual([{ min: 0, key: "base", value: "4px" }]);
  });

  it("Pilot's change for widths the project has no rule for takes its place among them", () => {
    history.apply(element, "padding-top", "2px", undefined, { widths: { min: 500 } });
    expect(spans()).toEqual([
      { min: 0, max: 499, key: "base", value: "8px" },
      { min: 500, max: 767, key: { min: 500 }, value: "2px" },
      { min: 768, max: 1023, key: { min: 768 }, value: "16px" },
      { min: 1024, key: { min: 1024 }, value: "48px" },
    ]);
  });
});

describe("targetAt", () => {
  it("the rule that applies at the window's width", () => {
    expect(targetAt(element, "padding-top", undefined, 500, history)).toBe("base");
    expect(targetAt(element, "padding-top", undefined, 900, history)).toEqual({ min: 768 });
    expect(targetAt(element, "padding-top", undefined, 1300, history)).toEqual({ min: 1024 });
    // Nothing declares it: the base.
    expect(targetAt(element, "margin-top", undefined, 900, history)).toBe("base");
  });
});

describe("applyChange", () => {
  it("no chip: the rule that applies at the window's width, md's between md and lg", () => {
    applyChange(history, element, "padding-top", "20px", undefined, { width: 900 });
    expect(history.valueOf(element, "padding-top", { min: 768 })).toBe("20px");
    expect(history.valueOf(element, "padding-top", "base")).toBeNull();
    // Past lg, the next one goes to lg's.
    applyChange(history, element, "padding-top", "60px", undefined, { width: 1300 });
    expect(history.valueOf(element, "padding-top", { min: 1024 })).toBe("60px");
    expect(spans().map((s) => s.value)).toEqual(["8px", "20px", "60px"]);
  });

  it("a shorthand whose sides follow different rules is written per side, each at its own", () => {
    applyChange(history, element, "padding", "4px", undefined, { width: 900 });
    expect(history.valueOf(element, "padding-top", { min: 768 })).toBe("4px");
    for (const side of ["right", "bottom", "left"]) expect(history.valueOf(element, `padding-${side}`, "base")).toBe("4px");
  });

  it("a range chip keeps the value there whatever the window; Base is the value without a media query", () => {
    applyChange(history, element, "padding-top", "30px", undefined, { chip: { min: 1024 }, width: 500 });
    expect(history.valueOf(element, "padding-top", { min: 1024 })).toBe("30px");
    applyChange(history, element, "padding-top", "6px", undefined, { chip: {}, width: 1300 });
    expect(history.valueOf(element, "padding-top", "base")).toBe("6px");
  });

  it("All widths: the base value, the property's breakpoint rules removed (the project's and Pilot's)", () => {
    history.apply(element, "padding-top", "2px", undefined, { widths: { min: 500 } });
    applyChange(history, element, "padding-top", "10px", {}, { chip: "all", width: 900 });
    expect(history.valueOf(element, "padding-top", "base")).toBe("10px");
    expect(history.removalOf(element, "padding-top", { min: 768 })?.from).toBe("16px");
    expect(history.removalOf(element, "padding-top", { min: 1024 })?.from).toBe("48px");
    expect(history.valueOf(element, "padding-top", { min: 500 })).toBeNull();
    expect(spans()).toEqual([{ min: 0, key: "base", value: "10px" }]);
  });

  it("All widths on a shorthand: one removal per rule, the sides only where they're declared on their own", () => {
    style.textContent = [".card { padding: 8px; }", "@media (min-width: 768px) { .card { padding: 16px; } }", "@media (min-width: 1024px) { .card { padding-top: 48px; } }"].join("\n");
    applyChange(history, element, "padding", "10px", {}, { chip: "all", width: 900 });
    const removals = history.changes().filter((c) => c.removal).map((c) => `${c.property}@${c.widths?.min}`);
    expect(removals).toEqual(["padding@768", "padding-top@1024"]);
    expect(spans()).toEqual([{ min: 0, key: "base", value: "10px" }]);
    // One undo step for all of it.
    history.undo();
    expect(history.changes()).toEqual([]);
  });

  it("each selected element follows its own rule", () => {
    const other = document.createElement("div");
    other.className = "plain";
    document.body.append(other);
    for (const el of [element, other]) applyChange(history, el, "padding-top", "12px", undefined, { width: 900 });
    expect(history.valueOf(element, "padding-top", { min: 768 })).toBe("12px");
    expect(history.valueOf(other, "padding-top", "base")).toBe("12px");
    other.remove();
  });
});
