// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { groupOf } from "../listOrder.ts";
import { matchEditors } from "../registry.ts";
import { rotateEditor } from "./RotateEditor.tsx";
import { axesTransform, parseRotate, stepAngle } from "./rotate.ts";

describe("rotate values", () => {
  it("a bare number is degrees, alone, after an axis or a vector; none; nonsense refused", () => {
    expect(parseRotate("30")).toBe("30deg");
    expect(parseRotate("x 30")).toBe("x 30deg");
    expect(parseRotate("1 1 0 45")).toBe("1 1 0 45deg");
    expect(parseRotate("None")).toBe("none");
    expect(parseRotate("")).toBeNull();
  });

  it("steps the angle at the end, in its unit", () => {
    expect(stepAngle("x 30deg", 1)).toBe("x 31deg");
    expect(stepAngle("", -1)).toBe("-1deg");
    expect(stepAngle("0.5turn", 1)).toBe("0.51turn");
    expect(stepAngle("none", 1)).toBeNull();
  });

  it("the axes' transform keeps the page's own first", () => {
    expect(axesTransform("")).toBe(
      "rotateX(var(--pilot-rotate-x, 0deg)) rotateY(var(--pilot-rotate-y, 0deg)) rotateZ(var(--pilot-rotate-z, 0deg))",
    );
    expect(axesTransform("translateX(4px)").startsWith("translateX(4px) rotateX(")).toBe(true);
    expect(axesTransform(axesTransform(""))).toBe(axesTransform(""));
  });
});

describe("the rotate editor", () => {
  let element: HTMLElement;
  let container: HTMLElement;
  let history: EditHistory;
  let declared: Record<string, string>;
  let changes: Array<[string, string]>;
  const mount = () =>
    act(() => {
      render(
        h(rotateEditor.component, {
          element,
          values: {},
          declared: { ...declared },
          onChange: (p: string, v: string, o?: { gesture?: object }) => {
            changes.push([p, v]);
            history.apply(element, p, v, o?.gesture);
            declared[p] = v;
            mount();
          },
        }),
        container,
      );
    });
  beforeEach(() => {
    history = new EditHistory();
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
  const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;
  const typeAndEnter = (label: string, text: string) => {
    const input = field(label) as HTMLInputElement;
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

  it("one value: a field, no select; it writes rotate, none typed", () => {
    mount();
    expect(container.querySelector('[role="combobox"]')).toBeNull();
    typeAndEnter("rotate value", "x 30");
    expect(changes).toEqual([["rotate", "x 30deg"]]);
    typeAndEnter("rotate value", "none");
    expect(changes.at(-1)).toEqual(["rotate", "none"]);
    typeAndEnter("rotate value", "");
    expect(changes.at(-1)).toEqual(["rotate", ""]);
  });

  it("split: each axis is a variable, with one transform combining them, as one undo step; the last one cleared takes it away", () => {
    mount();
    toggle();
    typeAndEnter("rotate x", "30");
    expect(changes).toEqual([
      ["--pilot-rotate-x", "30deg"],
      ["transform", "rotateX(var(--pilot-rotate-x, 0deg)) rotateY(var(--pilot-rotate-y, 0deg)) rotateZ(var(--pilot-rotate-z, 0deg))"],
    ]);
    typeAndEnter("rotate y", "20");
    // The transform is there already: just the axis.
    expect(changes.at(-1)).toEqual(["--pilot-rotate-y", "20deg"]);
    typeAndEnter("rotate x", "");
    typeAndEnter("rotate y", "");
    expect(changes.slice(-2)).toEqual([
      ["--pilot-rotate-y", ""],
      ["transform", ""],
    ]);
  });

  it("the fields' drag handle is the dial: turned to the angle at the end (x 30deg), at 0 when empty", () => {
    declared.rotate = "x 30deg";
    mount();
    const tick = () => container.querySelector('.scrub-handle[data-dial] path[d="M8 6V4.5"]')?.getAttribute("transform");
    expect(tick()).toBe("rotate(30 8 8)");
    toggle();
    expect(container.querySelectorAll(".scrub-handle[data-dial]")).toHaveLength(3);
  });

  it("opens split when an axis is set; rotate-x in the search lands there", () => {
    declared["--pilot-rotate-y"] = "15deg";
    mount();
    expect(field("rotate y")?.value).toBe("15deg");
    expect(rotateEditor.aliases).toContain("rotate-x-45");
    // Found through Transform, whose panel holds it.
    expect(matchEditors("rotate-x")[0]?.id).toBe("transform");
    expect(groupOf("transform")).toBe("Transform");
  });
});
