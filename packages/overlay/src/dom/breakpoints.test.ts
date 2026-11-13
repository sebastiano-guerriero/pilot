// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { mediaWidths, pageBreakpoints } from "./breakpoints.ts";

describe("mediaWidths", () => {
  it("reads every width syntax, in px", () => {
    expect(mediaWidths("(min-width: 768px)")).toEqual([768]);
    expect(mediaWidths("(max-width: 767.98px)")).toEqual([768]);
    expect(mediaWidths("(width >= 48rem)")).toEqual([768]);
    expect(mediaWidths("(width < 40em)")).toEqual([640]);
    expect(mediaWidths("(768px <= width < 1024px)")).toEqual([768, 1024]);
    expect(mediaWidths("screen and (min-width: 640px) and (max-width: 1023px)")).toEqual([640, 1023]);
  });

  it("only width: not height, device-width or other features", () => {
    expect(mediaWidths("(min-height: 600px)")).toEqual([]);
    expect(mediaWidths("(max-device-width: 480px)")).toEqual([]);
    expect(mediaWidths("(prefers-reduced-motion: reduce)")).toEqual([]);
    expect(mediaWidths("print")).toEqual([]);
  });
});

describe("pageBreakpoints", () => {
  let style: HTMLStyleElement;
  afterEach(() => style.remove());

  it("the widths of the page's media queries, sorted, once each", () => {
    style = document.createElement("style");
    style.textContent = `
      @media (min-width: 1024px) { .a { color: red; } }
      @media (min-width: 768px) { .a { color: blue; } }
      @media (max-width: 767px) { .a { color: green; } }
      @media (min-width: 768px) { .b { color: blue; } }
      @media (min-height: 500px) { .c { color: blue; } }
    `;
    document.head.append(style);
    expect(pageBreakpoints()).toEqual([768, 1024]);
  });
});
