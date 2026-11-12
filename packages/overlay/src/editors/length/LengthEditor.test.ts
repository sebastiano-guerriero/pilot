// @vitest-environment happy-dom
import type { BoxArea } from "../../dom/boxModel.ts";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { paddingLeftEditor, paddingTopEditor } from "../padding/PaddingEditor.tsx";
import { maxWidthEditor, minWidthEditor, widthEditor } from "../width/WidthEditor.tsx";
import { lengthEditor } from "./LengthEditor.tsx";

const WidthEditor = widthEditor.component;

let element: HTMLElement;
let container: HTMLElement;
let changes: Array<[string, string]>;
let returned: number;
let history: EditHistory;

const mount = (computed: string, focusRequest?: { query: string }) =>
  act(() => {
    render(
      h(WidthEditor, {
        element,
        values: { width: computed },
        onChange: (p: string, v: string) => {
          changes.push([p, v]);
          history.apply(element, p, v);
        },
        focusRequest,
        onReturnToSearch: () => returned++,
      }),
      container,
    );
  });

beforeEach(() => {
  changes = [];
  returned = 0;
  history = new EditHistory();
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const input = () => container.querySelector("input") as HTMLInputElement;
const typeAndEnter = (text: string) => {
  act(() => input().focus());
  act(() => {
    input().value = text;
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("WidthEditor", () => {
  it("with no width set, the field is empty, not the computed width", () => {
    mount("122.456px");
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("");
  });

  it("shows a width set on the element, even if it's the default", () => {
    element.style.width = "50%";
    mount("61px");
    expect(input().value).toBe("50%");
    element.style.width = "auto";
    mount("61px");
    expect(input().value).toBe("auto");
  });

  it("clearing the field removes the width (back to the default), undoably", () => {
    element.style.width = "10px";
    mount("10px");
    typeAndEnter("");
    expect(changes).toEqual([["width", ""]]);
    expect(element.style.getPropertyValue("width")).toBe("");
    mount("122px");
    expect(input().value).toBe("");
    history.undo();
    expect(element.style.getPropertyValue("width")).toBe("10px");
  });

  it("clearing an empty field changes nothing", () => {
    mount("122px");
    typeAndEnter("");
    expect(changes).toEqual([]);
  });

  it("arrows on an empty field step from the computed width", () => {
    mount("122px", { query: "w" });
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    });
    expect(changes).toEqual([["width", "123px"]]);
  });

  it("applies typed widths: bare numbers as px, units and keywords as typed", () => {
    mount("122px");
    typeAndEnter("120");
    typeAndEnter("50%");
    typeAndEnter("fit-content");
    expect(changes).toEqual([
      ["width", "120px"],
      ["width", "50%"],
      ["width", "fit-content"],
    ]);
    expect(returned).toBe(3); // Enter goes back to the search
  });

  it("math needs no calc(): it's added on apply and never shown", () => {
    mount("122px");
    typeAndEnter("100% - 20px");
    expect(changes).toEqual([["width", "calc(100% - 20px)"]]);
    mount("300px");
    expect(input().value).toBe("100% - 20px");
    typeAndEnter("calc(50% + 1rem)");
    expect(changes.at(-1)).toEqual(["width", "calc(50% + 1rem)"]);
    mount("300px");
    expect(input().value).toBe("50% + 1rem");
  });

  it("ignores invalid text", () => {
    mount("122px");
    typeAndEnter("wide");
    expect(changes).toEqual([]);
  });

  it("focuses the value, selected, when coming from the search", () => {
    element.style.width = "122px";
    mount("122px", { query: "w" });
    expect(document.activeElement).toBe(input());
    expect(input().value.slice(input().selectionStart ?? 0, input().selectionEnd ?? 0)).toBe("122px");
  });

  it("Tab returns to the search", () => {
    mount("122px", { query: "w" });
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(returned).toBe(1);
  });
});

describe("min-width and max-width", () => {
  const mountEditor = (editor: typeof widthEditor, extra: Record<string, unknown> = {}) =>
    act(() => {
      render(
        h(editor.component, {
          element,
          values: { [editor.properties[0] as string]: "" },
          onChange: (p: string, v: string) => changes.push([p, v]),
          ...extra,
        }),
        container,
      );
    });

  it("the label is the property; nothing set leaves the field empty", () => {
    mountEditor(minWidthEditor);
    expect(container.querySelector(".property-label")?.textContent).toBe("min-width");
    expect(input().value).toBe("");
    mountEditor(maxWidthEditor);
    expect(container.querySelector(".property-label")?.textContent).toBe("max-width");
    expect(input().value).toBe("");
  });

  it("writes its own property; max-width accepts none", () => {
    mountEditor(maxWidthEditor);
    typeAndEnter("none");
    typeAndEnter("640");
    expect(changes).toEqual([
      ["max-width", "none"],
      ["max-width", "640px"],
    ]);
  });

  it("Tab hands over to the next editor when there is one", () => {
    const outs: number[] = [];
    mountEditor(minWidthEditor, { focusRequest: { query: "w", edge: "first" }, onTabOut: (d: number) => outs.push(d) });
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(outs).toEqual([-1]);
  });
});

describe("padding rows", () => {
  let inspects: Array<string[] | null>;
  const mountRow = (editor: typeof paddingTopEditor, computed: string) =>
    act(() => {
      render(
        h(editor.component, {
          element,
          values: { [editor.properties[0] as string]: computed },
          onChange: (p: string, v: string) => changes.push([p, v]),
          onInspect: (areas: BoxArea[] | null) =>
            inspects.push(areas ? areas.map((a) => `${a.box}-${"side" in a ? a.side : ""}`) : null),
        }),
        container,
      );
    });
  beforeEach(() => {
    inspects = [];
  });

  it("the page's own padding isn't shown: with nothing inline, the field is empty", () => {
    mountRow(paddingTopEditor, "10px");
    expect(container.querySelector(".property-label")?.textContent).toBe("padding-top");
    expect(input().value).toBe("");
    mountRow(paddingLeftEditor, "0px");
    expect(input().value).toBe("");
  });

  it("an inline value wins", () => {
    element.style.paddingTop = "1rem";
    mountRow(paddingTopEditor, "16px");
    expect(input().value).toBe("1rem");
  });

  it("stripes that padding on the page while the row is hovered or focused", () => {
    mountRow(paddingTopEditor, "10px");
    const row = container.querySelector(".length-editor") as HTMLElement;
    act(() => {
      row.dispatchEvent(new PointerEvent("pointerenter"));
    });
    expect(inspects.at(-1)).toEqual(["padding-top"]);
    act(() => {
      row.dispatchEvent(new PointerEvent("pointerleave"));
    });
    expect(inspects.at(-1)).toBeNull();
    act(() => input().focus());
    expect(inspects.at(-1)).toEqual(["padding-top"]);
  });
});

describe("drag to scrub", () => {
  // An opt-in option: a width row with a handle, for these tests.
  const ScrubbedWidth = lengthEditor({ property: "width", label: "Width", scrub: true }).component;
  let gestures: object[];
  let reverts: number;
  const mountScrub = (component = ScrubbedWidth) =>
    act(() => {
      render(
        h(component, {
          element,
          values: { width: "100px" },
          onChange: (p: string, v: string, o?: { gesture?: object }) => {
            changes.push([p, v]);
            if (o?.gesture) gestures.push(o.gesture);
            history.apply(element, p, v, o?.gesture);
          },
          onRevert: (p: string, g: object) => {
            reverts++;
            history.revert(element, p, g);
          },
        }),
        container,
      );
    });
  const handle = () => container.querySelector(".scrub-handle") as HTMLElement;
  const down = (y: number) =>
    act(() => {
      handle().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientY: y }));
    });
  // Moves and the release happen wherever the pointer is: off the handle, over the page.
  const move = (y: number, init: PointerEventInit = {}) =>
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY: y, ...init }));
    });
  const up = () =>
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    });

  beforeEach(() => {
    gestures = [];
    reverts = 0;
  });

  it("is an option: fields don't have a handle unless asked", () => {
    mountScrub(WidthEditor);
    expect(handle()).toBeNull();
    expect(input().hasAttribute("data-scrub")).toBe(false);
    mountScrub();
    expect(handle()).not.toBeNull();
    expect(input().hasAttribute("data-scrub")).toBe(true);
  });

  it("dragging up increases, 1 per pixel, from the value the drag started at, as one undo step", () => {
    element.style.width = "100px";
    mountScrub();
    down(100);
    move(95);
    move(90);
    expect(changes).toEqual([
      ["width", "105px"],
      ["width", "110px"],
    ]);
    expect(gestures[0]).toBe(gestures[1]);
    up();
    act(() => {
      history.undo();
    });
    expect(element.style.width).toBe("100px");
  });

  it("follows changes of direction, even far off the handle", () => {
    element.style.width = "100px";
    mountScrub();
    down(500);
    for (const y of [480, 440, 400, 440, 480, 500, 520]) move(y);
    expect(changes.map(([, v]) => v)).toEqual(["120px", "160px", "200px", "160px", "120px", "80px"]);
    expect(reverts).toBe(1); // passing the start restores the exact earlier value
    up();
    move(400); // after the release, moves do nothing
    expect(changes.at(-1)).toEqual(["width", "80px"]);
  });

  it("down decreases; Shift steps by 10; the unit is kept", () => {
    element.style.width = "50%";
    mountScrub();
    down(100);
    move(102); // 2px down: -2
    move(98, { shiftKey: true }); // 2px up, ×10: +20
    expect(changes.map(([, v]) => v)).toEqual(["48%", "70%"]);
  });

  it("back where it started: the earlier value is restored exactly", () => {
    element.style.width = "100px";
    mountScrub();
    down(100);
    move(90);
    move(100);
    expect(reverts).toBe(1);
    expect(element.style.width).toBe("100px");
  });

  // A gap row whose computed value follows the edits, as on a real page.
  const ScrubbedGap = lengthEditor({ property: "gap", label: "Gap", scrub: true }).component;
  const mountGap = () =>
    act(() => {
      render(
        h(ScrubbedGap, {
          element,
          values: { gap: element.style.gap || "normal" },
          onChange: (p: string, v: string, o?: { gesture?: object }) => {
            history.apply(element, p, v, o?.gesture);
            mountGap();
          },
          onRevert: (p: string, g: object) => {
            reverts++;
            history.revert(element, p, g);
            mountGap();
          },
        }),
        container,
      );
    });

  it("from an empty field: starts at 0 (up is 1px), and turning back goes down", () => {
    mountGap();
    down(100);
    move(99);
    expect(element.style.gap).toBe("1px");
    move(90);
    expect(element.style.gap).toBe("10px");
    move(95); // turned back
    expect(element.style.gap).toBe("5px");
  });

  it("from an empty field: back at the start is 0, never empty again", () => {
    mountGap();
    down(100);
    move(90);
    move(100);
    expect(element.style.gap).toBe("0px");
    expect(reverts).toBe(0);
  });

  it("at 0, dragging further down doesn't count: turning back goes up right away", () => {
    mountGap();
    down(100);
    move(150); // 50px down, held at 0
    expect(element.style.gap).toBe("0px");
    move(145); // 5px back up
    expect(element.style.gap).toBe("5px");
  });

  it("the same from a value: down to 0, then up right away", () => {
    element.style.gap = "10px";
    mountGap();
    down(100);
    move(140); // 40px down: 0, not -30
    expect(element.style.gap).toBe("0px");
    move(137);
    expect(element.style.gap).toBe("3px");
  });

  it("rem and other font-relative units step by 0.1", () => {
    element.style.width = "2rem";
    mountScrub();
    down(100);
    move(97); // 3px up: +3 steps
    expect(changes.at(-1)).toEqual(["width", "2.3rem"]);
  });
});
