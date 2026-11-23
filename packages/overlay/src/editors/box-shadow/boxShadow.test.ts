// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { type BoxShadow, formatBoxShadow, parseBoxShadow } from "./boxShadow.ts";
import { smoothLayers } from "./smooth.ts";

describe("parseBoxShadow / formatBoxShadow", () => {
  it("reads each shadow: outer or inset, x, y, blur, spread, color", () => {
    expect(parseBoxShadow("")).toBeNull();
    expect(parseBoxShadow("none")).toBe("none");
    expect(parseBoxShadow("0 4px 6px -1px rgb(0 0 0 / 0.1), inset 0 2px 4px #0000000d")).toEqual([
      { type: "outer", mode: "manual", x: "0px", y: "4px", blur: "6px", spread: "-1px", color: "rgb(0 0 0 / 0.1)" },
      { type: "inset", mode: "manual", x: "0px", y: "2px", blur: "4px", spread: "", color: "#0000000d" },
    ]);
  });

  it("inset and the color at either end; what doesn't split is a custom shadow", () => {
    expect(parseBoxShadow("red 1px 2px inset")).toEqual([{ type: "inset", mode: "manual", x: "1px", y: "2px", blur: "", spread: "", color: "red" }]);
    expect(parseBoxShadow("var(--shadow)")).toEqual([{ type: "custom", text: "var(--shadow)" }]);
    expect(parseBoxShadow("1px 2px 3px 4px 5px red")).toEqual([{ type: "custom", text: "1px 2px 3px 4px 5px red" }]);
  });

  it("writes them back: inset first, empty offsets 0, a spread with its blur, empty parts left out", () => {
    const shadows: BoxShadow[] = [
      { type: "inset", mode: "manual", x: "", y: "2px", blur: "", spread: "1px", color: "red" },
      { type: "outer", mode: "manual", x: "1px", y: "1px", blur: "", spread: "", color: "" },
    ];
    expect(formatBoxShadow(shadows)).toBe("inset 0 2px 0 1px red, 1px 1px");
    expect(formatBoxShadow("none")).toBe("none");
  });
});

describe("smooth shadows", () => {
  const smooth = { distance: 10, direction: 180, elevation: 10, layers: 5, color: "#00000040" };

  it("are layers from distance and elevation: each further and softer (ease-in), pulled in by a negative spread, the color's opacity shared out", () => {
    expect(smoothLayers(smooth, false)).toEqual([
      "0 0.4px 0.4px -0.12px #00000004",
      "0 1.6px 1.6px -0.48px #00000009",
      "0 3.6px 3.6px -1.08px #0000000d",
      "0 6.4px 6.4px -1.92px #00000011",
      "0 10px 10px -3px #00000015",
    ]);
    // Inset: the same, inset.
    expect(smoothLayers(smooth, true)[4]).toBe("inset 0 10px 10px -3px #00000015");
    // To the right: the offset turns with the direction.
    expect(smoothLayers({ ...smooth, direction: 90 }, false)[4]).toBe("10px 0 10px -3px #00000015");
    // Elevation is the blur (and its pull-in), apart from the distance.
    expect(smoothLayers({ ...smooth, distance: 4, elevation: 20 }, false)[4]).toBe("0 4px 20px -6px #00000015");
  });

  it("are read back as one smooth shadow, with their controls", () => {
    const value = smoothLayers(smooth, false).join(", ");
    expect(parseBoxShadow(value)).toEqual([{ type: "outer", mode: "smooth", smooth }]);
    expect(formatBoxShadow(parseBoxShadow(value) as BoxShadow[])).toBe(value);
  });

  it("a smooth shadow next to others: each read on its own", () => {
    const value = ["0 1px 2px red", ...smoothLayers({ ...smooth, direction: 135, layers: 3 }, true)].join(", ");
    const shadows = parseBoxShadow(value) as BoxShadow[];
    expect(shadows.map((s) => (s.type === "custom" ? "custom" : `${s.type} ${s.mode}`))).toEqual(["outer manual", "inset smooth"]);
    expect(shadows[1]).toMatchObject({ smooth: { distance: 10, direction: 135, elevation: 10, layers: 3 } });
  });

  it("at distance 0 it's still one smooth shadow (its direction can't be read: 180deg), elevation 0 too", () => {
    const soft = smoothLayers({ ...smooth, distance: 0, direction: 90, elevation: 20 }, false).join(", ");
    // A soft shadow all around.
    expect(soft.split(", ")[4]).toBe("0 0 20px -6px #00000015");
    expect(parseBoxShadow(soft)).toEqual([{ type: "outer", mode: "smooth", smooth: { ...smooth, distance: 0, direction: 180, elevation: 20 } }]);
    const flat = smoothLayers({ ...smooth, distance: 0, elevation: 0 }, false).join(", ");
    expect(flat.split(", ")[0]).toBe("0 0 0 0 #00000004");
    expect(parseBoxShadow(flat)).toEqual([{ type: "outer", mode: "smooth", smooth: { ...smooth, distance: 0, elevation: 0 } }]);
  });

  it("layers that don't follow the pattern stay manual", () => {
    const shadows = parseBoxShadow("0 1px 1px #0000000a, 0 3px 6px #0000001a") as BoxShadow[];
    expect(shadows.every((s) => s.type !== "custom" && s.mode === "manual")).toBe(true);
  });
});
