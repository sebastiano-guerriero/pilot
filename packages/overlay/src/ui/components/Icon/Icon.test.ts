// @vitest-environment happy-dom
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon.tsx";

describe("Icon", () => {
  it("renders at its own size, in currentColor, hidden from assistive tech", () => {
    const host = document.createElement("div");
    render(h(Icon, { name: "chevron-down", class: "chevron" }), host);
    const svg = host.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("class")).toBe("icon chevron");
    expect([svg.getAttribute("width"), svg.getAttribute("viewBox")]).toEqual(["8", "0 0 8 8"]);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // No inline colors: only currentColor (and fill="none").
    const colors = [...host.querySelectorAll("*")].flatMap((el) =>
      ["stroke", "fill"].map((a) => el.getAttribute(a)).filter((v): v is string => !!v),
    );
    expect(colors.every((c) => c === "currentColor" || c === "none")).toBe(true);
  });
});
