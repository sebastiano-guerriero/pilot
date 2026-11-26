// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseValue, declaredValue, subjectStates } from "./declared.ts";

describe("subjectStates", () => {
  it("takes the element's own states off its selector", () => {
    expect(subjectStates(".btn:hover")).toEqual({ states: ["hover"], stripped: ".btn" });
    expect(subjectStates(".btn:active:hover")).toEqual({ states: ["hover", "active"], stripped: ".btn" });
    expect(subjectStates("a.link:focus-visible")).toEqual({ states: ["focus-visible"], stripped: "a.link" });
    expect(subjectStates(":hover")).toEqual({ states: ["hover"], stripped: "*" });
  });

  it("leaves states that aren't the element's own", () => {
    // An ancestor's state, inside :not(), and a lookalike.
    expect(subjectStates(".card:hover .title").states).toEqual([]);
    expect(subjectStates(".btn:not(:hover)").states).toEqual([]);
    expect(subjectStates(".btn:focus-within").states).toEqual([]);
    expect(subjectStates(".btn::before").states).toEqual([]);
  });
});

describe("declared values for a state", () => {
  let sheet: HTMLStyleElement;
  let el: HTMLElement;
  beforeEach(() => {
    sheet = document.createElement("style");
    sheet.textContent = `
      .btn { color: black; padding-top: 4px; }
      .btn:hover { color: red; }
      .btn:active { padding-top: 6px; }
      .btn:hover:active { color: blue; }
    `;
    document.head.append(sheet);
    el = document.createElement("button");
    el.className = "btn";
    document.body.append(el);
  });
  afterEach(() => {
    sheet.remove();
    el.remove();
  });

  it("without states: the element as it is, state rules left out", () => {
    expect(declaredValue(el, "color")?.value).toBe("black");
  });

  it("with states: only the rules for exactly those states", () => {
    expect(declaredValue(el, "color", ["hover"])?.value).toBe("red");
    expect(declaredValue(el, "padding-top", ["hover"])).toBeNull();
    expect(declaredValue(el, "color", ["hover", "active"])?.value).toBe("blue");
  });
});

describe("a state read like CSS", () => {
  it("the hover pill alone is the hover rule outside media queries, not one inside a breakpoint that holds now", () => {
    const style = document.createElement("style");
    style.textContent = ".x:hover { color: red; } @media (min-width: 1px) { .x:hover { color: blue; } }";
    document.head.append(style);
    const x = document.createElement("div");
    x.className = "x";
    document.body.append(x);
    expect(declaredValue(x, "color", ["hover"])?.value).toBe("blue");
    expect(baseValue(x, "color", ["hover"])?.value).toBe("red");
    style.remove();
    x.remove();
  });
});

describe("a rule an element skips for a cleared field (dom/excluded.ts)", () => {
  it("reads as the project wrote it: Pilot's skip clause left out", () => {
    const style = document.createElement("style");
    style.textContent = '.y:not([data-pilot-skip~="r1"]) { color: red; }';
    document.head.append(style);
    const y = document.createElement("div");
    y.className = "y";
    y.setAttribute("data-pilot-skip", "r1");
    document.body.append(y);
    expect(declaredValue(y, "color")?.value).toBe("red");
    expect(declaredValue(y, "color")?.source).toEqual({ selector: ".y" });
    style.remove();
    y.remove();
  });
});
