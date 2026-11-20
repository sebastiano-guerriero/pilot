// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditHistory } from "../edits/history.ts";
import { App } from "./App.tsx";
import { CHANGE_SHOWN_MS } from "./components/PropertyDialog/PropertyDialog.tsx";

let host: HTMLElement;
let page: HTMLElement;

beforeEach(() => {
  page = document.createElement("button");
  page.textContent = "Page button";
  host = document.createElement("div");
  document.body.append(page, host);
  act(() => render(h(App, { host, history: new EditHistory(), onQuit: () => {} }), host));
});

afterEach(() => {
  render(null, host);
  host.remove();
  page.remove();
});

const cursor = () => host.querySelector('[aria-label="Select element"]') as HTMLButtonElement;
const selecting = () => cursor().getAttribute("aria-pressed") === "true";
const dialogOpen = () => host.querySelector(".property-dialog") !== null;
const esc = (target: EventTarget = document.body) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, composed: true }));
  });

describe("App: Esc", () => {
  it("turns the select tool off when nothing is selected", () => {
    act(() => cursor().click());
    expect(selecting()).toBe(true);
    esc();
    expect(selecting()).toBe(false);
  });

  it("first clears the selection, then turns the tool off", () => {
    act(() => cursor().click());
    act(() => page.click()); // select mode: the click selects the element
    expect(dialogOpen()).toBe(true);
    esc();
    expect(dialogOpen()).toBe(false);
    expect(selecting()).toBe(true);
    esc();
    expect(selecting()).toBe(false);
  });

  it("does nothing when the tool is off", () => {
    const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("App: the search carries over between selections", () => {
  const search = () => host.querySelector(".property-search input") as HTMLInputElement;
  const type = (text: string) =>
    act(() => {
      search().value = text;
      search().dispatchEvent(new Event("input", { bubbles: true }));
    });

  it("selecting another element keeps the query, selected so typing replaces it", () => {
    const other = document.createElement("button");
    document.body.append(other);
    act(() => cursor().click());
    act(() => page.click());
    type("col-span");
    act(() => other.click());
    expect(search().value).toBe("col-span");
    expect([search().selectionStart, search().selectionEnd]).toEqual([0, "col-span".length]);
    expect(host.querySelector('.editor[data-editor="grid-column"]')).not.toBeNull();
    other.remove();
  });

  it("starts empty again once nothing is selected", () => {
    act(() => cursor().click());
    act(() => page.click());
    type("gap");
    esc(); // clears the selection
    act(() => page.click());
    expect(search().value).toBe("");
  });
});

describe("App: tool shortcuts", () => {
  const altKey = (target: EventTarget, code: string) => {
    const e = new KeyboardEvent("keydown", { key: code === "KeyV" ? "√" : "ç", code, altKey: true, bubbles: true, cancelable: true, composed: true });
    act(() => {
      target.dispatchEvent(e);
    });
    return e;
  };

  it("Option+V in the comment box switches to Select, typing nothing", () => {
    act(() => (host.querySelector('[aria-label="Comment"]') as HTMLButtonElement).click());
    act(() => page.click());
    const box = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(box).not.toBeNull();
    const e = altKey(box, "KeyV");
    expect(e.defaultPrevented).toBe(true);
    expect(selecting()).toBe(true);
  });

  it("not in the page's own fields", () => {
    const field = document.createElement("textarea");
    document.body.append(field);
    field.focus();
    const e = altKey(field, "KeyV");
    expect(e.defaultPrevented).toBe(false);
    expect(selecting()).toBe(false);
    field.remove();
  });
});

describe("App: changing an Appearance property hides the highlights", () => {
  const search = () => host.querySelector(".property-search input") as HTMLInputElement;
  const type = (text: string) =>
    act(() => {
      search().value = text;
      search().dispatchEvent(new Event("input", { bubbles: true }));
    });
  const outline = () => host.querySelector('.highlight[data-variant="selected"]');
  const field = (label: string) => host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const focus = (el: HTMLElement) =>
    act(() => {
      el.focus();
    });
  const key = (el: HTMLElement, k: string) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    });
  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("not on focus; ↑/↓ and Enter hide them for a second after the last change", () => {
    act(() => cursor().click());
    act(() => page.click());
    type("opacity");
    focus(field("opacity"));
    expect(outline()).not.toBeNull(); // the focus alone keeps them
    key(field("opacity"), "ArrowDown");
    expect(outline()).toBeNull();
    expect(host.querySelector('.highlight[data-variant="dots"]')).toBeNull();
    wait(CHANGE_SHOWN_MS - 1);
    expect(outline()).toBeNull();
    wait(1);
    expect(outline()).not.toBeNull();
    // A new value, Enter: the same.
    act(() => {
      field("opacity").value = "50";
      field("opacity").dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(outline()).not.toBeNull(); // typing isn't a change yet
    key(field("opacity"), "Enter");
    expect(outline()).toBeNull();
    wait(CHANGE_SHOWN_MS);
    expect(outline()).not.toBeNull();
  });

  it("a Layout property keeps them", () => {
    act(() => cursor().click());
    act(() => page.click());
    type("width");
    focus(field("width"));
    key(field("width"), "ArrowUp");
    expect(outline()).not.toBeNull();
  });
});
