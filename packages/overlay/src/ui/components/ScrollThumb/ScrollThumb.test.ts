// @vitest-environment happy-dom
import { createRef, h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it } from "vitest";
import { ScrollThumb, thumbGeometry } from "./ScrollThumb.tsx";

describe("thumbGeometry", () => {
  it("nothing to scroll: no thumb", () => {
    expect(thumbGeometry({ scrollTop: 0, scrollHeight: 300, clientHeight: 300 })).toBeNull();
  });

  it("its length is the visible share; it runs 4px from each end", () => {
    // 400 of 800 visible: half the 392px track.
    expect(thumbGeometry({ scrollTop: 0, scrollHeight: 800, clientHeight: 400 })).toEqual({ top: 4, height: 196 });
    expect(thumbGeometry({ scrollTop: 400, scrollHeight: 800, clientHeight: 400 })).toEqual({ top: 200, height: 196 });
    expect(thumbGeometry({ scrollTop: 200, scrollHeight: 800, clientHeight: 400 })).toEqual({ top: 102, height: 196 });
  });

  it("never shorter than 20px", () => {
    expect(thumbGeometry({ scrollTop: 0, scrollHeight: 100000, clientHeight: 400 })?.height).toBe(20);
  });
});

describe("ScrollThumb", () => {
  const mount = (scrollHeight: number, clientHeight: number) => {
    const frame = document.createElement("div");
    const list = document.createElement("div");
    frame.append(list);
    document.body.append(frame);
    Object.defineProperty(list, "scrollHeight", { value: scrollHeight });
    Object.defineProperty(list, "clientHeight", { value: clientHeight });
    const target = createRef<HTMLElement>();
    target.current = list;
    act(() => render(h(ScrollThumb, { target }), frame));
    return frame;
  };

  it("draws a thumb only when the area scrolls; it shows while the pointer is over it", () => {
    expect(mount(300, 300).querySelector(".scroll-thumb")).toBeNull();
    const frame = mount(800, 400);
    const thumb = () => frame.querySelector(".scroll-thumb") as HTMLElement;
    expect(thumb().style.height).toBe("196px");
    expect(thumb().hasAttribute("data-visible")).toBe(false);
    act(() => {
      frame.dispatchEvent(new PointerEvent("pointerenter"));
    });
    expect(thumb().hasAttribute("data-visible")).toBe(true);
  });
});
