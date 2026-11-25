// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { groupOf } from "../listOrder.ts";
import { matchEditors } from "../registry.ts";
import type { PropertyEditor } from "../types.ts";
import { backfaceVisibilityEditor, perspectiveEditor, perspectiveOriginEditor, transformOriginEditor, transformStyleEditor } from "./PerspectiveEditors.tsx";

let element: HTMLElement;
let container: HTMLElement;
let changes: Array<[string, string]>;

const mount = (editor: PropertyEditor) =>
  act(() => {
    render(
      h(editor.component, {
        element,
        values: {},
        onChange: (p: string, v: string) => {
          changes.push([p, v]);
          element.style.setProperty(p, v);
          mount(editor);
        },
      }),
      container,
    );
  });

beforeEach(() => {
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

const label = () => container.querySelector(".property-label")?.textContent;
const options = () => {
  act(() => (container.querySelector('[role="combobox"]') as HTMLButtonElement).click());
  return [...container.querySelectorAll('[role="option"] .label')].map((o) => o.textContent);
};

describe("3D for what's inside", () => {
  it("perspective: Tailwind's distances with their names, then custom, none last", () => {
    mount(perspectiveEditor);
    expect(label()).toBe("perspective");
    expect(options()).toEqual([
      "Select",
      "100pxdramatic",
      "300pxnear",
      "500pxnormal",
      "800pxmidrange",
      "1200pxdistant",
      "custom",
      "none",
    ]);
  });

  it("transform-origin: object-position's nine with their icons, then custom", () => {
    mount(transformOriginEditor);
    expect(label()).toBe("transform-origin");
    const menu = options();
    expect(menu).toEqual(expect.arrayContaining(["top left", "center", "bottom right"]));
    expect(menu.at(-1)).toBe("custom");
  });

  it("rows named to fit: persp-origin (object-position's nine), backface; transform-style as it is", () => {
    mount(perspectiveOriginEditor);
    expect(label()).toBe("persp-origin");
    expect(options()).toContain("top left");
    mount(backfaceVisibilityEditor);
    expect(label()).toBe("backface");
    expect(options()).toEqual(["Select", "visible", "hidden"]);
    mount(transformStyleEditor);
    expect(label()).toBe("transform-style");
    expect(options()).toEqual(["Select", "flat", "preserve-3d"]);
  });

  it("Tailwind's names find each one; all in the Transform group", () => {
    for (const [q, id] of [
      ["origin-top-left", "transform-origin"],
      ["transform-origin", "transform-origin"],
      ["perspective-near", "perspective"],
      ["perspective-origin-top", "perspective-origin"],
      ["persp-origin", "perspective-origin"],
      ["transform-3d", "transform-style"],
      ["backface-hidden", "backface-visibility"],
    ] as const) {
      expect(matchEditors(q).map((e) => e.id), q).toEqual([id]);
      expect(groupOf(id)).toBe("Transform");
    }
  });
});
