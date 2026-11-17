// @vitest-environment happy-dom
import type { ElementState, WidthRange } from "@pilot/protocol";
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EDIT_ATTRIBUTE, PREVIEW_ATTRIBUTE } from "../../../dom/preview.ts";
import { EditHistory } from "../../../edits/history.ts";
import type { PropertyEditor, PropertyEditorProps } from "../../../editors/types.ts";
import { PropertyDialog, type WidthPick, dialogPosition, dialogSpot, raisedSpot } from "./PropertyDialog.tsx";

// Stub editors: render their id and the values they receive, expose onChange,
// record the focus requests they get, and can hand focus back to the search.
let focusRequests: Array<{ query: string; edge?: string } | undefined>;
let focusedEditors: string[];
const stub = (id: string, properties: string[]): PropertyEditor => ({
  id,
  label: id,
  properties,
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

const editors = [stub("opacity", ["opacity"]), stub("padding", ["padding"]), stub("gap", ["gap"])];

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
      // listAll off: these tests are about what the search shows.
      h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors, listAll: false, onClose: () => closed++ }),
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

const previewText = () => document.querySelector(`style[${PREVIEW_ATTRIBUTE}]`)?.textContent ?? "";
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
    expect(history.valueOf(element, "opacity")).toBe("0.5");
    expect(history.undo()).toBe(true);
    expect(history.valueOf(element, "opacity")).toBeNull();
  });

  it("shows editor changes on the page through Pilot's stylesheet, never the element's style", () => {
    mount();
    type("opacity");
    act(() => (container.querySelector(".stub") as HTMLButtonElement).click());
    expect(previewText()).toContain("opacity: 0.5 !important");
    expect(element.hasAttribute(EDIT_ATTRIBUTE)).toBe(true);
    expect(element.style.cssText).toBe("");
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
    expect(previewText()).toContain("gap: revert !important");
    style.remove();
  });

  it("with nothing typed, shows the editors for the properties the element has a value for", () => {
    const style = document.createElement("style");
    style.textContent = ".box { gap: 16px; }";
    document.head.append(style);
    element.className = "box";
    element.style.opacity = "0.5";
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors, listAll: false }), container);
    });
    // gap (stylesheet) and opacity (inline), in LIST_ORDER (layout before
    // appearance); padding has no value.
    expect(editorIds()).toEqual(["gap", "opacity"]);
    type("pad");
    expect(editorIds()).toEqual(["padding"]);
    type("");
    expect(editorIds()).toEqual(["gap", "opacity"]);
    style.remove();
  });

  it("leaves an embedded editor to the one that shows it as a row", () => {
    element.style.display = "grid";
    element.style.gap = "8px";
    const gap = stub("gap", ["gap"]);
    const display: PropertyEditor = { ...stub("display", ["display"]), embeds: [gap] };
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: [display, gap], listAll: false }), container);
    });
    expect(editorIds()).toEqual(["display"]);
  });
});

describe("width chip", () => {
  // The dialog with the chip's state kept outside, as App does.
  let pick: (p: WidthPick) => void;
  const mountWithWidths = (history: EditHistory, viewportWidth = 1440, initial: WidthRange | null = null) => {
    function Host() {
      const [widths, setWidths] = useState<WidthRange | null>(initial);
      const [states, setStates] = useState<ElementState[]>([]);
      const [widthPick, setWidthPick] = useState<WidthPick | undefined>();
      pick = setWidthPick;
      return h(PropertyDialog, {
        widthPick,
        element,
        anchor: element.getBoundingClientRect(),
        editors,
        history,
        widths,
        onWidthsChange: setWidths,
        states,
        onStatesChange: setStates,
        viewportWidth,
      });
    }
    act(() => {
      render(h(Host, {}), container);
    });
  };
  const chip = () => container.querySelector('.pill[data-pill="widths"]');
  const statePills = () => [...container.querySelectorAll('.pill[data-pill="state"] .pill-label')].map((p) => p.textContent);

  it("`hover:` at the start becomes a state pill; states combine, with widths too, in any order", () => {
    mountWithWidths(new EditHistory());
    type("hover");
    expect(statePills()).toEqual([]);
    type("active:hover:from-768 opa");
    expect(statePills()).toEqual(["hover", "active"]);
    expect(chip()?.textContent).toContain("from 768px");
    expect(search().value).toBe("opa");
  });

  it("the / menu sets a state right away; Backspace at the start removes the last pill, states first", () => {
    mountWithWidths(new EditHistory(), 1440, { min: 768 });
    type("/foc");
    key(search(), "ArrowDown");
    key(search(), "Enter");
    expect(statePills()).toEqual(["focus-visible"]);
    expect(search().value).toBe("");
    key(search(), "Backspace");
    expect(statePills()).toEqual([]);
    expect(chip()).not.toBeNull();
    key(search(), "Backspace");
    expect(chip()).toBeNull();
  });

  it("a change made with state pills is for those states", () => {
    const history = new EditHistory();
    mountWithWidths(history);
    type("hover:active:opacity");
    act(() => (container.querySelector('[data-editor="opacity"] .stub') as HTMLButtonElement).click());
    expect(history.changes().map((c) => [c.property, c.value, c.states])).toEqual([["opacity", "0.5", ["hover", "active"]]]);
    // Its rule is for those states; while the pills are set, the element shows them.
    const sheet = document.querySelector(`style[${PREVIEW_ATTRIBUTE}]`)?.textContent ?? "";
    expect(sheet).toContain(":hover:active { opacity: 0.5 !important; }");
    expect(sheet).toMatch(/\[data-pilot-edit="\d+"\] \{ opacity: 0\.5 !important; \}/);
    history.clear();
  });

  it("`from-1200 ` at the start becomes the chip; the rest is the search", () => {
    const history = new EditHistory();
    mountWithWidths(history);
    type("from-1200");
    expect(chip()).toBeNull();
    type("from-1200 opa");
    expect(chip()?.textContent).toContain("from 1200px");
    expect(search().value).toBe("opa");
    expect(editorIds()).toEqual(["opacity"]);
  });

  it("changes made with the chip are recorded for its widths", () => {
    const history = new EditHistory();
    mountWithWidths(history, 1440, { min: 768, max: 1199 });
    type("opacity");
    act(() => (container.querySelector(".stub") as HTMLButtonElement).click());
    expect(history.changes()[0]?.widths).toEqual({ min: 768, max: 1199 });
  });

  it("Backspace at the start of the field removes the chip", () => {
    mountWithWidths(new EditHistory(), 1440, { min: 1200 });
    search().setSelectionRange(0, 0);
    key(search(), "Backspace");
    expect(chip()).toBeNull();
  });

  it("marks the chip when the window is outside its range", () => {
    mountWithWidths(new EditHistory(), 900, { min: 1200 });
    expect(chip()?.hasAttribute("data-outside")).toBe(true);
  });

  it("/ opens the modifiers menu; typing filters it", () => {
    mountWithWidths(new EditHistory(), 1108);
    const rows = () => [...container.querySelectorAll(".modifier .modifier-name")].map((n) => n.textContent);
    type("/");
    expect(rows()).toEqual(["From width", "To width", "Hover", "Focus", "Focus visible", "Active"]);
    expect(search().getAttribute("aria-expanded")).toBe("true");
    type("/to");
    expect(rows()).toEqual(["To width"]);
    type("/xyz");
    expect(container.querySelector(".modifier-none")).not.toBeNull();
    type("pt");
    expect(container.querySelector(".modifiers")).toBeNull();
  });

  it("↓ and Enter pick a modifier: its syntax goes in the search, then Tab takes the suggested width", () => {
    mountWithWidths(new EditHistory(), 1108);
    type("/");
    key(search(), "ArrowDown");
    expect(container.querySelector(".modifier[data-active] .modifier-name")?.textContent).toBe("To width");
    key(search(), "Enter");
    expect(search().value).toBe("to-");
    expect(container.querySelector(".modifiers")).toBeNull();
    expect(container.querySelector(".suggestion")?.textContent).toBe("to-1108");
    key(search(), "Tab");
    expect(chip()?.textContent).toContain("to 1108px");
  });

  it("Esc closes the menu and clears the / text; the dialog stays", () => {
    let closed = 0;
    function Host() {
      const [widths, setWidths] = useState<WidthRange | null>(null);
      return h(PropertyDialog, {
        element,
        anchor: element.getBoundingClientRect(),
        editors,
        widths,
        onWidthsChange: setWidths,
        viewportWidth: 1108,
        onClose: () => closed++,
      });
    }
    act(() => {
      render(h(Host, {}), container);
    });
    type("/fr");
    key(search(), "Escape");
    expect(container.querySelector(".modifiers")).toBeNull();
    expect(search().value).toBe("");
    expect(closed).toBe(0);
  });

  it("`from-` suggests the window's width, dimmed; Tab takes it", () => {
    mountWithWidths(new EditHistory(), 1108);
    type("from");
    expect(container.querySelector(".suggestion")).toBeNull();
    type("from-1");
    expect(container.querySelector(".suggestion")?.textContent).toBe("from-1108");
    key(search(), "Tab");
    expect(chip()?.textContent).toContain("from 1108px");
    expect(search().value).toBe("");
    type("to-9");
    expect(container.querySelector(".suggestion")).toBeNull();
  });

  it("clicking the width with `from`/`to` typed: that word decides, and it goes", () => {
    mountWithWidths(new EditHistory(), 1108, { min: 768 });
    type("to");
    act(() => pick({ width: 1108, shift: false }));
    expect(chip()?.textContent).toContain("768–1108px");
  });

  it("the same width at both ends reads `1108px only`", () => {
    mountWithWidths(new EditHistory(), 1108, { min: 1108 });
    type("to");
    act(() => pick({ width: 1108, shift: false }));
    expect(chip()?.textContent).toContain("1108px only");
    expect(search().value).toBe("");
  });

  it("clicking the width with a search typed: the chip as usual, the search stays", () => {
    mountWithWidths(new EditHistory(), 1108);
    type("pad");
    act(() => pick({ width: 1108, shift: true }));
    expect(chip()?.textContent).toContain("to 1108px");
    expect(search().value).toBe("pad");
  });
});

describe("placement", () => {
  const viewport = { width: 1000, height: 800 };
  const noScroll = { x: 0, y: 0 };

  it("picks a spot beside the element: right, else left, else overlapping its right edge", () => {
    expect(dialogSpot({ left: 100, right: 200, top: 50 }, 260, 1000, noScroll)).toEqual({ left: 208, top: 50 });
    expect(dialogSpot({ left: 700, right: 900, top: 50 }, 260, 1000, noScroll)).toEqual({ left: 432, top: 50 });
    expect(dialogSpot({ left: 100, right: 950, top: 50 }, 260, 1000, noScroll)).toEqual({ left: 732, top: 50 });
  });

  it("the spot is in page coordinates: scrolling moves the dialog with the page", () => {
    const spot = dialogSpot({ left: 100, right: 200, top: 300 }, 260, 1000, { x: 0, y: 100 });
    expect(spot).toEqual({ left: 208, top: 400 });
    expect(dialogPosition(spot, { width: 260, height: 200 }, viewport, { x: 0, y: 150 })).toEqual({ left: 208, top: 250 });
  });

  it("stays on screen, 8px from the edges: scrolled past the top, or grown past the bottom", () => {
    const spot = { left: 208, top: 400 };
    expect(dialogPosition(spot, { width: 260, height: 200 }, viewport, { x: 0, y: 600 }).top).toBe(8);
    expect(dialogPosition(spot, { width: 260, height: 500 }, viewport, noScroll).top).toBe(292);
  });

  it("growing past the bottom moves the spot up with it, so shrinking keeps the top", () => {
    const spot = { left: 208, top: 400 };
    // 500px tall: pushed up to 292, and the spot moves there.
    const raised = raisedSpot(spot, { width: 260, height: 500 }, viewport, noScroll);
    expect(raised).toEqual({ left: 208, top: 292 });
    // Shrunk to 100px (the / menu): drawn at the raised spot, not back at 400.
    expect(dialogPosition(raised, { width: 260, height: 100 }, viewport, noScroll).top).toBe(292);
    // Room enough: the spot stays.
    expect(raisedSpot(spot, { width: 260, height: 200 }, viewport, noScroll)).toBe(spot);
    // In page coordinates, and never above the window's top edge.
    expect(raisedSpot({ left: 208, top: 700 }, { width: 260, height: 900 }, viewport, { x: 0, y: 100 })).toEqual({
      left: 208,
      top: 108,
    });
  });

  it("editing the element doesn't move the dialog: its box changing later is ignored", () => {
    const at = (rect: Partial<DOMRect>) => ({ left: 100, right: 200, top: 50, bottom: 80, width: 100, height: 30, ...rect }) as DOMRect;
    const draw = (anchor: DOMRect) =>
      act(() => {
        render(h(PropertyDialog, { element, anchor, editors }), container);
      });
    const dialog = () => container.querySelector(".property-dialog") as HTMLElement;
    draw(at({}));
    const before = [dialog().style.left, dialog().style.top];
    draw(at({ right: 400, top: 120, width: 300 })); // the element grew and moved
    expect([dialog().style.left, dialog().style.top]).toEqual(before);
  });

  it("dragging the top strip moves the dialog, kept on screen", () => {
    // happy-dom's page is 0px wide: give it a real width for the horizontal moves.
    Object.defineProperty(document.documentElement, "clientWidth", { value: 1024, configurable: true });
    const anchor = { left: 100, right: 200, top: 50, bottom: 80, width: 100, height: 30 } as DOMRect;
    act(() => {
      render(h(PropertyDialog, { element, anchor, editors }), container);
    });
    const dialog = () => container.querySelector(".property-dialog") as HTMLElement;
    const handle = container.querySelector(".drag-handle") as HTMLElement;
    const start = [Number.parseFloat(dialog().style.left), Number.parseFloat(dialog().style.top)] as [number, number];
    const pointer = (type: string, x: number, y: number) =>
      act(() => {
        handle.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
      });
    pointer("pointerdown", 10, 4);
    expect(dialog().hasAttribute("data-dragging")).toBe(true);
    pointer("pointermove", 60, 34);
    expect([Number.parseFloat(dialog().style.left), Number.parseFloat(dialog().style.top)]).toEqual([start[0] + 50, start[1] + 30]);
    pointer("pointermove", -5000, -5000); // way off screen: held 8px inside
    expect([dialog().style.left, dialog().style.top]).toEqual(["8px", "8px"]);
    pointer("pointerup", -5000, -5000);
    expect(dialog().hasAttribute("data-dragging")).toBe(false);
    delete (document.documentElement as { clientWidth?: number }).clientWidth;
  });

  it("with nothing typed, the list is grouped: a label per group; searching shows no labels", async () => {
    const { editors: registry } = await import("../../../editors/registry.ts");
    element.style.width = "100px";
    element.style.paddingTop = "4px";
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: registry, listAll: false }), container);
    });
    const labels = () => [...container.querySelectorAll(".group-label")].map((l) => l.textContent);
    expect(labels()).toEqual(["Layout"]);
    expect(container.querySelector(".group-divider")).toBeNull(); // one group: nothing to separate
    type("pad");
    expect(labels()).toEqual([]);
  });

  it("listAll (off by default): with nothing typed, every editor, with a value or not, in list order", async () => {
    const { editors: registry } = await import("../../../editors/registry.ts");
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: registry, listAll: true }), container);
    });
    const ids = editorIds();
    expect(ids[0]).toBe("display");
    expect(ids.slice(0, 7)).toEqual(["display", "width", "min-width", "max-width", "height", "min-height", "max-height"]);
    expect(ids).toContain("padding");
    expect(ids).toContain("aspect-ratio");
    expect(ids).not.toContain("gap"); // shown by display, as its row
    expect(ids).not.toContain("size"); // writes nothing of its own
  });
});

