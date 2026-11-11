// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../../edits/history.ts";
import type { PropertyEditor, PropertyEditorProps } from "../../../editors/types.ts";
import { PropertyDialog } from "./PropertyDialog.tsx";

// Stub editors: render their id and the values they receive, expose onChange,
// record the focus requests they get, and can hand focus back to the search.
let focusRequests: Array<{ query: string } | undefined>;
const stub = (id: string, properties: string[], keywords?: string[]): PropertyEditor => ({
  id,
  label: id,
  properties,
  keywords,
  component: ({ values, onChange, focusRequest, onReturnToSearch }: PropertyEditorProps) => {
    focusRequests.push(focusRequest);
    return h("div", {}, [
      h("button", { class: "stub", onClick: () => onChange(properties[0] as string, "0.5") }, `${id}:${JSON.stringify(values)}`),
      h("button", { class: "back", onClick: () => onReturnToSearch?.() }, "back"),
    ]);
  },
});

const editors = [stub("opacity", ["opacity"], ["fade"]), stub("padding", ["padding"]), stub("gap", ["gap"])];

let container: HTMLElement;
let element: HTMLElement;

let closed: number;

beforeEach(() => {
  focusRequests = [];
  closed = 0;
  container = document.createElement("div");
  element = document.createElement("div");
  document.body.append(container, element);
});

afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const mount = () =>
  act(() => {
    render(
      h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors, onClose: () => closed++ }),
      container,
    );
  });

const search = () => container.querySelector(".property-search input") as HTMLInputElement;
const key = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
const lastFocusRequest = () => focusRequests.at(-1);

const type = (text: string) =>
  act(() => {
    const input = container.querySelector("input") as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

const editorIds = () => [...container.querySelectorAll(".editor")].map((e) => (e as HTMLElement).dataset.editor);

describe("PropertyDialog", () => {
  it("shows only the search field at first", () => {
    mount();
    expect(container.querySelector(".property-search input")).not.toBeNull();
    expect(editorIds()).toEqual([]);
  });

  it("shows just the best-matching editor as you type", () => {
    mount();
    type("opa");
    expect(editorIds()).toEqual(["opacity"]);
    type("fade");
    expect(editorIds()).toEqual(["opacity"]);
    type("pad");
    expect(editorIds()).toEqual(["padding"]);
  });

  it("shows no editor for a blank or unmatched query", () => {
    mount();
    type("   ");
    expect(editorIds()).toEqual([]);
    type("zzz");
    expect(editorIds()).toEqual([]);
  });

  it("records changes in the shared history, so they can be undone", () => {
    const history = new EditHistory();
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors, history }), container);
    });
    type("opacity");
    act(() => (container.querySelector(".stub") as HTMLButtonElement).click());
    expect(element.style.getPropertyValue("opacity")).toBe("0.5");
    expect(history.undo()).toBe(true);
    expect(element.style.getPropertyValue("opacity")).toBe("");
  });

  it("applies editor changes as inline styles on the element", () => {
    mount();
    type("opacity");
    act(() => (container.querySelector(".stub") as HTMLButtonElement).click());
    expect(element.style.getPropertyValue("opacity")).toBe("0.5");
  });

  describe("keyboard", () => {
    it("Tab or Enter moves into the matched editor, telling it what was typed", () => {
      mount();
      type(" Pad ");
      key(search(), "Tab");
      expect(lastFocusRequest()).toEqual({ query: "pad" });
      const first = lastFocusRequest();
      key(search(), "Enter");
      expect(lastFocusRequest()).toEqual({ query: "pad" });
      expect(lastFocusRequest()).not.toBe(first); // a new request each time
    });

    it("does nothing on Tab/Enter without a match, and keeps focus in the search", () => {
      mount();
      type("zzz");
      key(search(), "Tab");
      expect(editorIds()).toEqual([]);
    });

    it("drops the focus request as soon as the query changes", () => {
      mount();
      type("opacity");
      key(search(), "Enter");
      type("gap");
      expect(lastFocusRequest()).toBeUndefined();
    });

    it("returns to the search, text selected, when the editor asks", () => {
      mount();
      type("opacity");
      act(() => (container.querySelector(".back") as HTMLButtonElement).click());
      expect(document.activeElement).toBe(search());
      expect([search().selectionStart, search().selectionEnd]).toEqual([0, "opacity".length]);
    });

    it("Esc steps back: editor → search → clear search → close", () => {
      mount();
      type("opacity");
      key(container.querySelector(".stub") as Element, "Escape");
      expect(document.activeElement).toBe(search());
      expect(closed).toBe(0);
      key(search(), "Escape");
      expect(search().value).toBe("");
      expect(closed).toBe(0);
      key(search(), "Escape");
      expect(closed).toBe(1);
    });
  });

  describe("footer", () => {
    const footer = () => container.querySelector(".footer")?.textContent?.replace(/\s+/g, " ").trim() ?? null;

    it("only appears with a matched property", () => {
      mount();
      expect(footer()).toBeNull();
      type("zzz");
      expect(footer()).toBeNull();
      type("opa");
      expect(footer()).toBe("Tab or Enter to edit");
    });

    it("switches to the editor's keys while a property is being edited, and back", () => {
      mount();
      type("opacity");
      act(() => (container.querySelector(".stub") as HTMLButtonElement).focus());
      expect(footer()).toBe("Enter to apply, Esc to go back");
      key(container.querySelector(".stub") as Element, "Escape");
      expect(footer()).toBe("Tab or Enter to edit");
    });

    it("marks the keys up as <kbd>", () => {
      mount();
      type("opa");
      expect([...container.querySelectorAll(".footer kbd")].map((k) => k.textContent)).toEqual(["Tab", "Enter"]);
    });
  });
});
