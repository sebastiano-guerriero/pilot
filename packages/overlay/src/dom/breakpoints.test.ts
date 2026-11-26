// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { mediaRange, mediaWidths, pageBreakpoints } from "./breakpoints.ts";

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

describe("mediaRange", () => {
  it("a width condition as a range, both ends included, in px", () => {
    expect(mediaRange("(min-width: 768px)")).toEqual({ min: 768 });
    expect(mediaRange("(max-width: 767.98px)")).toEqual({ max: 767 });
    expect(mediaRange("(width >= 48rem)")).toEqual({ min: 768 });
    expect(mediaRange("(width < 64rem)")).toEqual({ max: 1023 });
    expect(mediaRange("(768px <= width < 1024px)")).toEqual({ min: 768, max: 1023 });
    expect(mediaRange("screen and (min-width: 768px) and (max-width: 1199px)")).toEqual({ min: 768, max: 1199 });
    expect(mediaRange("all")).toEqual({});
  });

  it("a device capability true now is no condition (Tailwind v4's hover:); false now, never applies", () => {
    const real = globalThis.matchMedia;
    globalThis.matchMedia = ((q: string) => ({ matches: q === "(hover: hover)" || q === "(pointer: fine)" })) as typeof matchMedia;
    try {
      expect(mediaRange("(hover: hover)")).toEqual({});
      expect(mediaRange("(width >= 48rem) and (hover: hover)")).toEqual({ min: 768 });
      expect(mediaRange("(pointer: fine)")).toEqual({});
      expect(mediaRange("(hover: none)")).toBeNull();
    } finally {
      globalThis.matchMedia = real;
    }
  });

  it("anything else too is not a width range: null", () => {
    expect(mediaRange("(min-width: 768px) and (orientation: landscape)")).toBeNull();
    expect(mediaRange("(prefers-color-scheme: dark)")).toBeNull();
    expect(mediaRange("print")).toBeNull();
    expect(mediaRange("(min-width: 768px), (max-width: 400px)")).toBeNull();
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
