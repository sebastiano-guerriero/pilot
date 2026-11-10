// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { describeElement, domPath, shortName, uniqueSelector } from "./target.ts";

const $ = (s: string) => document.querySelector(s) as Element;

beforeEach(() => {
  document.body.innerHTML = `
    <main>
      <section class="hero">
        <h1>Ship   the design
          you meant</h1>
        <div class="actions">
          <a class="button button--primary">Get started</a>
          <a class="button">Learn more</a>
        </div>
      </section>
      <section id="pricing"><p>One</p><p>Two</p></section>
      <footer><p>a</p><p>b</p></footer>
    </main>`;
});

describe("uniqueSelector", () => {
  it("matches exactly the element", () => {
    for (const el of document.querySelectorAll("body *")) {
      const selector = uniqueSelector(el);
      expect(document.querySelectorAll(selector), selector).toHaveLength(1);
      expect(document.querySelector(selector)).toBe(el);
    }
  });

  it("prefers a unique id", () => {
    expect(uniqueSelector($("#pricing"))).toBe("#pricing");
  });

  it("anchors on an ancestor id", () => {
    expect(uniqueSelector($("#pricing p:last-child"))).toBe("#pricing > p:nth-of-type(2)");
  });
});

describe("describeElement", () => {
  it("collects path, classes and a normalized text snippet", () => {
    const target = describeElement($(".button--primary"));
    expect(target.tag).toBe("a");
    expect(target.classes).toEqual(["button", "button--primary"]);
    expect(target.path).toBe("main > section.hero > div.actions > a.button");
    expect(target.text).toBe("Get started");
    expect(describeElement($("h1")).text).toBe("Ship the design you meant");
  });
});

describe("labels", () => {
  it("shortName uses id, then first class, then tag", () => {
    expect(shortName($("#pricing"))).toBe("section#pricing");
    expect(shortName($(".hero"))).toBe("section.hero");
    expect(shortName($("h1"))).toBe("h1");
  });

  it("domPath stops below body", () => {
    expect(domPath($("main"))).toBe("main");
  });
});
