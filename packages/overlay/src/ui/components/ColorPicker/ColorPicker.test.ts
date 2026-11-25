// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { textColorEditor } from "../../../editors/color/ColorEditor.tsx";
import { maxChroma } from "../../../css/colorSpace.ts";
import { EditHistory } from "../../../edits/history.ts";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let declared: Record<string, string>;
let changes: Array<[string, string]>;

// The color field, its color read from `declared` (the dialog's job); a change is applied and shown.
const mount = () =>
  act(() => {
    render(
      h(textColorEditor.component, {
        element,
        values: { color: "rgb(255, 0, 0)" },
        declared: { ...declared },
        onChange: (p: string, v: string, o?: { gesture?: object }) => {
          changes.push([p, v]);
          history.apply(element, p, v, o?.gesture);
          declared[p] = v;
          mount();
        },
        onRevert: () => {},
      }),
      container,
    );
  });

beforeEach(() => {
  history = new EditHistory();
  declared = { color: "#ff0000" };
  changes = [];
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const picker = () => container.querySelector('.property-panel[aria-label="Color"]');
const open = () => act(() => (container.querySelector(".color-swatch-button") as HTMLButtonElement).click());
// A row's label, or each of its parts' (split: lightness, chroma, hue in one row).
const labels = () =>
  [...(picker()?.querySelectorAll(".panel-rows .property-label") ?? [])].flatMap((l) => {
    const parts = [...l.querySelectorAll(".row-labels > span")];
    return parts.length ? parts.map((p) => p.textContent) : [l.textContent];
  });
const field = (label: string) => picker()?.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const typeAndEnter = (label: string, text: string) => {
  const input = field(label);
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};
const pickModel = (name: string) => {
  act(() => (picker()?.querySelector('[role="combobox"][aria-label="color model"]') as HTMLButtonElement).click());
  const option = [...container.querySelectorAll('[role="option"]')].find((o) => o.querySelector(".label")?.firstChild?.textContent === name);
  act(() => (option as HTMLElement).click());
};

describe("color picker", () => {
  it("the swatch opens it: no header, the area and the hue strip, then model (Hex for a hex), value, opacity", () => {
    mount();
    expect(picker()).toBeNull();
    open();
    expect(picker()?.querySelector(".panel-header")).toBeNull();
    expect(picker()?.querySelector(".color-area .color-handle")).toBeTruthy();
    expect(picker()?.querySelector(".hue-strip .hue-handle")).toBeTruthy();
    expect(labels()).toEqual(["model", "value", "opacity"]);
    expect(field("color value").value).toBe("#FF0000");
    expect(field("opacity").value).toBe("100%");
    // The value field has the variables button (the page's color tokens).
    expect(field("color value").closest("[data-tokens]")).toBeTruthy();
  });

  it("Hex: a value typed writes the hex; an opacity, the 8-digit hex; any CSS color comes out a hex", () => {
    mount();
    open();
    pickModel("Hex");
    typeAndEnter("color value", "00ff00");
    expect(changes.at(-1)).toEqual(["color", "#00ff00"]);
    typeAndEnter("opacity", "50");
    expect(changes.at(-1)).toEqual(["color", "#00ff0080"]);
    typeAndEnter("color value", "oklch(0.628 0.2577 29.23)");
    expect(changes.at(-1)).toEqual(["color", "#ff000080"]);
  });

  it("a variable (typed by its name, or picked) is written as it is; the field shows its name, its opacity stays", () => {
    mount();
    open();
    pickModel("Hex");
    typeAndEnter("color value", "--brand");
    expect(changes.at(-1)).toEqual(["color", "var(--brand)"]);
    expect(field("color value").value).toBe("--brand");
    typeAndEnter("opacity", "50");
    expect(changes.at(-1)).toEqual(["color", "color-mix(in srgb, var(--brand) 50%, transparent)"]);
  });

  it("OKLCH: one value with a split button; split, lightness, chroma, hue; it writes oklch(), its opacity in its own syntax", () => {
    mount();
    open();
    pickModel("OKLCH");
    expect(labels()).toEqual(["model", "value", "opacity"]);
    expect(field("color value").value).toBe("oklch(0.628 0.258 29.2)");
    const toggle = () => picker()?.querySelector(".split-toggle") as HTMLButtonElement;
    expect(toggle().textContent).toBe("lch");
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect([...toggle().querySelectorAll(".lch-letter")].map((l) => l.textContent)).toEqual(["l", "c", "h"]);
    expect(labels()).toEqual(["model", "lightness", "chroma", "hue", "opacity"]);
    expect(Number(field("lightness").value)).toBeCloseTo(0.628, 2);
    typeAndEnter("lightness", "0.5");
    expect(changes.at(-1)?.[1]).toMatch(/^oklch\(0\.5 0\.2\d+ 29\.\d\)$/);
    typeAndEnter("opacity", "40");
    expect(changes.at(-1)?.[1]).toMatch(/^oklch\(0\.5 .+ \/ 40%\)$/);
    // Back to one value: typed, in OKLCH.
    act(() => toggle().click());
    expect(labels()).toEqual(["model", "value", "opacity"]);
    typeAndEnter("color value", "#0000ff");
    expect(changes.at(-1)?.[1]).toBe("oklch(0.452 0.313 264.1 / 40%)");
  });

  it("dragging the area is one undo step, saturation across and brightness down, at the hue", () => {
    mount();
    open();
    // The model picked last stays for the page (the OKLCH test's): Hex here.
    pickModel("Hex");
    const area = picker()?.querySelector(".color-area") as HTMLElement;
    area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 252, height: 180, right: 252, bottom: 180, x: 0, y: 0, toJSON: () => ({}) });
    const send = (type: string, init: PointerEventInit) => act(() => void area.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init })));
    send("pointerdown", { clientX: 126, clientY: 90, button: 0 });
    // Back where it was: the color the drag started from is written again, not skipped.
    send("pointermove", { clientX: 252, clientY: 0 });
    send("pointerup", {});
    expect(changes.map(([, v]) => v)).toEqual(["#804040", "#ff0000"]);
    history.undo();
    expect(history.changes()).toEqual([]);
  });

  it("OKLCH: the area is lightness down and chroma across up to the most the screen shows (relative); the strip is OKLCH's hue", () => {
    mount();
    open();
    pickModel("OKLCH");
    const box = (el: Element, width: number, height: number) => {
      (el as HTMLElement).getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
    };
    const area = picker()?.querySelector(".color-area") as HTMLElement;
    const strip = picker()?.querySelector(".hue-strip") as HTMLElement;
    box(area, 228, 180);
    box(strip, 228, 12);
    const press = (el: HTMLElement, x: number, y: number) => {
      act(() => void el.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, bubbles: true })));
      act(() => void el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    };
    // Red's hue in OKLCH is ~29: the area keeps it; half lightness, and half the most chroma red shows there.
    press(area, 114, 90);
    const half = (maxChroma(0.5, 29.2339) / 2).toFixed(3);
    expect(changes.at(-1)?.[1]).toBe(`oklch(0.5 ${Number(half)} 29.2)`);
    // The strip's middle is OKLCH's 180, and the hue field (split) says so; the handle keeps its spot (half the most cyan shows).
    if (!field("hue")) act(() => (picker()?.querySelector(".split-toggle") as HTMLButtonElement).click());
    press(strip, 114, 6);
    const cyan = changes.at(-1)?.[1] as string;
    expect(cyan).toMatch(/^oklch\(0\.5 [\d.]+ 180\)$/);
    expect(Number(cyan.split(" ")[1])).toBeCloseTo(maxChroma(0.5, 180) / 2, 2);
    expect(field("hue").value).toBe("180");
    expect(picker()?.querySelector(".color-area canvas")).toBeTruthy();
  });

  it("pressing the handle itself drags it (at an edge, half of it hangs outside the area)", () => {
    mount();
    open();
    pickModel("Hex");
    const area = picker()?.querySelector(".color-area") as HTMLElement;
    area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 252, height: 180, right: 252, bottom: 180, x: 0, y: 0, toJSON: () => ({}) });
    const handle = area.querySelector(".color-handle") as HTMLElement;
    // Red: the handle is at the top-right corner; pressed on its outer half, past the area.
    act(() => void handle.dispatchEvent(new PointerEvent("pointerdown", { clientX: 256, clientY: -3, button: 0, bubbles: true })));
    act(() => void area.dispatchEvent(new PointerEvent("pointermove", { clientX: 126, clientY: 90, bubbles: true })));
    act(() => void area.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    expect(changes.at(-1)).toEqual(["color", "#804040"]);
  });

  it("a click outside it closes it; on the swatch, it toggles", () => {
    mount();
    open();
    act(() => void document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true })));
    expect(picker()).toBeNull();
    open();
    open();
    expect(picker()).toBeNull();
  });
});
