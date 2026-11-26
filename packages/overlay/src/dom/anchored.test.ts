// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAnchored } from "./anchored.ts";
import { baseValue, declaredValue } from "./declared.ts";

let style: HTMLStyleElement;
let element: HTMLElement;

beforeEach(() => {
  style = document.createElement("style");
  // A base value, a breakpoint (always on in the test), a state, and Pilot's own rule from before.
  style.textContent = [
    ".box { padding: 40px; }",
    "@media (min-width: 1px) { .box { padding: 56px; } }",
    ".box:hover { padding: 8px; }",
    '.box:where([data-pilot-edit="99"]) { padding: 1px; }',
  ].join("\n");
  document.head.append(style);
  element = document.createElement("div");
  element.className = "box";
  element.setAttribute("data-pilot-edit", "99");
  document.body.append(element);
});
afterEach(() => {
  renderAnchored([], false);
  style.remove();
  element.remove();
});

/** Every rule's text, nested ones too. */
const texts = (list: CSSRuleList | undefined): string[] =>
  Array.from(list ?? []).flatMap((r) => [r.cssText, ...texts((r as CSSRule & { cssRules?: CSSRuleList }).cssRules)]);
const pilotRules = () => texts(style.sheet?.cssRules).filter((t) => t.includes('data-pilot-edit="7"'));

describe("baseValue", () => {
  it("the element's value without media queries or states (nor Pilot's own rules), whatever applies now", () => {
    expect(declaredValue(element, "padding-top")?.value).toBe("56px");
    expect(baseValue(element, "padding-top")?.value).toBe("40px");
    expect(baseValue(element, "padding-top")?.source).toEqual({ selector: ".box" });
  });
});

describe("renderAnchored", () => {
  const request = (text: string) => ({ element, property: "padding", text, id: 7 });

  it("puts a base edit right after the declaration it replaces, for this element only; updates it in place; takes it away", () => {
    expect(renderAnchored([request("padding: 20px;")], false)).toEqual([]);
    const shown = pilotRules();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.join("\n")).toContain("padding: 20px");
    // Right after `.box`'s own declarations: before the breakpoint and the state, which still come after.
    const all = texts(style.sheet?.cssRules);
    const at = all.findIndex((t) => t.includes('data-pilot-edit="7"'));
    expect(at).toBeLessThan(all.findIndex((t) => t.startsWith("@media")));
    // A new value (a drag): the same rule, updated.
    const rule = Array.from(style.sheet?.cssRules ?? []).find((r) => r.cssText.includes('data-pilot-edit="7"'));
    renderAnchored([request("padding: 24px;")], false);
    expect(pilotRules().join("\n")).toContain("padding: 24px");
    expect(Array.from(style.sheet?.cssRules ?? []).includes(rule as CSSRule)).toBe(true);
    renderAnchored([], false);
    expect(pilotRules()).toEqual([]);
  });

  it("nothing to sit beside (a property the element declares nowhere): left to the caller's layer", () => {
    const left = renderAnchored([{ element, property: "color", text: "color: red;", id: 7 }], false);
    expect(left.map((r) => r.property)).toEqual(["color"]);
  });

  it("a stylesheet replaced (hot reload) loses the rule: the check puts it back beside the new one", () => {
    renderAnchored([request("padding: 20px;")], false);
    style.textContent = ".box { padding: 40px; }";
    expect(pilotRules()).toEqual([]);
    renderAnchored([request("padding: 20px;")], true);
    expect(pilotRules().join("\n")).toContain("padding: 20px");
  });

  it("another class (a component restyled): the check moves the rule beside the new base", () => {
    style.textContent = ".box { padding: 40px; }\n.box-b { padding: 30px; }";
    renderAnchored([request("padding: 20px;")], false);
    element.className = "box-b";
    renderAnchored([request("padding: 20px;")], true);
    // Beside `.box-b` now (nested in it, or right after it), and no longer beside `.box`.
    const top = Array.from(style.sheet?.cssRules ?? []) as CSSStyleRule[];
    const holds = (selector: string) => {
      const at = top.findIndex((r) => r.selectorText === selector);
      const own = top[at]?.cssText.includes('data-pilot-edit="7"');
      const next = top[at + 1]?.selectorText?.includes('data-pilot-edit="7"');
      return !!(own || next);
    };
    expect(holds(".box-b")).toBe(true);
    expect(holds(".box")).toBe(false);
    expect(baseValue(element, "padding-top")?.source).toEqual({ selector: ".box-b" });
  });
});
