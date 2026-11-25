// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PropsList, propExample, propHint } from "./PropsList.tsx";

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
  it("a line per prop: its name, its value on the page (else the default), what it takes; then how to change one", () => {
    act(() => render(h(PropsList, { props, current: { tone: "light", count: 3 } }), container));
    const lines = [...container.querySelectorAll(".props-list li")].map((li) => [
      li.querySelector("code")?.textContent,
      li.querySelector(".prop-value")?.textContent,
      li.querySelector(".prop-hint")?.textContent,
    ]);
    expect(lines).toEqual([
      ["tone", "light", "light, dark or outline"],
      ["featured", "false", "true or false"],
      ["badge", undefined, "text"],
      ["count", "3", "a number"],
    ]);
    expect(container.querySelector(".props-how")?.textContent).toBe("Reply tone: dark to change one.");
  });

  it("the agent's description first, its values after; an example for each kind", () => {
    expect(propHint({ name: "size", type: "options", options: ["sm", "md"], description: "how big" })).toBe("how big: sm or md");
    expect(propHint({ name: "value", type: "number", description: "how full, 0–100" })).toBe("how full, 0–100");
    expect(propExample({ name: "featured", type: "boolean" }, true)).toBe("featured: false");
    expect(propExample({ name: "count", type: "number" }, 3)).toBe("count: …");
  });
});
