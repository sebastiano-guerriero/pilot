// @vitest-environment happy-dom
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon.tsx";

describe("Icon", () => {
  it("a name not in the set draws nothing, rather than throwing (which froze Pilot's whole UI)", () => {
    const host = document.createElement("div");
    expect(() => render(h(Icon, { name: "no-such-icon" as never }), host)).not.toThrow();
    expect(host.querySelector("svg")).toBeNull();
  });

  it("renders at its own size, in currentColor, hidden from assistive tech", () => {
    const host = document.createElement("div");
    render(h(Icon, { name: "chevron-down", class: "chevron" }), host);
    const svg = host.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("class")).toBe("icon chevron");
    expect([svg.getAttribute("width"), svg.getAttribute("viewBox")]).toEqual(["8", "0 0 8 8"]);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // No raw colors: only currentColor (and fill="none").
    const colors = [...host.querySelectorAll("*")].flatMap((el) =>
      ["stroke", "fill"].map((a) => el.getAttribute(a)).filter((v): v is string => !!v),
    );
    expect(colors.every((c) => c === "currentColor" || c === "none")).toBe(true);
  });

  it("multi-color icons use tokens, never raw colors", () => {
    const host = document.createElement("div");
    render(h(Icon, { name: "justify-start" }), host);
    expect(host.querySelector("svg")?.getAttribute("width")).toBe("12");
    const colors = [...host.querySelectorAll("*")].flatMap((el) =>
      ["stroke", "fill"].map((a) => el.getAttribute(a)).filter((v): v is string => !!v),
    );
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.every((c) => c === "none" || /^var\(--plt-[\w-]+\)$/.test(c))).toBe(true);
  });
});
