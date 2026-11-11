// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { maxWidthEditor, minWidthEditor, widthEditor } from "../width/WidthEditor.tsx";

const WidthEditor = widthEditor.component;

let element: HTMLElement;
let container: HTMLElement;
let changes: Array<[string, string]>;
let returned: number;
let history: EditHistory;

const mount = (computed: string, focusRequest?: { query: string }) =>
  act(() => {
    render(
      h(WidthEditor, {
        element,
        values: { width: computed },
        onChange: (p: string, v: string) => {
          changes.push([p, v]);
          history.apply(element, p, v);
        },
        focusRequest,
        onReturnToSearch: () => returned++,
      }),
      container,
    );
  });

beforeEach(() => {
  changes = [];
  returned = 0;
  history = new EditHistory();
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const input = () => container.querySelector("input") as HTMLInputElement;
const typeAndEnter = (text: string) => {
  act(() => input().focus());
  act(() => {
    input().value = text;
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("WidthEditor", () => {
  it("with no width set, the field is empty and shows the default as placeholder", () => {
    mount("122.456px");
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("auto");
  });

  it("shows a width set on the element, even if it's the default", () => {
    element.style.width = "50%";
    mount("61px");
    expect(input().value).toBe("50%");
    element.style.width = "auto";
    mount("61px");
    expect(input().value).toBe("auto");
  });

  it("clearing the field removes the width (back to the default), undoably", () => {
    element.style.width = "10px";
    mount("10px");
    typeAndEnter("");
    expect(changes).toEqual([["width", ""]]);
    expect(element.style.getPropertyValue("width")).toBe("");
    mount("122px");
    expect(input().value).toBe("");
    history.undo();
    expect(element.style.getPropertyValue("width")).toBe("10px");
  });

  it("clearing an empty field changes nothing", () => {
    mount("122px");
    typeAndEnter("");
    expect(changes).toEqual([]);
  });

  it("arrows on an empty field step from the computed width", () => {
    mount("122px", { query: "w" });
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });
    expect(changes).toEqual([["width", "123px"]]);
  });

  it("applies typed widths: bare numbers as px, units and keywords as typed", () => {
    mount("122px");
    typeAndEnter("120");
    typeAndEnter("50%");
    typeAndEnter("fit-content");
    expect(changes).toEqual([
      ["width", "120px"],
      ["width", "50%"],
      ["width", "fit-content"],
    ]);
    expect(returned).toBe(3); // Enter goes back to the search
  });

  it("math needs no calc(): it's added on apply and never shown", () => {
    mount("122px");
    typeAndEnter("100% - 20px");
    expect(changes).toEqual([["width", "calc(100% - 20px)"]]);
    mount("300px");
    expect(input().value).toBe("100% - 20px");
    typeAndEnter("calc(50% + 1rem)");
    expect(changes.at(-1)).toEqual(["width", "calc(50% + 1rem)"]);
    mount("300px");
    expect(input().value).toBe("50% + 1rem");
  });

  it("ignores invalid text", () => {
    mount("122px");
    typeAndEnter("wide");
    expect(changes).toEqual([]);
  });

  it("focuses the value, selected, when coming from the search", () => {
    element.style.width = "122px";
    mount("122px", { query: "w" });
    expect(document.activeElement).toBe(input());
    expect(input().value.slice(input().selectionStart ?? 0, input().selectionEnd ?? 0)).toBe("122px");
  });

  it("Tab returns to the search", () => {
    mount("122px", { query: "w" });
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(returned).toBe(1);
  });
});

describe("min-width and max-width", () => {
  const mountEditor = (editor: typeof widthEditor, extra: Record<string, unknown> = {}) =>
    act(() => {
      render(
        h(editor.component, {
          element,
          values: { [editor.properties[0] as string]: "" },
          onChange: (p: string, v: string) => changes.push([p, v]),
          ...extra,
        }),
        container,
      );
    });

  it("label and placeholder come from the property and its default", () => {
    mountEditor(minWidthEditor);
    expect(container.querySelector(".property-label")?.textContent).toBe("min-width");
    expect(input().placeholder).toBe("auto");
    mountEditor(maxWidthEditor);
    expect(container.querySelector(".property-label")?.textContent).toBe("max-width");
    expect(input().placeholder).toBe("none");
  });

  it("writes its own property; max-width accepts none", () => {
    mountEditor(maxWidthEditor);
    typeAndEnter("none");
    typeAndEnter("640");
    expect(changes).toEqual([
      ["max-width", "none"],
      ["max-width", "640px"],
    ]);
  });

  it("Tab hands over to the next editor when there is one", () => {
    const outs: number[] = [];
    mountEditor(minWidthEditor, { focusRequest: { query: "w", edge: "first" }, onTabOut: (d: number) => outs.push(d) });
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(outs).toEqual([-1]);
  });
});
