// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { EDIT_ATTRIBUTE, PREVIEW_ATTRIBUTE, mediaQuery, stylesheetPreview } from "./preview.ts";

const sheet = () => document.querySelector(`style[${PREVIEW_ATTRIBUTE}]`) as HTMLStyleElement | null;

describe("stylesheetPreview", () => {
  afterEach(() => stylesheetPreview.render([]));

  it("writes one !important rule per change, in a layer, first in the head; never the element's style", () => {
    document.head.append(document.createElement("style")); // the page's own
    const el = document.createElement("div");
    document.body.append(el);
    stylesheetPreview.render([
      { element: el, property: "padding-top", value: "10px" },
      { element: el, property: "padding-top", value: "40px", widths: { min: 1200 } },
    ]);
    const id = el.getAttribute(EDIT_ATTRIBUTE);
    expect(id).toBeTruthy();
    expect(document.head.firstElementChild).toBe(sheet());
    expect(sheet()?.textContent).toBe(
      `@layer pilot-preview {\n` +
        `  [${EDIT_ATTRIBUTE}="${id}"] { padding-top: 10px !important; }\n` +
        `  @media (min-width: 1200px) { [${EDIT_ATTRIBUTE}="${id}"] { padding-top: 40px !important; } }\n` +
        `}\n`,
    );
    expect(el.style.cssText).toBe("");
    el.remove();
  });

  it("leaves out values the browser doesn't take; no rules left: empty sheet, no attribute", () => {
    const el = document.createElement("div");
    document.body.append(el);
    stylesheetPreview.render([{ element: el, property: "padding-top", value: "10px; color: red" }]);
    expect(sheet()?.textContent ?? "").not.toContain("color");
    stylesheetPreview.render([{ element: el, property: "opacity", value: "0.5" }]);
    expect(el.hasAttribute(EDIT_ATTRIBUTE)).toBe(true);
    stylesheetPreview.render([]);
    expect(sheet()?.textContent).toBe("");
    expect(el.hasAttribute(EDIT_ATTRIBUTE)).toBe(false);
    el.remove();
  });
});

describe("mediaQuery", () => {
  it("both ends included", () => {
    expect(mediaQuery({ min: 768 })).toBe("(min-width: 768px)");
    expect(mediaQuery({ max: 767 })).toBe("(max-width: 767px)");
    expect(mediaQuery({ min: 768, max: 1199 })).toBe("(min-width: 768px) and (max-width: 1199px)");
  });
});
