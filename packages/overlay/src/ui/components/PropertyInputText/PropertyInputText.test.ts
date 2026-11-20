// @vitest-environment happy-dom
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoCloseParens, PropertyInputText } from "./PropertyInputText.tsx";

let commits: string[];
let steps: Array<[number, string]>;
let gestures: Array<object | undefined>;
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
    onStep: (d: number, t: string, g?: object) => {
      steps.push([d, t]);
      gestures.push(g);
    },
    onSubmit: () => submits++,
    onTab: (dir: 1 | -1) => tabs.push(dir),
  });
}

function EmptyPropertyInputText() {
  return h(PropertyInputText, { value: "", label: "Width", onCommit: () => {} });
}

let container: HTMLElement;
beforeEach(() => {
  commits = [];
  steps = [];
  gestures = [];
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

  it("with no value, the field is simply empty: no placeholder", () => {
    act(() => render(h(EmptyPropertyInputText, {}), container));
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("");
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

  it("the wheel steps like the arrows while editing, a burst as one gesture; otherwise it scrolls", () => {
    const wheel = (deltaY: number, at: number, shiftKey = false) => {
      const e = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
      Object.defineProperty(e, "timeStamp", { value: at });
      Object.defineProperty(e, "shiftKey", { value: shiftKey });
      act(() => void input().dispatchEvent(e));
      return e.defaultPrevented;
    };
    expect(wheel(-100, 0)).toBe(false); // not being edited: the dialog scrolls
    expect(steps).toEqual([]);
    act(() => input().focus());
    expect(wheel(-100, 1000)).toBe(true);
    wheel(-100, 1050);
    wheel(100, 1100, true);
    // A trackpad's small deltas add up: a step per 24px.
    wheel(-10, 2000);
    wheel(-10, 2020);
    wheel(-10, 2040);
    wheel(-10, 2060);
    expect(steps.map(([d]) => d)).toEqual([1, 1, -10, 1, 1]);
    expect(gestures[0]).toBe(gestures[2]);
    expect(gestures[3]).not.toBe(gestures[2]); // after a pause: a new undo step
    expect(gestures[4]).toBe(gestures[3]);
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

describe("icon variant", () => {
  it("draws the icon at the field's left and makes room for it", () => {
    act(() => render(h(PropertyInputText, { value: "12px", label: "Gap", icon: h("i", {}, "I"), onCommit: () => {} }), container));
    const wrap = container.querySelector(".input-wrap") as HTMLElement;
    expect(wrap.querySelector(".input-icon")?.textContent).toBe("I");
    expect(input().hasAttribute("data-icon")).toBe(true);
    expect(input().value).toBe("12px");
  });

  it("without an icon or a handle, the field isn't wrapped", () => {
    act(() => render(h(PropertyInputText, { value: "12px", label: "Gap", onCommit: () => {} }), container));
    expect(container.querySelector(".input-wrap")).toBeNull();
    expect(input().hasAttribute("data-icon")).toBe(false);
  });
});

describe("PropertyInputText's variables", () => {
  let style: HTMLStyleElement;
  let committed: string[];
  beforeEach(() => {
    style = document.createElement("style");
    style.textContent = ":root { --space-2: 8px; --space-4: 16px; --color-accent: #1cf69e; }";
    document.head.append(style);
    committed = [];
    act(() =>
      render(
        h(PropertyInputText, { value: "16px", label: "padding-top", tokens: { kinds: ["length"], property: "padding-top" }, onCommit: (t: string) => committed.push(t) }),
        container,
      ),
    );
  });
  afterEach(() => style.remove());
  const input = () => container.querySelector("input") as HTMLInputElement;
  const names = () => [...container.querySelectorAll(".token-option .token-name")].map((e) => e.textContent);
  const typeIn = (text: string) =>
    act(() => {
      input().value = text;
      input().setSelectionRange(text.length, text.length);
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
  const press = (key: string) =>
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });

  it("`--` lists the page's tokens that fit the field (no colors in a length), and Enter puts var(--name) at the caret", () => {
    act(() => input().focus());
    typeIn("calc(--");
    expect(names()).toEqual(["--space-2", "--space-4"]);
    typeIn("calc(--sp4");
    expect(names()).toEqual([]);
    typeIn("calc(--space-4");
    press("Enter");
    expect(input().value).toBe("calc(var(--space-4)");
    expect(committed).toEqual([]); // picked, not committed yet: the value goes on
    expect(container.querySelector(".token-menu")).toBeNull();
  });

  const active = () => container.querySelector(".token-option[data-active] .token-name")?.textContent ?? null;
  const checked = () => container.querySelector(".token-option[data-current] .token-name")?.textContent ?? null;
  const openList = () => act(() => (container.querySelector(".token-button") as HTMLButtonElement).click());

  it("the button on a field holding a variable opens on it, checked, as a select; Enter keeps it", () => {
    act(() =>
      render(
        h(PropertyInputText, { value: "--space-4", label: "padding-top", tokens: { kinds: ["length"], property: "padding-top" }, onCommit: (t: string) => committed.push(t) }),
        container,
      ),
    );
    openList();
    expect(checked()).toBe("--space-4");
    expect(active()).toBe("--space-4");
    expect(container.querySelectorAll(".token-check").length).toBe(2); // a column on every row
    press("ArrowUp");
    expect(active()).toBe("--space-2");
    press("ArrowDown");
    press("Enter");
    expect(container.querySelector(".token-menu")).toBeNull();
    expect(input().value).toBe("--space-4"); // kept as it is
  });

  it("on any other value, nothing is highlighted (no checkmarks); ↓ starts at the top, ↑ at the bottom", () => {
    openList(); // the field holds 16px
    expect(active()).toBeNull();
    expect(checked()).toBeNull();
    expect(container.querySelector(".token-check")).toBeNull();
    press("ArrowUp");
    expect(active()).toBe("--space-4");
    press("ArrowDown");
    expect(active()).toBe("--space-2");
  });

  it("typing: a bare `--` highlights nothing, a name its first match", () => {
    act(() => input().focus());
    typeIn("--");
    expect(active()).toBeNull();
    typeIn("--space");
    expect(active()).toBe("--space-2");
  });

  it("in math, the variable at the caret is the current one, and a pick replaces just it", () => {
    act(() =>
      render(
        h(PropertyInputText, { value: "calc(var(--space-2) * 2)", label: "padding-top", tokens: { kinds: ["length"], property: "padding-top" }, onCommit: () => {} }),
        container,
      ),
    );
    act(() => input().focus());
    act(() => input().setSelectionRange(12, 12)); // inside var(--space-2)
    openList();
    expect(checked()).toBe("--space-2");
    act(() => (container.querySelectorAll(".token-option")[1] as HTMLElement).click());
    expect(input().value).toBe("calc(var(--space-4) * 2)");
  });

  it("Esc closes only the list; the button opens it, and a pick takes the whole value when the field wasn't being edited", () => {
    act(() => input().focus());
    typeIn("--");
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      input().dispatchEvent(escape);
    });
    expect(container.querySelector(".token-menu")).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
    act(() => input().blur());
    act(() => (container.querySelector(".token-button") as HTMLButtonElement).click());
    expect(names()).toEqual(["--space-2", "--space-4"]);
    act(() => (container.querySelectorAll(".token-option")[0] as HTMLElement).click());
    expect(input().value).toBe("var(--space-2)");
    // Applied at once: the page shows it without leaving the field.
    expect(committed.at(-1)).toBe("var(--space-2)");
  });

  it("typed: a variable alone is applied at once; inside math, the value goes on", () => {
    act(() => input().focus());
    typeIn("--space-4");
    press("Enter");
    expect(committed).toEqual(["var(--space-4)"]);
    typeIn("calc(--space-2");
    press("Enter");
    expect(committed).toEqual(["var(--space-4)"]); // not yet: still typing the calc
  });
});

