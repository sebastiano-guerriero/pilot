// @vitest-environment happy-dom
import { type ComponentChildren, h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PropertyPanel } from "./PropertyPanel.tsx";

let container: HTMLElement;
let closed: Array<[string, boolean | undefined]>;
let toggles: Record<string, (open: boolean) => void>;

/** A panel `name`, opened and closed from outside (`toggles`), with what's inside it. */
function Panel({ name, children }: { name: string; children?: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  toggles[name] = setOpen;
  if (!open) return null;
  return h(PropertyPanel, {
    title: name,
    beside: () => null,
    onClose: (replaced?: boolean) => {
      closed.push([name, replaced]);
      setOpen(false);
    },
    children,
  });
}

const shown = () => [...container.querySelectorAll(".property-panel")].map((p) => p.getAttribute("aria-label"));
const toggle = (name: string, open: boolean) => act(() => toggles[name]!(open));

beforeEach(() => {
  closed = [];
  toggles = {};
  container = document.createElement("div");
  document.body.append(container);
  // Two panels opened from the dialog (a shadow, a color), and a color picker opened from inside the shadow's.
  act(() => {
    render(h("div", null, h(Panel, { name: "Shadow" }, h(Panel, { name: "Shadow color" })), h(Panel, { name: "Color" })), container);
  });
});
afterEach(() => {
  render(null, container);
  container.remove();
});

describe("PropertyPanel", () => {
  it("one open at a time: opening one closes the others, as replaced (the focus stays in the new one)", () => {
    toggle("Shadow", true);
    expect(shown()).toEqual(["Shadow"]);
    toggle("Color", true);
    expect(shown()).toEqual(["Color"]);
    expect(closed).toEqual([["Shadow", true]]);
  });

  it("a panel opened from inside another keeps that one open; opening another closes both", () => {
    toggle("Shadow", true);
    toggle("Shadow color", true);
    expect(shown()).toEqual(["Shadow", "Shadow color"]);
    expect(closed).toEqual([]);
    toggle("Color", true);
    expect(shown()).toEqual(["Color"]);
  });

  it("× closes it, not as replaced (the focus goes back to what opened it)", () => {
    toggle("Shadow", true);
    act(() => (container.querySelector(".panel-close") as HTMLButtonElement).click());
    expect(shown()).toEqual([]);
    expect(closed).toEqual([["Shadow", undefined]]);
  });
});
