// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { justifyItemsEditor } from "../justify/JustifyItemsEditor.tsx";
import { matchEditors } from "../registry.ts";
import type { PropertyEditor } from "../types.ts";
import { alignContentEditor } from "./AlignContentEditor.tsx";
import { alignSelfEditor, justifySelfEditor } from "./SelfEditors.tsx";

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

const trigger = () => container.querySelector('[role="combobox"]') as HTMLButtonElement;
const options = () => [...container.querySelectorAll('[role="option"]')] as HTMLElement[];
const labelOf = (o: HTMLElement) => o.querySelector(".label")?.textContent;
const hasIcon = (o: HTMLElement) => !!o.querySelector(".option-icon svg");

describe("justify-items, align-content, align-self, justify-self", () => {
  it("are icon selects labeled with their property, an icon for every value", () => {
    for (const [editor, label, values] of [
      [justifyItemsEditor, "justify-items", ["start", "center", "end", "stretch"]],
      [alignContentEditor, "align-content", ["start", "end", "center", "space-between", "space-around", "space-evenly", "stretch"]],
      [alignSelfEditor, "align-self", ["auto", "start", "center", "end", "stretch", "baseline"]],
      [justifySelfEditor, "justify-self", ["auto", "start", "center", "end", "stretch"]],
    ] as const) {
      mount(editor);
      expect(container.querySelector(".property-label")?.textContent).toBe(label);
      act(() => trigger().click());
      expect(options().map(labelOf)).toEqual(["Select", ...values]);
      for (const o of options()) expect(hasIcon(o), `${label} ${labelOf(o)}`).toBe(true);
      act(() => trigger().click());
    }
  });

  it("picking a value writes its own property", () => {
    mount(alignSelfEditor);
    act(() => trigger().click());
    act(() => options().find((o) => labelOf(o) === "end")?.click());
    expect(changes).toEqual([["align-self", "end"]]);
  });

  it("Tailwind's names find each one", () => {
    for (const [q, id] of [
      ["justify-items", "justify-items"],
      ["justify-items-center", "justify-items"],
      ["content-between", "align-content"],
      ["align-content", "align-content"],
      ["self", "align-self"],
      ["self-end", "align-self"],
      ["justify-self", "justify-self"],
      ["justify-self-start", "justify-self"],
      ["items", "align-items"],
    ] as const) {
      expect(matchEditors(q).map((e) => e.id), q).toEqual([id]);
    }
  });
});
