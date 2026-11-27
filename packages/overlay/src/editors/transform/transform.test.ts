// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchEditors } from "../registry.ts";
import { transformEditor } from "./TransformEditor.tsx";
import { joinTransform, parseTransformText, splitTransform } from "./transform.ts";

describe("transform values", () => {
  it("the page's functions shown as text, Pilot's rotate axes apart and kept at the end", () => {
    expect(splitTransform("translate(-50%, -50%) rotate(5deg)")).toEqual({ shown: "translate(-50%, -50%) rotate(5deg)", pilot: [] });
    const withAxes = splitTransform("skewX(10deg) rotateX(var(--pilot-rotate-x, 0deg)) rotateY(var(--pilot-rotate-y, 0deg))");
    expect(withAxes.shown).toBe("skewX(10deg)");
    expect(joinTransform("skewX(20deg)", withAxes.pilot)).toBe("skewX(20deg) rotateX(var(--pilot-rotate-x, 0deg)) rotateY(var(--pilot-rotate-y, 0deg))");
    expect(joinTransform("none", withAxes.pilot)).toBe("none");
    expect(joinTransform("", [])).toBe("");
  });

  it("typed: as typed, case kept, closing parentheses added; none", () => {
    expect(parseTransformText("translateX(10px) skewX(5deg")).toBe("translateX(10px) skewX(5deg)");
    expect(parseTransformText("None")).toBe("none");
    expect(parseTransformText("  ")).toBeNull();
  });
});

describe("the Transform editor", () => {
  let element: HTMLElement;
  let container: HTMLElement;
  let declared: Record<string, string>;
  let changes: Array<[string, string]>;
  const mount = () =>
    act(() => {
      render(
        h(transformEditor.component, {
          element,
          values: {},
          declared: { ...declared },
          onChange: (p: string, v: string) => {
            changes.push([p, v]);
            if (v) declared[p] = v;
            else delete declared[p];
            mount();
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
  const chips = () => [...container.querySelectorAll(".layer-chip-open")].map((c) => c.textContent?.replace(/\s+/g, " ").trim());
  const openPanel = () => act(() => (container.querySelector(".layer-chip-open, .layer-add") as HTMLButtonElement).click());
  const panel = () => document.querySelector(".property-panel") as HTMLElement | null;
  const mode = () => (panel()?.querySelector('[role="combobox"][aria-label="transform type"]') as HTMLElement | null)?.textContent?.trim();
  const pick = (name: string) => {
    act(() => (panel()?.querySelector('[role="combobox"][aria-label="transform type"]') as HTMLButtonElement).click());
    // The option's name, then its word dimmed (custom's "CSS or variable").
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.trim().startsWith(name));
    act(() => (option as HTMLElement).click());
  };
  const typeAndEnter = (label: string, text: string) => {
    const input = document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
    act(() => input.focus());
    act(() => {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
  };

  it("one row for every transformation, one chip: what's set, its value when it's one; × takes it all off", () => {
    declared.rotate = "45deg";
    mount();
    expect(chips()).toEqual(["rotate45deg"]);
    declared.transform = "skewX(10deg)";
    mount();
    expect(chips()).toEqual(["rotate, skew"]);
    // One panel holds it all: no + once something's set (the chip opens it).
    expect(container.querySelector(".layer-add")).toBeNull();
    act(() => (container.querySelector(".layer-chip-remove") as HTMLButtonElement).click());
    expect(changes).toEqual([
      ["rotate", ""],
      ["transform", ""],
    ]);
    expect(chips()).toEqual([]);
  });

  it("default: translate, rotate, scale and skew in one panel; skew writes transform", () => {
    mount();
    // Nothing set: + opens the panel.
    expect(container.querySelector(".layer-add")).not.toBeNull();
    openPanel();
    expect(mode()).toContain("default");
    for (const label of ["translate value", "scale value", "skew value"]) expect(document.querySelector(`input[aria-label="${label}"]`)).not.toBeNull();
    // skew as one value: X, then Y when typed after it.
    typeAndEnter("skew value", "10 5");
    expect(changes).toEqual([["transform", "skewX(10deg) skewY(5deg)"]]);
  });

  it("custom: what transform holds besides skew, as its value; no rows of the others", () => {
    declared.transform = "translate(-50%, -50%) rotate(5deg)";
    declared.scale = "1.1";
    mount();
    expect(chips()).toEqual(["customscale(1.1) translate(-50%, -50%) rotate(5deg)"]);
    openPanel();
    expect(mode()).toContain("custom");
    expect((document.querySelector('input[aria-label="transform value"]') as HTMLInputElement).value).toBe("translate(-50%, -50%) rotate(5deg)");
    expect(document.querySelector('input[aria-label="scale value"]')).toBeNull();
  });

  it("custom picked: everything set as functions; written, it's all transform and the others go, one step", () => {
    declared.translate = "3px";
    declared.rotate = "45deg";
    declared.transform = "skewX(10deg)";
    mount();
    openPanel();
    pick("custom");
    expect((document.querySelector('input[aria-label="transform value"]') as HTMLInputElement).value).toBe("translate(3px) rotate(45deg) skewX(10deg)");
    typeAndEnter("transform value", "translate(3px) rotate(45deg) skewX(12deg)");
    expect(changes).toEqual([
      ["translate", ""],
      ["rotate", ""],
      ["transform", "translate(3px) rotate(45deg) skewX(12deg)"],
    ]);
  });

  it("none sets all four to none, one step; default again takes them off", () => {
    declared.rotate = "45deg";
    mount();
    openPanel();
    pick("none");
    expect(changes).toEqual([
      ["translate", "none"],
      ["rotate", "none"],
      ["scale", "none"],
      ["transform", "none"],
    ]);
    expect(chips()).toEqual(["none"]);
    // The usual box with the red line before it.
    expect(container.querySelector(".layer-chip-open svg")).not.toBeNull();
    // And in the select, with its word: as box-shadow's.
    expect(mode()).toContain("no transform");
    pick("default");
    expect(changes.slice(4)).toEqual([
      ["translate", ""],
      ["rotate", ""],
      ["scale", ""],
      ["transform", ""],
    ]);
  });

  it("searched by a row (translate-y) and entered: the panel opens on that row, its axis focused", async () => {
    act(() => {
      render(h(transformEditor.component, { element, values: {}, declared: {}, onChange: () => {}, query: "translate-y", focusRequest: { query: "translate-y" } } as never), container);
    });
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(panel()).not.toBeNull();
    expect((document.activeElement as HTMLElement | null)?.getAttribute("aria-label")).toBe("translate y");
  });

  it("searching transform shows it, with transform-origin and transform-style; skew finds it", () => {
    expect(matchEditors("transform").map((e) => e.id)).toEqual(["transform", "transform-origin", "transform-style"]);
    expect(matchEditors("skew-x-12")[0]?.id).toBe("transform");
  });
});
