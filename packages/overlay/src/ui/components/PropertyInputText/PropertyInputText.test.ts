// @vitest-environment happy-dom
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoCloseParens, PropertyInputText } from "./PropertyInputText.tsx";

let commits: string[];
let steps: Array<[number, string]>;
let submits: number;
let tabs: number[];
let setValue: (v: string) => void;

function Harness() {
  const [value, set] = useState("100%");
  setValue = set;
  return h(PropertyInputText, {
    value,
    label: "Width",
    onCommit: (t: string) => {
      commits.push(t);
      set(t);
    },
    onStep: (d: number, t: string) => steps.push([d, t]),
    onSubmit: () => submits++,
    onTab: (dir: 1 | -1) => tabs.push(dir),
  });
}

function EmptyPropertyInputText({ compact = false }: { compact?: boolean }) {
  return h(PropertyInputText, { value: "", label: "Width", compact, onCommit: () => {} });
}

/** The box diagram's variant, holding `value`. */
function CompactPropertyInputText({ value }: { value: string }) {
  return h(PropertyInputText, { value, label: "Width", compact: true, onCommit: () => {} });
}

let container: HTMLElement;
beforeEach(() => {
  commits = [];
  steps = [];
  submits = 0;
  tabs = [];
  container = document.createElement("div");
  document.body.append(container);
  act(() => render(h(Harness, {}), container));
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const input = () => container.querySelector("input") as HTMLInputElement;
const typeText = (text: string) =>
  act(() => {
    input().value = text;
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  });
const selected = () => input().value.slice(input().selectionStart ?? 0, input().selectionEnd ?? 0);

describe("PropertyInputText", () => {
  it("is a text input showing the value", () => {
    expect(input().type).toBe("text");
    expect(input().value).toBe("100%");
    expect(input().getAttribute("aria-label")).toBe("Width");
  });

  it("a regular field fills its slot: no content sizing", () => {
    expect(input().style.getPropertyValue("--chars")).toBe("");
  });

  it("a compact field sizes itself to its content (ch fallback)", () => {
    act(() => render(h(CompactPropertyInputText, { value: "100%" }), container));
    expect(input().style.getPropertyValue("--chars")).toBe("4");
    act(() => input().focus());
    typeText("fit-content");
    expect(input().style.getPropertyValue("--chars")).toBe("11");
  });

  it("selects everything on the first click", () => {
    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      input().dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(selected()).toBe("100%");
    const again = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      input().dispatchEvent(again);
    });
    expect(again.defaultPrevented).toBe(false); // native caret once editing
  });

  it("passes an empty commit when the field is cleared (reset)", () => {
    act(() => input().focus());
    typeText("");
    key("Enter");
    expect(commits).toEqual([""]);
  });

  it("a focused empty compact field shows its placeholder as selected, until typed into", () => {
    act(() => render(h(EmptyPropertyInputText, { compact: true }), container));
    expect(input().hasAttribute("data-placeholder-selected")).toBe(false);
    act(() => input().focus());
    expect(input().hasAttribute("data-placeholder-selected")).toBe(true);
    typeText("1");
    expect(input().hasAttribute("data-placeholder-selected")).toBe(false);
    typeText(""); // deleting what was typed: no longer "selected"
    expect(input().hasAttribute("data-placeholder-selected")).toBe(false);
  });

  it("with no value, a regular field is simply empty: no placeholder, no selected look", () => {
    act(() => render(h(EmptyPropertyInputText, { compact: false }), container));
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("");
    act(() => input().focus());
    expect(input().hasAttribute("data-placeholder-selected")).toBe(false);
  });

  it("with no value, a compact field shows a dimmed dash, and sizes to it", () => {
    act(() => render(h(EmptyPropertyInputText, { compact: true }), container));
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("—");
    expect(input().style.getPropertyValue("--chars")).toBe("1");
  });

  it("Enter commits once, then submits", () => {
    act(() => input().focus());
    typeText("50%");
    key("Enter");
    expect(commits).toEqual(["50%"]);
    expect(submits).toBe(1);
  });

  it("doesn't commit an unchanged value", () => {
    act(() => input().focus());
    act(() => input().blur());
    expect(commits).toEqual([]);
  });

  it("Esc discards what was typed", () => {
    act(() => input().focus());
    typeText("12px");
    key("Escape");
    expect(input().value).toBe("100%");
    act(() => input().blur());
    expect(commits).toEqual([]);
  });

  it("arrows ask for a step with the current text (Shift = 10)", () => {
    act(() => input().focus());
    key("ArrowUp");
    key("ArrowDown", { shiftKey: true });
    expect(steps).toEqual([
      [1, "100%"],
      [-10, "100%"],
    ]);
  });

  it("Tab and Shift+Tab are handed to the editor", () => {
    act(() => input().focus());
    key("Tab");
    key("Tab", { shiftKey: true });
    expect(tabs).toEqual([1, -1]);
  });

  it("shows an outside change (undo, step) while editing, selected", () => {
    act(() => input().focus());
    act(() => setValue("101%"));
    expect(input().value).toBe("101%");
    expect(selected()).toBe("101%");
  });
});

describe("autoCloseParens", () => {
  // `|` marks the caret (or a selection, with two of them).
  const run = (marked: string, key: string) => {
    const start = marked.indexOf("|");
    const end = marked.lastIndexOf("|") - (marked.indexOf("|") === marked.lastIndexOf("|") ? 0 : 1);
    const text = marked.replace(/\|/g, "");
    const out = autoCloseParens(text, start, end, key);
    return out && `${out.value.slice(0, out.caret)}|${out.value.slice(out.caret)}`;
  };

  it("( inserts a pair, caret inside", () => {
    expect(run("var|", "(")).toBe("var(|)");
    expect(run("min(100%, |)", "(")).toBe("min(100%, (|))");
  });

  it("( wraps the selection", () => {
    expect(run("|100% - 2px|", "(")).toBe("(100% - 2px|)");
  });

  it(") steps over a closing parenthesis instead of doubling it", () => {
    expect(run("var(--gap|)", ")")).toBe("var(--gap)|");
    expect(run("|)", ")")).toBeNull(); // nothing open: type it normally
    expect(run("var(--gap|", ")")).toBeNull(); // no ) ahead
  });

  it("Backspace in an empty pair deletes both", () => {
    expect(run("calc(|)", "Backspace")).toBe("calc|");
    expect(run("calc(1|)", "Backspace")).toBeNull();
  });

  it("leaves other keys alone", () => {
    expect(run("12|", "p")).toBeNull();
  });
});

// What a browser fires before inserting typed text (cancelable).
const insert = (data: string) =>
  act(() => {
    input().dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data, bubbles: true, cancelable: true }));
  });

describe("PropertyInputText parentheses", () => {
  it("types var(--gap) with the closing parenthesis added and stepped over", () => {
    act(() => input().focus());
    typeText("var");
    input().setSelectionRange(3, 3);
    insert("(");
    expect([input().value, input().selectionStart]).toEqual(["var()", 4]);
    act(() => {
      input().value = "var(--gap)";
      input().setSelectionRange(9, 9);
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    insert(")");
    expect([input().value, input().selectionStart]).toEqual(["var(--gap)", 10]);
    key("Enter");
    expect(commits).toEqual(["var(--gap)"]);
  });
});
