// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropsList } from "./PropsList.tsx";

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const props = [
  { name: "tone", type: "options" as const, options: ["light", "dark", "outline"] },
  { name: "featured", type: "boolean" as const, default: false },
  { name: "badge", type: "text" as const },
  { name: "count", type: "number" as const },
];

describe("PropsList", () => {
  it("a row per prop, with the instance's value on the page (else the default)", () => {
    act(() => render(h(PropsList, { props, current: { tone: "light", count: 3 } }), container));
    const rows = [...container.querySelectorAll(".property-row")];
    expect(rows.map((r) => r.querySelector(".property-label, label, span")?.textContent)).toEqual(["tone", "featured", "badge", "count"]);
    expect((rows[0]?.querySelector(".trigger") as HTMLElement).textContent).toContain("light");
    expect((rows[1]?.querySelector(".trigger") as HTMLElement).textContent).toContain("false");
    expect((rows[3]?.querySelector("input") as HTMLInputElement).value).toBe("3");
  });

  it("a pick is reported (typed as the prop is) and nothing else; a picked value shows over the page's", () => {
    const onPick = vi.fn();
    act(() => render(h(PropsList, { props, current: { tone: "light", count: 3 }, picked: { tone: "outline" }, onPick }), container));
    const [tone, featured] = [...container.querySelectorAll(".trigger")] as HTMLElement[];
    expect(tone?.textContent).toContain("outline");
    act(() => tone?.click());
    act(() => ([...container.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("dark")) as HTMLElement).click());
    expect(onPick).toHaveBeenLastCalledWith("tone", "dark");
    act(() => featured?.click());
    act(() => ([...container.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("true")) as HTMLElement).click());
    expect(onPick).toHaveBeenLastCalledWith("featured", true);
    const count = container.querySelectorAll("input")[1] as HTMLInputElement;
    act(() => count.focus());
    act(() => {
      count.value = "5";
      count.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      count.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onPick).toHaveBeenLastCalledWith("count", 5);
  });
});
