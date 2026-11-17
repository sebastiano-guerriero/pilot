// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { listPlacement } from "./components/JobList/JobList.tsx";
import { clampSpot, loadSpot, saveSpot } from "./toolbarSpot.ts";

const viewport = { width: 1000, height: 800 };

describe("toolbar spot", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps the toolbar on screen, 8px from every edge, by its center", () => {
    expect(clampSpot({ x: 500, y: 300 }, 200, viewport)).toEqual({ x: 500, y: 300 });
    expect(clampSpot({ x: 20, y: -40 }, 200, viewport)).toEqual({ x: 108, y: 8 });
    expect(clampSpot({ x: 990, y: 790 }, 200, viewport)).toEqual({ x: 892, y: 800 - 8 - 48 });
  });

  it("is kept through reloads (the tab's sessionStorage)", () => {
    expect(loadSpot()).toBeNull();
    saveSpot({ x: 300, y: 120 });
    expect(loadSpot()).toEqual({ x: 300, y: 120 });
    saveSpot(null);
    expect(loadSpot()).toBeNull();
  });

  it("the job list goes above a toolbar in the bottom half, below one in the top half, on screen", () => {
    expect(listPlacement({ x: 500, y: 600 }, viewport)).toEqual({ left: "500px", bottom: "212px" });
    expect(listPlacement({ x: 40, y: 100 }, viewport)).toEqual({ left: "148px", top: "160px", bottom: "auto" });
  });
});
