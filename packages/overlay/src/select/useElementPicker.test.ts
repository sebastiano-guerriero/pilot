// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useElementPicker } from "./useElementPicker.ts";

describe("useElementPicker", () => {
  let host: HTMLElement;
  let root: HTMLElement;
  let picks: Element[];
  const Harness = () => {
    useElementPicker(true, host, (el) => picks.push(el));
    return null;
  };
  beforeEach(() => {
    picks = [];
    host = document.createElement("pilot-root");
    root = document.createElement("div");
    document.body.append(host, root);
    act(() => render(h(Harness, null), host));
  });
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    root.remove();
  });
  const press = (el: Element, events: string[]) => {
    for (const type of events) {
      const init = { bubbles: true, composed: true, cancelable: true, button: 0 };
      el.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init));
    }
  };

  it("picks on click", () => {
    const button = document.createElement("button");
    root.append(button);
    press(button, ["pointerdown", "pointerup", "click"]);
    expect(picks).toEqual([button]);
  });

  it("a disabled button, which gets no click, is picked on pointerup; once, if a click follows anyway", () => {
    const button = document.createElement("button");
    button.disabled = true;
    root.append(button);
    press(button, ["pointerdown", "pointerup"]);
    expect(picks).toEqual([button]);
    press(button, ["pointerdown", "pointerup", "click"]);
    expect(picks).toEqual([button, button]);
  });
});
