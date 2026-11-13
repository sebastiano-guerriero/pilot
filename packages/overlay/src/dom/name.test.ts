// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { elementName } from "./name.ts";

const el = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as Element;
};

describe("elementName", () => {
  it("the id first", () => {
    expect(elementName(el('<section id="pricing" data-testid="p" class="flex p-4">'))).toBe("section#pricing");
  });

  it("then a naming data attribute, never classes", () => {
    expect(elementName(el('<div class="flex items-center p-4" data-testid="hero">'))).toBe("div[data-testid=hero]");
    expect(elementName(el('<div data-slot="card-header">'))).toBe("div[data-slot=card-header]");
    expect(elementName(el('<div class="card">'))).toBe("div");
  });

  it("the project's own attributes come before the common ones", () => {
    const node = el('<div data-testid="a" data-block="cta">');
    expect(elementName(node)).toBe("div[data-testid=a]");
    expect(elementName(node, ["data-block"])).toBe("div[data-block=cta]");
  });

  it("ignores data attributes that describe state", () => {
    expect(elementName(el('<div data-state="open" data-orientation="vertical">'))).toBe("div");
  });

  it("a form field by its name", () => {
    expect(elementName(el('<input name="email">'))).toBe("input[name=email]");
  });

  it("not the element's text or aria-label: just the tag", () => {
    expect(elementName(el('<nav aria-label="Main">'))).toBe("nav");
    expect(elementName(el("<a href='#'>Get started</a>"))).toBe("a");
    expect(elementName(el("<h2>Pricing</h2>"))).toBe("h2");
  });

  it("long or odd attribute values are shortened and quoted", () => {
    expect(elementName(el('<div data-name="Send the changes to your agent now">'))).toBe('div[data-name="Send the changes to you…"]');
    expect(elementName(el('<div data-name="Hero banner">'))).toBe('div[data-name="Hero banner"]');
  });
});
