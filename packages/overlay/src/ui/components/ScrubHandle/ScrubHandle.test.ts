// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { degreesOf, ScrubHandle, recoil } from "./ScrubHandle.tsx";

const DEG_PER_PX = 22 / 3;

describe("recoil", () => {
  it("about half the pointer at first, then less and less, never past a line and a half", () => {
    expect(recoil(0)).toBe(0);
    // A nudge: about half what the pointer moved.
    expect(recoil(1)).toBeGreaterThan(DEG_PER_PX * 0.45);
    expect(recoil(1)).toBeLessThan(DEG_PER_PX);
    // A long pull: far less than the pointer, under the cap.
    expect(recoil(200)).toBeLessThan(33);
    expect(recoil(200)).toBeGreaterThan(recoil(50));
    expect(recoil(50)).toBeGreaterThan(recoil(10));
    // Signed: below a minimum, it stretches down.
    expect(recoil(-10)).toBe(-recoil(10));
  });
});

describe("ScrubHandle past a limit", () => {
  let container: HTMLElement;
  let calls: number[];
  // The value stops 5 steps down: what's past that comes back as the overflow.
  const mount = () =>
    act(() =>
      render(
        h(ScrubHandle, {
          onStart: () => true,
          onScrub: (steps: number) => {
            calls.push(steps);
            return Math.min(0, steps + 5);
          },
        }),
        container,
      ),
    );
  const handle = () => container.querySelector(".scrub-handle") as HTMLElement;
  const pointer = (type: string, y: number) =>
    act(() => {
      (type === "pointerdown" ? handle() : document.body).dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientY: y }),
      );
    });
  /** The drum's angle, modulo a line's spacing, from the line nearest the center. */
  const angle = () => {
    const ys = [...container.querySelectorAll("path")].map((p) => Number(/M1\.5 ([\d.-]+)H/.exec(p.getAttribute("d") ?? "")?.[1]));
    const y = ys.reduce((a, b) => (Math.abs(b - 8) < Math.abs(a - 8) ? b : a));
    return (Math.asin((8 - y) / 8) * 180) / Math.PI;
  };
  const near = (a: number, b: number) => {
    const d = (((a - b) % 22) + 33) % 22 - 11; // the same line spacing apart counts as equal
    expect(Math.abs(d)).toBeLessThan(0.01);
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    calls = [];
    mount();
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it("turns with the pointer past the limit too; let go, it springs back by its recoil", async () => {
    pointer("pointerdown", 100);
    pointer("pointermove", 145); // 45px down: 40px past the limit
    near(angle(), -45 * DEG_PER_PX); // no resistance
    pointer("pointerup", 145);
    await new Promise((r) => setTimeout(r, 600));
    // Back up, against the pull, by about recoil(40) (to the nearest line).
    const shown = -45 * DEG_PER_PX;
    const target = shown - recoil(-40);
    near(angle(), Math.round(target / 22) * 22);
  });

  it("let go before the limit: no spring; it settles on the nearest line in a short ease, not at once", async () => {
    pointer("pointerdown", 100);
    pointer("pointermove", 104);
    const shown = angle();
    pointer("pointerup", 104);
    // Still on its way the moment it's let go…
    expect(Math.abs(angle() - shown)).toBeLessThan(0.01);
    await new Promise((r) => setTimeout(r, 200));
    // …then on the line.
    near(angle(), 0);
  });
});

describe("the dial, for an angle", () => {
  let container: HTMLElement;
  const mount = (degrees: number | null) =>
    act(() => render(h(ScrubHandle, { onStart: () => true, onScrub: () => 0, degrees }), container));
  const handle = () => container.querySelector(".scrub-handle") as HTMLElement;
  /** The accent arc's path, or the whole ring's circle. */
  const fill = () => container.querySelector('[stroke="var(--plt-color-accent)"]');
  const tick = () => container.querySelector('path[d="M8 6V4.5"]')?.getAttribute("transform");

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
  });
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it("Shift snaps the angle the drag reaches to multiples of 45deg; without it, 1deg a px", () => {
    const steps: number[] = [];
    act(() => render(h(ScrubHandle, { onStart: () => true, onScrub: (s: number) => void steps.push(s), degrees: 30 }), container));
    const at = (type: string, y: number, shiftKey: boolean) =>
      act(() => {
        (type === "pointerdown" ? handle() : document.body).dispatchEvent(
          new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientY: y, shiftKey }),
        );
      });
    at("pointerdown", 100, false);
    at("pointermove", 97, false);
    expect(steps.at(-1)).toBe(3); // 33deg
    at("pointermove", 98, true); // 30 + 20 → 50: the nearest notch is 45
    expect(steps.at(-1)).toBe(15);
    at("pointermove", 95, true); // 30 + 50 → 80: 90
    expect(steps.at(-1)).toBe(60);
    at("pointermove", 104, true); // 30 − 40 → −10: 0
    expect(steps.at(-1)).toBe(-30);
    at("pointerup", 104, true);
  });

  it("reads angles in any unit as degrees, and nothing else", () => {
    expect(degreesOf("200deg")).toBe(200);
    expect(degreesOf("-45deg")).toBe(-45);
    expect(degreesOf("0.5turn")).toBe(180);
    expect(degreesOf("100grad")).toBe(90);
    expect(degreesOf("4px")).toBeNull();
    expect(degreesOf("")).toBeNull();
  });

  it("an angle shows the dial, turned to it, with the accent filling to it; anything else, the wheel", () => {
    mount(0);
    expect(handle().hasAttribute("data-dial")).toBe(true);
    expect(fill()).toBeNull();
    expect(tick()).toBe("rotate(0 8 8)");
    mount(90);
    expect(tick()).toBe("rotate(90 8 8)");
    // A quarter, clockwise from the top: to the ring's right edge.
    expect(fill()?.getAttribute("d")).toBe("M8 2.5A5.5 5.5 0 0 1 13.5 8");
    mount(-90);
    // Back the other way.
    expect(fill()?.getAttribute("d")).toMatch(/^M8 2\.5A5\.5 5\.5 0 0 0 2\.5 8/);
    mount(400);
    expect(fill()?.tagName.toLowerCase()).toBe("circle");
    mount(null);
    expect(handle().hasAttribute("data-dial")).toBe(false);
  });
});
