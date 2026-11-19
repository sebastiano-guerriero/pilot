// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { clampChanges, lineClampEditor } from "./LineClampEditor.tsx";

describe("clampChanges", () => {
  const none = () => "";

  it("a number brings what -webkit-line-clamp needs", () => {
    expect(clampChanges("3", none)).toEqual([
      ["-webkit-line-clamp", "3"],
      ["display", "-webkit-box"],
      ["-webkit-box-orient", "vertical"],
      ["overflow", "hidden"],
    ]);
  });

  it("leaves what's already set to what it needs", () => {
    const set: Record<string, string> = { display: "-webkit-box", "-webkit-box-orient": "vertical", overflow: "hidden" };
    expect(clampChanges("2", (p) => set[p] ?? "")).toEqual([["-webkit-line-clamp", "2"]]);
  });

  it("cleared or none: clears the companions it set, and leaves the page's own", () => {
    const set: Record<string, string> = { display: "flex", "-webkit-box-orient": "vertical", overflow: "hidden" };
    const expected = [
      ["-webkit-box-orient", ""],
      ["overflow", ""],
    ];
    expect(clampChanges("", (p) => set[p] ?? "")).toEqual([["-webkit-line-clamp", ""], ...expected]);
    expect(clampChanges("none", (p) => set[p] ?? "")).toEqual([["-webkit-line-clamp", "none"], ...expected]);
  });
});

describe("line-clamp editor", () => {
  let element: HTMLElement;
  let container: HTMLElement;
  let history: EditHistory;

  const mount = () =>
    act(() => {
      render(
        h(lineClampEditor.component, {
          element,
          values: {},
          declared: Object.fromEntries(
            ["-webkit-line-clamp", "display", "-webkit-box-orient", "overflow"].map((p) => [p, history.valueOf(element, p) ?? ""]),
          ),
          onChange: (p: string, v: string, o?: { gesture?: object }) => {
            history.apply(element, p, v, o?.gesture);
            mount();
          },
        }),
        container,
      );
    });

  beforeEach(() => {
    history = new EditHistory(inlinePreview());
    element = document.createElement("div");
    container = document.createElement("div");
    document.body.append(element, container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
    element.remove();
  });

  it("is labeled line-clamp, and one undo takes the whole clamp back", () => {
    mount();
    const input = container.querySelector('input[aria-label="line-clamp"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    act(() => input.focus());
    act(() => {
      input.value = "3";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(history.valueOf(element, "-webkit-line-clamp")).toBe("3");
    expect(history.valueOf(element, "display")).toBe("-webkit-box");
    expect(history.valueOf(element, "overflow")).toBe("hidden");
    act(() => void history.undo());
    for (const p of ["-webkit-line-clamp", "display", "-webkit-box-orient", "overflow"]) {
      expect(history.valueOf(element, p), p).toBeNull();
    }
  });
});
