// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { matchEditors } from "../registry.ts";
import { backgroundColorEditor, textColorEditor } from "./ColorEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;

const mount = () =>
  act(() => {
    render(
      h(textColorEditor.component, {
        element,
        values: { color: "rgb(0, 0, 0)" },
        onChange: (p: string, v: string, o?: { gesture?: object }) => {
          changes.push([p, v]);
          history.apply(element, p, v, o?.gesture);
          mount();
        },
        onRevert: (p: string, g: object) => {
          history.revert(element, p, g);
          mount();
        },
      }),
      container,
    );
  });

beforeEach(() => {
  history = new EditHistory(inlinePreview());
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

const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const commit = (input: HTMLInputElement, text: string) => {
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("color editor", () => {
  it("a color field with a swatch, and a 45px opacity field", () => {
    mount();
    expect(field("color").value).toBe("");
    expect(field("color opacity").value).toBe("");
    // Nothing set: the "nothing set" icon, as in selects with icons.
    expect(container.querySelector(".color-swatch")).toBeNull();
    expect(container.querySelector(".input-icon svg")).not.toBeNull();
  });

  it("with a color set, the swatch shows it", () => {
    element.style.color = "#ff0000";
    mount();
    expect(container.querySelector(".color-swatch")).not.toBeNull();
  });

  it("typing a color writes it; the opacity writes 8-digit hex", () => {
    mount();
    commit(field("color"), "000");
    expect(changes.at(-1)).toEqual(["color", "#000000"]);
    expect(field("color opacity").value).toBe("100");
    commit(field("color opacity"), "50");
    expect(changes.at(-1)).toEqual(["color", "#00000080"]);
    expect([field("color").value, field("color opacity").value]).toEqual(["#000000", "50"]);
  });

  it("a new color keeps the opacity, unless it has its own alpha", () => {
    element.style.color = "#00000080";
    mount();
    commit(field("color"), "ff0000");
    expect(changes.at(-1)).toEqual(["color", "#ff000080"]);
    commit(field("color"), "#0000ffcc");
    expect(changes.at(-1)).toEqual(["color", "#0000ffcc"]);
  });

  it("a named color below 100 is written as color-mix; how it's named is kept", () => {
    element.style.color = "var(--brand)";
    mount();
    expect(field("color").value).toBe("--brand"); // a lone token by its name
    commit(field("color opacity"), "30");
    expect(changes.at(-1)).toEqual(["color", "color-mix(in srgb, var(--brand) 30%, transparent)"]);
  });

  it("just transparent: the opacity can't be edited, and Tab skips it", () => {
    element.style.color = "transparent";
    mount();
    expect(field("color opacity").disabled).toBe(true);
    expect(field("color opacity").value).toBe("0");
    commit(field("color"), "ff0000");
    expect(field("color opacity").disabled).toBe(false);
    expect(field("color opacity").value).toBe("100");
  });

  it("clearing the color removes it; clearing the opacity makes it 100; ↑/↓ step it", () => {
    element.style.color = "#00000080";
    mount();
    commit(field("color opacity"), "");
    expect(changes.at(-1)).toEqual(["color", "#000000"]);
    act(() => {
      field("color opacity").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(changes.at(-1)).toEqual(["color", "#000000fc"]);
    commit(field("color"), "");
    expect(changes.at(-1)).toEqual(["color", ""]);
  });

  it("is found by color", () => {
    expect(matchEditors("color").map((e) => e.id)).toEqual(["color"]);
  });
});

describe("bg-color editor", () => {
  const mountBg = () =>
    act(() => {
      render(
        h(backgroundColorEditor.component, {
          element,
          values: { "background-color": element.style.backgroundColor || "rgba(0, 0, 0, 0)" },
          onChange: (p: string, v: string, o?: { gesture?: object }) => {
            changes.push([p, v]);
            history.apply(element, p, v, o?.gesture);
            mountBg();
          },
          onRevert: (p: string, g: object) => {
            history.revert(element, p, g);
            mountBg();
          },
        }),
        container,
      );
    });

  it("works like color, on background-color, labeled bg-color", () => {
    mountBg();
    expect(container.textContent).toContain("bg-color");
    expect(field("bg-color").value).toBe("");
    commit(field("bg-color"), "ff0000");
    expect(changes.at(-1)).toEqual(["background-color", "#ff0000"]);
    commit(field("bg-color opacity"), "50");
    expect(changes.at(-1)).toEqual(["background-color", "#ff000080"]);
    commit(field("bg-color"), "");
    expect(changes.at(-1)).toEqual(["background-color", ""]);
  });

  it("is found by background-color and bg-color; bg is both bg- rows; color still finds just color", () => {
    for (const q of ["background-color", "bg-color"]) {
      expect(matchEditors(q).map((e) => e.id), q).toEqual(["background-color"]);
    }
    expect(matchEditors("bg").map((e) => e.id)).toEqual(["background-color", "background-blend-mode"]);
    // Both start with it: tied, like min → min-width and min-height.
    expect(matchEditors("background").map((e) => e.id)).toEqual(["background-color", "background-blend-mode"]);
    expect(matchEditors("color").map((e) => e.id)).toEqual(["color"]);
  });
});
