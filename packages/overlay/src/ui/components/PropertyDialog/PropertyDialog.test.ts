// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PropertyEditor, PropertyEditorProps } from "../../../editors/types.ts";
import { PropertyDialog } from "./PropertyDialog.tsx";

// Stub editors: render their id and the values they receive, and expose onChange.
const stub = (id: string, properties: string[], keywords?: string[]): PropertyEditor => ({
  id,
  label: id,
  properties,
  keywords,
  component: ({ values, onChange }: PropertyEditorProps) =>
    h("button", { class: "stub", onClick: () => onChange(properties[0] as string, "0.5") }, `${id}:${JSON.stringify(values)}`),
});

const editors = [stub("opacity", ["opacity"], ["fade"]), stub("padding", ["padding"]), stub("gap", ["gap"])];

let container: HTMLElement;
let element: HTMLElement;

beforeEach(() => {
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
    render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors }), container);
  });

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

  it("applies editor changes as inline styles on the element", () => {
    mount();
    type("opacity");
    act(() => (container.querySelector(".stub") as HTMLButtonElement).click());
    expect(element.style.getPropertyValue("opacity")).toBe("0.5");
  });
});
