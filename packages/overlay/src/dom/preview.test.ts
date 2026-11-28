// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { EDIT_ATTRIBUTE, PREVIEW_ATTRIBUTE, mediaQuery, previewCss, stylesheetPreview, updateValues } from "./preview.ts";

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

  it("a condition: in the layer, its selector around the element (states after it), its media with the widths", () => {
    const el = document.createElement("div");
    document.body.append(el);
    stylesheetPreview.render([
      { element: el, property: "color", value: "red", condition: { selector: ".card:focus-within &" }, states: ["hover"] },
      { element: el, property: "color", value: "blue", condition: { media: "print" }, widths: { min: 768 } },
      { element: el, property: "opacity", value: "0.5", condition: { selector: "&[data-open]", media: "(prefers-reduced-motion: reduce)" } },
    ]);
    const id = el.getAttribute(EDIT_ATTRIBUTE);
    const text = sheet()?.textContent ?? "";
    expect(text).toContain(`.card:focus-within [${EDIT_ATTRIBUTE}="${id}"]:hover { color: red !important; }`);
    expect(text).toContain(`@media print and (min-width: 768px) { [${EDIT_ATTRIBUTE}="${id}"] { color: blue !important; } }`);
    expect(text).toContain(`@media (prefers-reduced-motion: reduce) { [${EDIT_ATTRIBUTE}="${id}"][data-open] { opacity: 0.5 !important; } }`);
    // A container query: around the rule, inside its media.
    stylesheetPreview.render([{ element: el, property: "gap", value: "8px", condition: { container: "(width < 400px)" } }]);
    expect(sheet()?.textContent).toContain(`@container (width < 400px) { [${EDIT_ATTRIBUTE}="${id}"] { gap: 8px !important; } }`);
    // A forced one (no CSS left): still in the layer, on the element, over the project's rules.
    stylesheetPreview.render([{ element: el, property: "color", value: "red", condition: {} }]);
    expect(sheet()?.textContent).toContain(`[${EDIT_ATTRIBUTE}="${id}"] { color: red !important; }`);
    el.remove();
  });

  it("the same rules with other values (a drag): written as text, read back as written (previewCss)", () => {
    const el = document.createElement("div");
    document.body.append(el);
    stylesheetPreview.render([{ element: el, property: "padding-top", value: "10px" }]);
    stylesheetPreview.render([{ element: el, property: "padding-top", value: "12px" }]);
    expect(previewCss()).toContain("padding-top: 12px !important;");
    stylesheetPreview.render([{ element: el, property: "color", value: "blue" }]);
    expect(previewCss()).not.toContain("padding-top");
    el.remove();
  });

  it("in a browser, the same rules with other values change in the sheet's rules, not its text (updateValues)", () => {
    // happy-dom doesn't parse @layer blocks: a stand-in sheet, as a browser reads Pilot's.
    // A style rule has `cssRules` too (empty) where the browser does CSS nesting, as Chrome.
    const rule = () => ({ style: document.createElement("div").style, cssRules: [] });
    const plain = rule();
    const inMedia = { media: "(min-width: 1200px)", cssRules: [rule()] };
    const style = { sheet: { cssRules: [{ cssRules: [plain, inMedia] }] } } as unknown as HTMLStyleElement;
    const line = (decl: string) => `[${EDIT_ATTRIBUTE}="1"] { ${decl} }`;
    const media = (decl: string) => `@media (min-width: 1200px) { [${EDIT_ATTRIBUTE}="1"] { ${decl} } }`;
    const before = [line("padding-top: 10px !important;"), media("color: red !important;")];
    expect(updateValues(style, before, [line("padding-top: 12px !important;"), media("color: blue !important;")])).toBe(true);
    expect(plain.style.getPropertyValue("padding-top")).toBe("12px");
    expect((inMedia.cssRules[0] as ReturnType<typeof rule>).style.getPropertyValue("color")).toBe("blue");
    // Another property, another selector or another count: not just values, rewrite.
    expect(updateValues(style, before, [line("margin-top: 12px !important;"), before[1] as string])).toBe(true); // same shape: a value's text
    expect(updateValues(style, before, [line("padding-top: 12px !important;")])).toBe(false);
    expect(updateValues(style, before, [`[${EDIT_ATTRIBUTE}="2"] { padding-top: 12px !important; }`, before[1] as string])).toBe(false);
  });

  it("a longhand after its shorthand stays after it in the layer, even where the page declares it", () => {
    const page = document.createElement("style");
    // Any shorthand (transition's rows after its panels; padding here, which the test DOM expands).
    page.textContent = ".card { padding-top: 5px; }";
    document.head.append(page);
    const el = document.createElement("div");
    el.className = "card";
    document.body.append(el);
    stylesheetPreview.render([
      { element: el, property: "padding", value: "10px" },
      { element: el, property: "padding-top", value: "20px" },
    ]);
    const css = previewCss();
    expect(css.indexOf("padding: 10px")).toBeGreaterThan(-1);
    expect(css.indexOf("padding-top: 20px")).toBeGreaterThan(css.indexOf("padding: 10px"));
    el.remove();
    page.remove();
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
