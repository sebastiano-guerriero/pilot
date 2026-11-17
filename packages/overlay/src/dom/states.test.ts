// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { declaredValue, forcedDeclarations, subjectStates } from "./declared.ts";

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

  it("forced: what applies while in all the states, each state's rules included", () => {
    const forced = Object.fromEntries(forcedDeclarations(el, ["hover", "active"]).map((d) => [d.property, d.value]));
    expect(forced).toEqual({ color: "blue", "padding-top": "6px" });
    expect(forcedDeclarations(el, [])).toEqual([]);
  });
});
