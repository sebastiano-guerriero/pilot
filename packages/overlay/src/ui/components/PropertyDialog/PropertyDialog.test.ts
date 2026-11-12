// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../../edits/history.ts";
import type { PropertyEditor, PropertyEditorProps } from "../../../editors/types.ts";
import { PropertyDialog } from "./PropertyDialog.tsx";

// Stub editors: render their id and the values they receive, expose onChange,
// record the focus requests they get, and can hand focus back to the search.
let focusRequests: Array<{ query: string; edge?: string } | undefined>;
let focusedEditors: string[];
const stub = (id: string, properties: string[], keywords?: string[]): PropertyEditor => ({
  id,
  label: id,
  properties,
  keywords,
  component: ({ values, onChange, focusRequest, onReturnToSearch, onTabOut }: PropertyEditorProps) => {
    focusRequests.push(focusRequest);
    if (focusRequest) focusedEditors.push(`${id}${focusRequest.edge ? `@${focusRequest.edge}` : ""}`);
    return h("div", {}, [
      h("button", { class: "stub", onClick: () => onChange(properties[0] as string, "0.5") }, `${id}:${JSON.stringify(values)}`),
      h("button", { class: "back", onClick: () => onReturnToSearch?.() }, "back"),
      h("button", { class: "next", onClick: () => onTabOut?.(1) }, "next"),
      h("button", { class: "prev", onClick: () => onTabOut?.(-1) }, "prev"),
    ]);
  },
});

const editors = [stub("opacity", ["opacity"], ["fade"]), stub("padding", ["padding"]), stub("gap", ["gap"])];

let container: HTMLElement;
let element: HTMLElement;

let closed: number;

beforeEach(() => {
  focusRequests = [];
  focusedEditors = [];
  closed = 0;
  container = document.createElement("div");
  element = document.createElement("div");
  document.body.append(container, element);
});

afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const mount = () =>
  act(() => {
    render(
      h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors, onClose: () => closed++ }),
      container,
    );
  });

const search = () => container.querySelector(".property-search input") as HTMLInputElement;
const key = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
const lastFocusRequest = () => focusRequests.at(-1);

const type = (text: string) =>
  act(() => {
    const input = container.querySelector("input") as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

const editorIds = () => [...container.querySelectorAll(".editor")].map((e) => (e as HTMLElement).dataset.editor);

describe("PropertyDialog", () => {
  it("shows only the search field at first", () => {
    mount();
    expect(container.querySelector(".property-search input")).not.toBeNull();
    expect(editorIds()).toEqual([]);
  });

  it("shows just the best-matching editor as you type", () => {
    mount();
    type("opa");
    expect(editorIds()).toEqual(["opacity"]);
    type("fade");
    expect(editorIds()).toEqual(["opacity"]);
    type("pad");
    expect(editorIds()).toEqual(["padding"]);
  });

  it("shows no editor for a blank or unmatched query", () => {
    mount();
    type("   ");
    expect(editorIds()).toEqual([]);
    type("zzz");
    expect(editorIds()).toEqual([]);
  });

  it("records changes in the shared history, so they can be undone", () => {
    const history = new EditHistory();
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors, history }), container);
    });
    type("opacity");
    act(() => (container.querySelector(".stub") as HTMLButtonElement).click());
    expect(element.style.getPropertyValue("opacity")).toBe("0.5");
    expect(history.undo()).toBe(true);
    expect(element.style.getPropertyValue("opacity")).toBe("");
  });

  it("applies editor changes as inline styles on the element", () => {
    mount();
    type("opacity");
    act(() => (container.querySelector(".stub") as HTMLButtonElement).click());
    expect(element.style.getPropertyValue("opacity")).toBe("0.5");
  });

  describe("keyboard", () => {
    it("Tab or Enter moves into the matched editor, telling it what was typed", () => {
      mount();
      type(" Pad ");
      key(search(), "Tab");
      expect(lastFocusRequest()).toEqual({ query: "pad" });
      const first = lastFocusRequest();
      key(search(), "Enter");
      expect(lastFocusRequest()).toEqual({ query: "pad" });
      expect(lastFocusRequest()).not.toBe(first); // a new request each time
    });

    it("does nothing on Tab/Enter without a match, and keeps focus in the search", () => {
      mount();
      type("zzz");
      key(search(), "Tab");
      expect(editorIds()).toEqual([]);
    });

    it("drops the focus request as soon as the query changes", () => {
      mount();
      type("opacity");
      key(search(), "Enter");
      type("gap");
      expect(lastFocusRequest()).toBeUndefined();
    });

    it("returns to the search, text selected, when the editor asks", () => {
      mount();
      type("opacity");
      act(() => (container.querySelector(".back") as HTMLButtonElement).click());
      expect(document.activeElement).toBe(search());
      expect([search().selectionStart, search().selectionEnd]).toEqual([0, "opacity".length]);
    });

    it("Esc steps back: editor → search → clear search → close", () => {
      mount();
      type("opacity");
      key(container.querySelector(".stub") as Element, "Escape");
      expect(document.activeElement).toBe(search());
      expect(closed).toBe(0);
      key(search(), "Escape");
      expect(search().value).toBe("");
      expect(closed).toBe(0);
      key(search(), "Escape");
      expect(closed).toBe(1);
    });
  });

  describe("footer", () => {
    const footer = () => container.querySelector(".footer")?.textContent?.replace(/\s+/g, " ").trim() ?? null;

    it("only appears with a matched property", () => {
      mount();
      expect(footer()).toBeNull();
      type("zzz");
      expect(footer()).toBeNull();
      type("opa");
      expect(footer()).toBe("Tab or Enter to edit");
    });

    it("switches to the editor's keys while a property is being edited, and back", () => {
      mount();
      type("opacity");
      act(() => (container.querySelector(".stub") as HTMLButtonElement).focus());
      expect(footer()).toBe("Enter to apply, Esc to go back");
      key(container.querySelector(".stub") as Element, "Escape");
      expect(footer()).toBe("Tab or Enter to edit");
    });

    it("marks the keys up as <kbd>", () => {
      mount();
      type("opa");
      expect([...container.querySelectorAll(".footer kbd")].map((k) => k.textContent)).toEqual(["Tab", "Enter"]);
    });
  });

  describe("several editors", () => {
    const family = [
      stub("width", ["width"]),
      { ...stub("min-width", ["min-width"]), family: "width" },
      { ...stub("max-width", ["max-width"]), family: "width" },
    ];
    const mountFamily = () =>
      act(() => {
        render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: family }), container);
      });
    const click = (id: string, cls: string) =>
      act(() => (container.querySelector(`.editor[data-editor="${id}"] .${cls}`) as HTMLButtonElement).click());

    it("shows the whole family for its main property, in order", () => {
      mountFamily();
      type("width");
      expect(editorIds()).toEqual(["width", "min-width", "max-width"]);
      type("min-width");
      expect(editorIds()).toEqual(["min-width"]);
    });

    it("Tab from the search focuses the first; Tab out of each moves to the next, then back to the search", () => {
      mountFamily();
      type("width");
      key(search(), "Tab");
      click("width", "next");
      click("min-width", "next");
      expect(focusedEditors).toEqual(["width", "min-width@first", "max-width@first"]);
      click("max-width", "next");
      expect(document.activeElement).toBe(search());
    });

    it("Shift+Tab out goes to the previous editor's last field, and from the first back to the search", () => {
      mountFamily();
      type("width");
      key(search(), "Tab");
      click("width", "next");
      click("min-width", "prev");
      expect(focusedEditors.at(-1)).toBe("width@last");
      click("width", "prev");
      expect(document.activeElement).toBe(search());
    });
  });

  describe("page areas from several editors", () => {
    it("combines them, so one editor clearing doesn't wipe another's", () => {
      const shown: Array<string[] | null> = [];
      const reporter = (id: string, side: "top" | "right"): PropertyEditor => ({
        ...stub(id, [id]),
        aliases: ["both"],
        component: ({ onInspect }: PropertyEditorProps) =>
          h("div", {}, [
            h("button", { class: `${id}-on`, onClick: () => onInspect?.([{ box: "padding", side }]) }, "on"),
            h("button", { class: `${id}-off`, onClick: () => onInspect?.(null) }, "off"),
          ]),
      });
      act(() => {
        render(
          h(PropertyDialog, {
            element,
            anchor: element.getBoundingClientRect(),
            editors: [reporter("a", "top"), reporter("b", "right")],
            onInspect: (areas) => shown.push(areas ? areas.map((x) => ("side" in x ? x.side : x.box)) : null),
          }),
          container,
        );
      });
      type("both");
      const click = (cls: string) => act(() => (container.querySelector(`.${cls}`) as HTMLButtonElement).click());
      click("b-on");
      click("a-on");
      click("b-off"); // b reports "nothing" after a reported its area
      expect(shown.at(-1)).toEqual(["top"]);
      click("a-off");
      expect(shown.at(-1)).toBeNull();
    });
  });
});

describe("declared values", () => {
  it("editors get the CSS that applies to the element, from stylesheets and inline styles", () => {
    const style = document.createElement("style");
    style.textContent = ".box { max-width: 50%; padding: 10px 18px; }";
    document.head.append(style);
    element.className = "box";
    element.style.paddingTop = "4px";
    let received: Record<string, string> | undefined;
    const probe: PropertyEditor = {
      id: "probe",
      label: "probe",
      properties: ["max-width", "padding-top", "padding-right", "width"],
      component: ({ declared }: PropertyEditorProps) => {
        received = declared;
        return null;
      },
    };
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: [probe] }), container);
    });
    type("probe");
    expect(received).toEqual({ "max-width": "50%", "padding-top": "4px", "padding-right": "18px", width: "" });
    style.remove();
  });

  it("an editor also gets the values of the editors it embeds", () => {
    element.style.justifyContent = "center";
    let received: Record<string, string> | undefined;
    const embedded: PropertyEditor = { ...stub("justify-content", ["justify-content"]) };
    const host: PropertyEditor = {
      id: "host",
      label: "host",
      properties: ["display"],
      embeds: [embedded],
      component: ({ declared }: PropertyEditorProps) => {
        received = declared;
        return null;
      },
    };
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: [host] }), container);
    });
    type("host");
    expect(received).toEqual({ display: "", "justify-content": "center" });
  });

  it("clearing a value the page's CSS sets removes it: the editor gets nothing, the page shows the fallback", () => {
    const style = document.createElement("style");
    style.textContent = ".box { gap: 16px; }";
    document.head.append(style);
    element.className = "box";
    let received: Record<string, string> | undefined;
    let change: PropertyEditorProps["onChange"] | undefined;
    const probe: PropertyEditor = {
      id: "probe",
      label: "probe",
      properties: ["gap"],
      component: ({ declared, onChange }: PropertyEditorProps) => {
        received = declared;
        change = onChange;
        return null;
      },
    };
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: [probe] }), container);
    });
    type("probe");
    expect(received).toEqual({ gap: "16px" });
    act(() => change?.("gap", ""));
    expect(received).toEqual({ gap: "" });
    expect(element.style.gap).toBe("revert");
    style.remove();
  });
});
