// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../../edits/history.ts";
import { copiedProperties, copyProperties } from "../../propertyClipboard.ts";
import { PropertyDialog } from "./PropertyDialog.tsx";

let container: HTMLElement;
let a: HTMLElement;
let b: HTMLElement;
let history: EditHistory;

beforeEach(() => {
  copyProperties([]);
  history = new EditHistory();
  container = document.createElement("div");
  a = document.createElement("div");
  b = document.createElement("div");
  document.body.append(container, a, b);
});
afterEach(() => {
  render(null, container);
  container.remove();
  a.remove();
  b.remove();
});

const open = (element: HTMLElement) =>
  act(() => {
    render(h(PropertyDialog, { key: element === a ? "a" : "b", element, anchor: element.getBoundingClientRect(), history, initialQuery: "opacity", onClose: () => {} }), container);
  });
const rightClick = (text: string) => {
  const label = [...container.querySelectorAll(".property-label")].find((l) => l.textContent === text) as HTMLElement;
  act(() => {
    label.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, clientX: 10, clientY: 10 }));
  });
};
const items = () => [...container.querySelectorAll(".context-item")].map((i) => `${i.textContent}${i.hasAttribute("aria-disabled") ? " (off)" : ""}`);
const pick = (label: string) =>
  act(() => ([...container.querySelectorAll(".context-item")].find((i) => i.textContent === label) as HTMLElement).click());

describe("the menu on a property's name", () => {
  it("Copy CSS, Copy properties, Paste properties; nothing set or copied, they're off", () => {
    open(a);
    rightClick("opacity");
    expect(items()).toEqual(["Copy CSS (off)", "Copy properties (off)", "Paste properties (off)"]);
  });

  it("copies the row's properties from one element and pastes them on another, as an undoable edit", () => {
    history.apply(a, "opacity", "0.5");
    open(a);
    rightClick("opacity");
    pick("Copy properties");
    expect(copiedProperties()).toEqual([["opacity", "0.5"]]);
    expect(container.querySelector(".context-menu")).toBeNull();
    open(b);
    rightClick("opacity");
    pick("Paste properties");
    expect(history.valueOf(b, "opacity")).toBe("0.5");
    act(() => {
      history.undo();
    });
    expect(history.valueOf(b, "opacity")).toBeNull();
  });

  it("Esc closes only the menu", () => {
    open(a);
    rightClick("opacity");
    act(() => {
      (container.querySelector(".context-menu") as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(container.querySelector(".context-menu")).toBeNull();
    expect(container.querySelector(".property-dialog")).not.toBeNull();
  });
});
