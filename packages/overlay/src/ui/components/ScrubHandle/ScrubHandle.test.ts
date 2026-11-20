// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScrubHandle, recoil } from "./ScrubHandle.tsx";

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

  it("let go before the limit: no spring, the nearest line", async () => {
    pointer("pointerdown", 100);
    pointer("pointermove", 104);
    pointer("pointerup", 104);
    near(angle(), 0);
  });
});
