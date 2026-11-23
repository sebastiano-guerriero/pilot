// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { equivalentsOf } from "./equivalents.ts";

beforeEach(() => {
  document.head.innerHTML = `<style>
    :root { --space-sm: 16px; --space-md: 24px; --gutter: 24px; --text-lg: 24px; --color-primary: #7553fd; --radius: 8px; }
    .padding-md { padding: var(--space-md); }
    .pad-md { padding: 24px; }
    .padding-sm { padding: 16px; }
    .card { padding: 24px; color: red; }
    @media (min-width: 64rem) { .padding-md\\@lg { padding: 24px; } }
    .text-primary { color: var(--color-primary); }
  </style>`;
  const host = document.createElement("pilot-root");
  host.attachShadow({ mode: "open" });
  document.documentElement.append(host);
});
afterEach(() => {
  document.querySelector("pilot-root")?.remove();
  document.head.innerHTML = "";
});

describe("what already gives a value on the page", () => {
  it("its tokens and its classes that set just that property, as the browser computes them", () => {
    expect(equivalentsOf("padding", "24px")).toEqual({ tokens: ["var(--space-md)", "var(--gutter)"], classes: [".padding-md", ".pad-md"] });
    expect(equivalentsOf("padding", "1.5rem")?.tokens).toEqual(["var(--space-md)", "var(--gutter)"]);
    // A font size token of the same size isn't a padding's; it is a font size's.
    expect(equivalentsOf("font-size", "24px")?.tokens).toEqual(["var(--text-lg)"]);
    expect(equivalentsOf("border-radius", "8px")?.tokens).toEqual(["var(--radius)"]);
    expect(equivalentsOf("color", "rgb(117, 83, 253)")).toEqual({ tokens: ["var(--color-primary)"], classes: [".text-primary"] });
  });

  it("nothing for a token already, several values, a value nothing gives, or without Pilot mounted", () => {
    expect(equivalentsOf("padding", "var(--space-md)")).toBeNull();
    expect(equivalentsOf("padding", "8px 16px")).toBeNull();
    expect(equivalentsOf("padding", "13px")).toBeNull();
    document.querySelector("pilot-root")?.remove();
    expect(equivalentsOf("padding", "24px")).toBeNull();
  });
});
