// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { resolveVariables, shownColor } from "./shownColor.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shownColor", () => {
  it("the field's color, not the computed one: with the hover pill, the hover color", () => {
    const el = document.createElement("h2");
    document.body.append(el);
    expect(shownColor(el, "red", "rgb(255, 255, 255)")).toBe("red");
  });

  it("the page's variables resolved on the element", () => {
    // On the element itself: happy-dom doesn't inherit custom properties (browsers do).
    const el = document.createElement("p");
    el.style.setProperty("--brand", "#6230e8");
    document.body.append(el);
    expect(resolveVariables(el, "var(--brand)")).toBe("#6230e8");
    expect(resolveVariables(el, "var(--missing, var(--brand))")).toBe("#6230e8");
    expect(resolveVariables(el, "var(--missing)")).toBeNull();
    expect(shownColor(el, "var(--missing)", "rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });

  it("nothing set, or a color that depends on the element: the computed one", () => {
    const el = document.createElement("p");
    document.body.append(el);
    expect(shownColor(el, "", "rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(shownColor(el, "currentColor", "rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });
});
