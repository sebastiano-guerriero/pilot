// @vitest-environment happy-dom
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { menuPosition, PropertySelect, typeaheadMatch } from "./PropertySelect.tsx";

let container: HTMLElement;
let changes: string[];
let tabs: Array<1 | -1>;
let escapes: number;

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return h(
    "div",
    { onKeyDown: (e: KeyboardEvent) => e.key === "Escape" && escapes++ },
    h(PropertySelect, {
      value,
      options: ["block", "inline-block", "flex", "inline-flex", "grid"],
      label: "display",
      onChange: (v: string) => {
        changes.push(v);
        setValue(v);
      },
      onTab: (d: 1 | -1) => tabs.push(d),
    }),
  );
}

const mount = (initial = "") => act(() => render(h(Harness, { initial }), container));

beforeEach(() => {
  changes = [];
  tabs = [];
  escapes = 0;
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const trigger = () => container.querySelector('[role="combobox"]') as HTMLButtonElement;
const menu = () => container.querySelector('[role="listbox"]');
const options = () => [...container.querySelectorAll('[role="option"]')] as HTMLElement[];
const active = () => options().find((o) => o.hasAttribute("data-active"))?.textContent;
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    trigger().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  });

describe("PropertySelect", () => {
  it("with no value, the trigger says Select, dimmed", () => {
    mount();
    expect(trigger().textContent).toBe("Select");
    expect(trigger().querySelector(".placeholder")).not.toBeNull();
    expect(menu()).toBeNull();
  });

  it("a click opens the menu; clicking an option picks it and closes", () => {
    mount();
    act(() => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(options().map((o) => o.textContent)).toEqual(["Select", "block", "inline-block", "flex", "inline-flex", "grid"]);
    act(() => options()[3]?.click());
    expect(changes).toEqual(["flex"]);
    expect(menu()).toBeNull();
    expect(trigger().textContent).toBe("flex");
  });

  it("the current value is checked, and highlighted when the menu opens", () => {
    mount("flex");
    key("Enter");
    const checked = options().filter((o) => o.getAttribute("aria-selected") === "true");
    expect(checked.map((o) => o.textContent)).toEqual(["flex"]);
    expect(checked[0]?.querySelector(".icon")).not.toBeNull();
    expect(active()).toBe("flex");
    expect(trigger().getAttribute("aria-activedescendant")).toBe(checked[0]?.id);
  });

  it("keyboard: ↓/↑ move, Home/End jump, Enter picks", () => {
    mount();
    key("ArrowDown");
    expect(active()).toBe("Select"); // opens on the current value: none
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowDown");
    expect(active()).toBe("flex");
    key("ArrowUp");
    expect(active()).toBe("inline-block");
    key("End");
    expect(active()).toBe("grid");
    key("ArrowDown"); // stays on the last
    expect(active()).toBe("grid");
    key("Home");
    expect(active()).toBe("Select");
    key("ArrowDown");
    key("Enter");
    expect(changes).toEqual(["block"]);
    expect(menu()).toBeNull();
  });

  it("the Select option is dimmed, checked while nothing is set, and picking it removes the value", () => {
    mount();
    act(() => trigger().click());
    const select = options()[0] as HTMLElement;
    expect(select.querySelector(".placeholder")).not.toBeNull();
    expect(select.getAttribute("aria-selected")).toBe("true");
    act(() => options()[1]?.click()); // block
    act(() => trigger().click());
    expect(options()[0]?.getAttribute("aria-selected")).toBe("false");
    act(() => options()[0]?.click());
    expect(changes).toEqual(["block", ""]);
    expect(trigger().textContent).toBe("Select");
  });

  it("typing jumps to the first option starting with it", () => {
    mount();
    key(" ");
    key("i");
    key("n");
    key("l");
    expect(active()).toBe("inline-block");
    key("g");
    // "inlg" matches nothing: the highlight stays
    expect(active()).toBe("inline-block");
  });

  it("closed, typing picks right away, without opening the menu", () => {
    mount();
    key("f");
    expect(changes).toEqual(["flex"]);
    expect(menu()).toBeNull();
    expect(trigger().textContent).toBe("flex");
  });

  it("closed, repeating a letter cycles through the options starting with it", () => {
    let now = 1_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    mount();
    for (const _ of [1, 2, 3]) {
      key("i");
      now += 100; // within the type-ahead window: "i", "ii", "iii"
    }
    expect(changes).toEqual(["inline-block", "inline-flex", "inline-block"]);
    now += 1_000; // a pause starts a new search
    key("g");
    expect(changes.at(-1)).toBe("grid");
    clock.mockRestore();
  });

  it("closed, several letters narrow the match instead of cycling", () => {
    mount();
    key("i");
    key("n");
    key("l");
    key("i");
    key("n");
    key("e");
    key("-");
    key("f");
    expect(changes).toEqual(["inline-block", "inline-flex"]);
  });

  it("closed, typing never picks Select, and Space still opens the menu", () => {
    mount("grid");
    key("s"); // no option starts with "s": "Select" isn't matched
    expect(changes).toEqual([]);
    key(" ");
    expect(menu()).not.toBeNull();
  });

  it("Esc closes only the menu; closed, it reaches the dialog", () => {
    mount();
    key("Enter");
    key("Escape");
    expect(menu()).toBeNull();
    expect(escapes).toBe(0);
    expect(changes).toEqual([]);
    key("Escape");
    expect(escapes).toBe(1);
  });

  it("Tab closes the menu and moves on, without picking", () => {
    mount();
    key("Enter");
    key("ArrowDown");
    key("Tab", { shiftKey: true });
    expect(menu()).toBeNull();
    expect(tabs).toEqual([-1]);
    expect(changes).toEqual([]);
  });

  it("Backspace removes the value; picking the same value changes nothing", () => {
    mount("grid");
    key("Enter");
    key("Enter");
    expect(changes).toEqual([]);
    key("Backspace");
    expect(changes).toEqual([""]);
    expect(trigger().textContent).toBe("Select");
  });

  it("hovering highlights an option", () => {
    mount();
    act(() => trigger().click());
    act(() => {
      options()[4]?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    });
    expect(active()).toBe("inline-flex");
  });

  it("a value that isn't offered is still listed, right after Select", () => {
    mount("table");
    act(() => trigger().click());
    expect(options()[1]?.textContent).toBe("table");
  });

  it("losing focus closes the menu", () => {
    mount();
    act(() => trigger().focus());
    key("Enter");
    act(() => trigger().blur());
    expect(menu()).toBeNull();
  });
});

describe("menuPosition", () => {
  const viewport = { width: 1000, height: 800 };
  const menu = { width: 136, height: 224 };

  it("puts the current option over the trigger, options lined up with its edges", () => {
    // The 6th option (index 5) is 4px padding + 5 × 24px down the menu.
    expect(menuPosition({ trigger: { left: 300, top: 400 }, menu, optionTop: 4 + 5 * 24, viewport })).toEqual({
      left: 296,
      top: 276,
    });
  });

  it("with no value, the first option covers the trigger", () => {
    expect(menuPosition({ trigger: { left: 300, top: 400 }, menu, optionTop: 4, viewport })).toEqual({ left: 296, top: 396 });
  });

  it("moves left by the label shift, so the option's label lands on the trigger's", () => {
    expect(menuPosition({ trigger: { left: 300, top: 400 }, menu, optionTop: 4, labelShift: 18, viewport }).left).toBe(278);
  });

  it("stays inside the viewport", () => {
    // Near the top: the menu can't go above 8px.
    expect(menuPosition({ trigger: { left: 300, top: 40 }, menu, optionTop: 4 + 8 * 24, viewport }).top).toBe(8);
    // Near the bottom and the right edge.
    expect(menuPosition({ trigger: { left: 950, top: 790 }, menu, optionTop: 4, viewport })).toEqual({
      left: 1000 - 8 - 136,
      top: 800 - 8 - 224,
    });
  });
});

describe("typeaheadMatch", () => {
  const list = ["", "block", "inline-block", "inline", "flex", "inline-flex", "grid"];

  it("one letter goes to the next option starting with it, wrapping around", () => {
    expect(typeaheadMatch(list, "i", 0)).toBe(2);
    expect(typeaheadMatch(list, "i", 2)).toBe(3);
    expect(typeaheadMatch(list, "i", 5)).toBe(2);
    expect(typeaheadMatch(list, "g", 6)).toBe(6); // the only g: stays
  });

  it("a repeated letter cycles like a single one", () => {
    expect(typeaheadMatch(list, "ii", 2)).toBe(3);
  });

  it("several letters match from the current option itself", () => {
    expect(typeaheadMatch(list, "in", 2)).toBe(2);
    expect(typeaheadMatch(list, "inline-f", 2)).toBe(5);
    expect(typeaheadMatch(list, "x", 0)).toBe(-1);
  });
});

describe("icon variant", () => {
  const icons: Record<string, string> = { block: "B", flex: "F" };
  const mountIcons = (initial = "") =>
    act(() =>
      render(
        h(PropertySelect, {
          value: initial,
          options: ["block", "flex", "grid"],
          label: "display",
          onChange: (v: string) => changes.push(v),
          iconFor: (v: string) => (icons[v] ? h("i", {}, icons[v]) : null),
        }),
        container,
      ),
    );

  it("shows the value's icon before its text on the trigger", () => {
    mountIcons("flex");
    expect(trigger().querySelector(".option-icon")?.textContent).toBe("F");
    expect(trigger().querySelector(".option-icon + .value")?.textContent).toBe("flex");
  });

  it("every option has an icon slot, empty where a value has none, so labels line up", () => {
    mountIcons("flex");
    act(() => trigger().click());
    const slots = options().map((o) => o.querySelector(".content .option-icon")?.textContent);
    expect(slots).toEqual(["", "B", "F", ""]); // Select, block, flex, grid
    // The checkmark column comes first, then the icon and label together.
    const checked = options().find((o) => o.getAttribute("aria-selected") === "true") as HTMLElement;
    expect([...checked.children].map((c) => c.className)).toEqual(["check", "content"]);
  });

  it("without iconFor, there are no icon slots", () => {
    mount("flex");
    act(() => trigger().click());
    expect(container.querySelector(".option-icon")).toBeNull();
  });
});

describe("PropertySelect: scrolling", () => {
  it("anything else scrolling closes the menu, as a native select; its own list scrolling doesn't", () => {
    const list = document.createElement("div"); // the dialog's list, say
    document.body.append(list);
    mount("flex");
    act(() => trigger().click());
    expect(menu()).toBeTruthy();
    act(() => void menu()?.dispatchEvent(new Event("scroll")));
    expect(menu()).toBeTruthy();
    act(() => void list.dispatchEvent(new Event("scroll")));
    expect(menu()).toBeNull();
    expect(changes).toEqual([]); // nothing picked
    list.remove();
  });
});

