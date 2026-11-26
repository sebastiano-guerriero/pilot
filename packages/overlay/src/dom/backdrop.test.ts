import { describe, expect, it } from "vitest";
import { darkTextOn, over, parseColor } from "./backdrop.ts";

const GREY: [number, number, number, number][] = [
  [0, 0, 0, 0.2],
  [255, 255, 255, 0.4],
];

describe("backdrop", () => {
  it("reads computed colors", () => {
    expect(parseColor("rgb(23, 23, 23)")).toEqual([23, 23, 23, 1]);
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual([0, 0, 0, 0.5]);
    expect(parseColor("rgb(0 0 0 / 20%)")).toEqual([0, 0, 0, 0.2]);
    expect(parseColor("color(srgb 1 1 1 / 0.4)")).toEqual([255, 255, 255, 0.4]);
    expect(parseColor("transparent")).toBeNull();
  });

  it("the grey bars' layers over the page: light grey on white, dark grey on black", () => {
    expect(over([255, 255, 255], GREY).map(Math.round)).toEqual([204, 204, 204]);
    expect(over([0, 0, 0], GREY).map(Math.round)).toEqual([82, 82, 82]);
  });

  it("dark text on a light page's pill, light on a dark page's", () => {
    expect(darkTextOn(over([255, 255, 255], GREY))).toBe(true);
    expect(darkTextOn(over([248, 250, 252], GREY))).toBe(true);
    expect(darkTextOn(over([0, 0, 0], GREY))).toBe(false);
    expect(darkTextOn(over([30, 41, 59], GREY))).toBe(false);
  });
});
