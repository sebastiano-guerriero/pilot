// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { describeElement, domPath, findTarget, shortName, structuralSelector, uniqueSelector } from "./target.ts";

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

describe("finding a saved element again", () => {
  const cards = () => {
    document.body.innerHTML = `
      <div id="app"><main>
        <div class="row">
          <article class="card card--light"><h3>Desk lamp</h3></article>
          <article class="card card--dark"><h3>Office chair</h3></article>
        </div>
      </main></div>`;
    return [...document.querySelectorAll("article")];
  };

  it("where it is, by tags and positions only, from the nearest id", () => {
    const [lamp] = cards();
    expect(structuralSelector(lamp as Element)).toBe("#app > main > div > article:nth-of-type(1)");
  });

  it("by its selector; its classes changed (a variant), by where it is", () => {
    const [lamp] = cards();
    const target = describeElement(lamp as Element);
    expect(findTarget(target)).toBe(lamp);
    (lamp as Element).className = "card card--outline";
    expect(findTarget(target)).toBe(lamp);
  });

  it("saved before `at`: by its path without classes and its text, when exactly one element is it", () => {
    const [lamp, chair] = cards();
    const { at: _, ...old } = describeElement(lamp as Element);
    (lamp as Element).className = "card card--dark";
    (chair as Element).className = "card card--light";
    expect(findTarget(old)).toBe(lamp);
    // Nothing matches its selector, and its path fits both (no text to tell them apart): none, rather than the wrong one.
    expect(findTarget({ ...old, selector: "article.card--gone", text: undefined })).toBeNull();
  });

  it("moved elsewhere, its text changed too: none", () => {
    const [lamp] = cards();
    const target = describeElement(lamp as Element);
    (lamp as Element).className = "card";
    ((lamp as Element).querySelector("h3") as Element).textContent = "Floor lamp";
    expect(findTarget(target)).toBeNull();
  });
});

