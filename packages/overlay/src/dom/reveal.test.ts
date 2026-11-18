// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { revealInWindow, windowScroll } from "./reveal.ts";

const viewport = { width: 1000, height: 800 };
const box = (top: number, bottom: number, left = 100, right = 200) => ({ top, bottom, left, right });

describe("windowScroll", () => {
  it("in view: nothing to scroll", () => {
    expect(windowScroll(box(10, 100), viewport, "nearest")).toEqual({ x: 0, y: 0 });
    expect(windowScroll(box(10, 100), viewport, "center")).toEqual({ x: 0, y: 0 });
  });

  it("nearest: just past the edge it's beyond; a box taller than the window shows its top", () => {
    expect(windowScroll(box(900, 950), viewport, "nearest").y).toBe(150);
    expect(windowScroll(box(-120, -20), viewport, "nearest").y).toBe(-120);
    expect(windowScroll(box(300, 1500), viewport, "nearest").y).toBe(300);
    expect(windowScroll(box(10, 50, 1100, 1200), viewport, "nearest").x).toBe(200);
  });

  it("center: to the middle of the window", () => {
    expect(windowScroll(box(1200, 1300), viewport, "center").y).toBe(850);
  });

  it("a list: relative to its own box", () => {
    expect(windowScroll(box(520, 544), { width: 300, height: 200 }, "nearest", { left: 100, top: 300 }).y).toBe(44);
  });
});

describe("revealInWindow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("scrolls the window only: never the page's own containers (overflow: hidden ones included)", async () => {
    document.body.innerHTML = `<div id="frame" style="overflow: hidden; height: 100px"><p id="far">Far</p></div>`;
    const frame = document.getElementById("frame") as HTMLElement;
    const far = document.getElementById("far") as HTMLElement;
    vi.spyOn(far, "getBoundingClientRect").mockReturnValue({ top: 2000, bottom: 2020, left: 10, right: 50 } as DOMRect);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const intoView = vi.fn();
    far.scrollIntoView = intoView;
    await revealInWindow(far);
    expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: 2020 - window.innerHeight, behavior: "auto" });
    expect(intoView).not.toHaveBeenCalled();
    expect(frame.scrollTop).toBe(0);
  });
});

describe("Pilot never moves the page's elements", () => {
  it("no code calls scrollIntoView(): it scrolls the page's containers too (use revealInWindow, scrollWithin)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(import.meta.dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && readFileSync(path, "utf8").includes(".scrollIntoView(")) offenders.push(path);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
