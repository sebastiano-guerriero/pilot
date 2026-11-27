// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseValue, stepValue } from "../../css/values.ts";
import { matchEditors } from "../registry.ts";
import type { PropertyEditor } from "../types.ts";
import { scaleEditor, translateEditor } from "./AxesEditor.tsx";
import { axesValue, isAxesValue, pageAxes, parseTransform } from "./axes.ts";

describe("translate and scale's axes", () => {
  it("the page's value split into axes: translate moves X with one part, scale scales X and Y", () => {
    expect(pageAxes("translate", "")).toEqual({ x: "0px", y: "0px", z: "0px" });
    expect(pageAxes("translate", "8px")).toEqual({ x: "8px", y: "0px", z: "0px" });
    expect(pageAxes("translate", "var(--tw-translate-x) var(--tw-translate-y)")).toEqual({ x: "var(--tw-translate-x)", y: "var(--tw-translate-y)", z: "0px" });
    expect(pageAxes("scale", "1.5")).toEqual({ x: "1.5", y: "1.5", z: "1" });
    expect(pageAxes("scale", "none")).toEqual({ x: "1", y: "1", z: "1" });
  });

  it("the axes' value: each axis's variable, falling back to the page's own; kept once written", () => {
    const value = axesValue("translate", "var(--tw-translate-x) var(--tw-translate-y)");
    expect(value).toBe("var(--pilot-translate-x, var(--tw-translate-x)) var(--pilot-translate-y, var(--tw-translate-y)) var(--pilot-translate-z, 0px)");
    expect(isAxesValue("translate", value)).toBe(true);
    expect(axesValue("translate", value)).toBe(value);
    expect(axesValue("scale", "")).toBe("var(--pilot-scale-x, 1) var(--pilot-scale-y, 1) var(--pilot-scale-z, 1)");
    // scale's fields are X and Y: Z keeps the page's value, left out when it's 1.
    expect(axesValue("scale", "", ["x", "y"])).toBe("var(--pilot-scale-x, 1) var(--pilot-scale-y, 1)");
    expect(axesValue("scale", "1.5 1.5 2", ["x", "y"])).toBe("var(--pilot-scale-x, 1.5) var(--pilot-scale-y, 1.5) 2");
  });

  it("one value as typed: up to three parts, a bare number px for translate, a factor for scale; none", () => {
    expect(parseTransform("translate", "10 20")).toBe("10px 20px");
    expect(parseTransform("translate", "none")).toBe("none");
    expect(parseTransform("translate", "1px 2px 3px 4px")).toBeNull();
    expect(parseTransform("scale", "1.5")).toBe("1.5");
    expect(parseTransform("scale", "150% 50%")).toBe("150% 50%");
  });

  it("scale's axis: a factor or a percentage, stepped by hundredths or whole percents, from 1", () => {
    expect(parseValue("scale", "1.25")).toBe("1.25");
    expect(parseValue("scale", "-1")).toBe("-1");
    expect(parseValue("scale", "150%")).toBe("150%");
    expect(parseValue("scale", "big")).toBeNull();
    expect(stepValue("scale", "1", 1, undefined)).toBe("1.01");
    expect(stepValue("scale", "1", 10, undefined)).toBe("1.1");
    expect(stepValue("scale", "150%", -1, undefined)).toBe("149%");
    expect(stepValue("scale", "", 1, undefined)).toBe("1.01");
    expect(parseValue("translate", "12")).toBe("12px");
  });
});

describe("the translate and scale editors", () => {
  let element: HTMLElement;
  let container: HTMLElement;
  let declared: Record<string, string>;
  let changes: Array<[string, string]>;
  const mount = (editor: PropertyEditor) =>
    act(() => {
      render(
        h(editor.component, {
          element,
          values: {},
          declared: { ...declared },
          onChange: (p: string, v: string) => {
            changes.push([p, v]);
            if (v) declared[p] = v;
            else delete declared[p];
            mount(editor);
          },
        } as never),
        container,
      );
    });
  beforeEach(() => {
    declared = {};
    changes = [];
    element = document.createElement("div");
    container = document.createElement("div");
    document.body.append(element, container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
    element.remove();
  });
  const typeAndEnter = (label: string, text: string) => {
    const input = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
    act(() => input.focus());
    act(() => {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
  };
  const toggle = () => act(() => (container.querySelector(".split-toggle") as HTMLButtonElement).click());

  it("an axis writes its variable and the property combining them, keeping the page's other axes", () => {
    declared.translate = "var(--tw-translate-x) var(--tw-translate-y)";
    mount(translateEditor);
    toggle();
    typeAndEnter("translate x", "10");
    expect(changes).toEqual([
      ["--pilot-translate-x", "10px"],
      ["translate", "var(--pilot-translate-x, var(--tw-translate-x)) var(--pilot-translate-y, var(--tw-translate-y)) var(--pilot-translate-z, 0px)"],
    ]);
    // Cleared, the last axis takes Pilot's combining value with it.
    typeAndEnter("translate x", "");
    expect(changes.slice(-2)).toEqual([
      ["--pilot-translate-x", ""],
      ["translate", ""],
    ]);
  });

  it("one value writes the property, and takes the axes Pilot set with it", () => {
    declared["--pilot-scale-x"] = "2";
    declared.scale = "var(--pilot-scale-x, 1) var(--pilot-scale-y, 1) var(--pilot-scale-z, 1)";
    mount(scaleEditor);
    // An axis set: it opens split; one value is a click away.
    expect(container.querySelector('input[aria-label="scale x"]')).not.toBeNull();
    // No Z field for scale (typed as the third value instead).
    expect(container.querySelector('input[aria-label="scale z"]')).toBeNull();
    toggle();
    // One value with the axes set reads Mixed (a split editor's parts that differ), not 1.
    const one = container.querySelector('input[aria-label="scale value"]') as HTMLInputElement;
    expect([one.value, one.placeholder]).toEqual(["", "Mixed"]);
    typeAndEnter("scale value", "1.5");
    expect(changes).toEqual([
      ["--pilot-scale-x", ""],
      ["scale", "1.5"],
    ]);
  });

  it("an empty translate field steps from 0: 1px or -1px by direction (scale's from 1)", () => {
    mount(translateEditor);
    toggle();
    const x = container.querySelector('input[aria-label="translate x"]') as HTMLInputElement;
    act(() => x.focus());
    act(() => {
      x.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(changes[0]).toEqual(["--pilot-translate-x", "-1px"]);
  });

  it("Mixed only when a field's axis is set: a combining value left from an axis without a field isn't", () => {
    declared.scale = "var(--pilot-scale-x, 1) var(--pilot-scale-y, 1) var(--pilot-scale-z, 1)";
    mount(scaleEditor);
    const one = container.querySelector('input[aria-label="scale value"]') as HTMLInputElement;
    expect([one.value, one.placeholder]).toEqual(["", "1"]);
  });

  it("found by Tailwind's classes", () => {
    const ids = (q: string) => matchEditors(q).map((e) => e.id);
    // Through Transform, whose panel holds them.
    expect(ids("translate-y-4")[0]).toBe("transform");
    expect(ids("scale-50")[0]).toBe("transform");
  });
});
