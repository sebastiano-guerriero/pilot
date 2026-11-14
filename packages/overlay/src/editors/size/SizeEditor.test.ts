// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { PropertyDialog } from "../../ui/components/PropertyDialog/PropertyDialog.tsx";
import { heightEditor, maxHeightEditor, minHeightEditor } from "../height/HeightEditor.tsx";
import { matchEditors } from "../registry.ts";
import { maxWidthEditor, minWidthEditor, widthEditor } from "../width/WidthEditor.tsx";
import { sizeEditor } from "./SizeEditor.tsx";

const editors = [widthEditor, minWidthEditor, maxWidthEditor, heightEditor, minHeightEditor, maxHeightEditor, sizeEditor];

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;

beforeEach(() => {
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
  history = new EditHistory(inlinePreview());
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const mount = () =>
  act(() => {
    render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors, history }), container);
  });
const search = () => container.querySelector(".property-search input") as HTMLInputElement;
const fields = () => [...container.querySelectorAll(".size-editor input")] as HTMLInputElement[];
const type = (input: HTMLInputElement, text: string) =>
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const key = (target: Element, name: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });

describe("size", () => {
  it("the search finds it by size only; width and height stay their own", () => {
    expect(matchEditors("size", editors).map((e) => e.id)).toEqual(["size"]);
    expect(matchEditors("width", editors).map((e) => e.id)).toEqual(["width", "min-width", "max-width"]);
    expect(matchEditors("h", editors).map((e) => e.id)).toEqual(["height", "min-height", "max-height"]);
  });

  it("shows just width and height, as two rows", () => {
    mount();
    type(search(), "size");
    expect([...container.querySelectorAll(".size-editor .property-label")].map((l) => l.textContent)).toEqual([
      "width",
      "height",
    ]);
  });

  it("Tab lands on width with height linked: both selected, both typed, both written as one step", () => {
    element.style.width = "100px";
    element.style.height = "50px";
    mount();
    type(search(), "size");
    key(search(), "Tab");
    const [width, height] = fields() as [HTMLInputElement, HTMLInputElement];
    expect(document.activeElement).toBe(width);
    expect(height.parentElement?.querySelector(".mirror-selection")?.textContent).toBe("50px");
    type(width, "120");
    expect(height.value).toBe("120");
    key(width, "Enter");
    expect(element.style.width).toBe("120px");
    expect(element.style.height).toBe("120px");
    history.undo();
    expect(element.style.width).toBe("100px");
    expect(element.style.height).toBe("50px");
  });

  it("Tab moves on to height, unlinked: a value there sets just height", () => {
    mount();
    type(search(), "size");
    key(search(), "Tab");
    key(fields()[0] as HTMLInputElement, "Tab");
    const height = fields()[1] as HTMLInputElement;
    expect(document.activeElement).toBe(height);
    type(height, "30");
    key(height, "Enter");
    expect(element.style.height).toBe("30px");
    expect(element.style.width).toBe("");
  });

  describe("the linked field: focused look, and the selection where there's a value", () => {
    const enter = () => {
      mount();
      type(search(), "size");
      key(search(), "Tab");
      return fields() as [HTMLInputElement, HTMLInputElement];
    };
    const highlight = (input: HTMLInputElement) => input.parentElement?.querySelector(".mirror-selection");

    it("looks focused too, until width is left", () => {
      const [width, height] = enter();
      expect(height.hasAttribute("data-mirror-focus")).toBe(true);
      expect(width.hasAttribute("data-mirror-focus")).toBe(false); // it has the real focus
      key(width, "Tab");
      expect(height.hasAttribute("data-mirror-focus")).toBe(false);
    });

    it("empty: just the focused look, nothing drawn", () => {
      const [, height] = enter();
      expect(highlight(height)).toBeNull();
      expect(height.parentElement?.querySelector(".mirror-caret")).toBeNull();
    });

    it("with a value: it shows selected", () => {
      element.style.height = "50px";
      const [, height] = enter();
      expect(highlight(height)?.textContent).toBe("50px");
    });
  });
});

