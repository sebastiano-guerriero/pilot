// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentWidget } from "./CommentWidget.tsx";

let container: HTMLElement;
let element: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  element = document.createElement("button");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const field = () => container.querySelector(".field") as HTMLTextAreaElement;
const type = (value: string) =>
  act(() => {
    field().value = value;
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
const press = (key: string) =>
  act(() => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });

function draw(onSend = vi.fn(() => "sent" as const)) {
  act(() =>
    render(
      h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose: () => {}, agentOn: true }),
      container,
    ),
  );
  return onSend;
}

describe("CommentWidget's / actions", () => {
  it("/ lists the actions; Enter picks one as a chip, and Send sends it with the words", async () => {
    const onSend = draw();
    await type("/resp");
    expect([...container.querySelectorAll(".action-option .action-name")].map((e) => e.textContent)).toEqual(["Make responsive"]);
    await press("Enter");
    expect(container.querySelector(".composer .action-chip")?.textContent).toBe("Make responsive");
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("Add details (optional)");
    await type("Two columns on tablet");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Two columns on tablet", [], "responsive");
  });

  it("an action can go alone; Backspace at the start removes it; Esc closes only the menu", async () => {
    const onSend = draw();
    await type("/");
    await press("Escape");
    expect(field().value).toBe("");
    expect(container.querySelector(".comment-widget")).not.toBeNull();
    await type("/");
    await press("Tab");
    await press("Backspace");
    expect(container.querySelector(".composer .action-chip")).toBeNull();
    await type("/");
    await press("Enter");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("", [], "responsive");
  });
});
