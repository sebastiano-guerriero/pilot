// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../edits/history.ts";
import { App } from "./App.tsx";

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
