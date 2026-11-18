// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { findSimilar } from "./similar.ts";

const page = (html: string) => {
  document.body.innerHTML = html;
};
const one = (selector: string) => document.querySelector(selector) as HTMLElement;
const all = (selector: string) => [...document.querySelectorAll(selector)] as HTMLElement[];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("findSimilar", () => {
  it("a card's title: the title of every card, not every heading", () => {
    page(`
      <h3>Features</h3>
      <article class="card" data-state="active"><h3>One</h3><p>a</p></article>
      <article class="card"><h3>Two</h3><p>b</p></article>
      <article class="card"><h3>Three</h3><p>c</p></article>`);
    const titles = all("article h3");
    expect(findSimilar(titles[0] as HTMLElement)).toEqual(titles.slice(1));
  });

  it("an element with its own classes: the others with them, anywhere on the page", () => {
    page(`<div><span class="badge">New</span></div><section><span class="badge">Hot</span><span class="label">x</span></section>`);
    expect(findSimilar(one(".badge"))).toEqual([all(".badge")[1]]);
  });

  it("a copy the page marked active still counts; a different variant doesn't", () => {
    page(
      `<a class="tab"><i></i></a><a class="tab active"><i></i></a><a class="btn primary"><i></i></a><a class="btn secondary"><i></i></a>`,
    );
    expect(findSimilar(one(".tab"))).toEqual([one(".tab.active")]);
    expect(findSimilar(one(".btn.primary"))).toEqual([]);
  });

  it("plain HTML: list items by their tag and children; a text's paragraphs aren't copies", () => {
    page(`
      <ul><li><a>One</a></li><li><a>Two</a></li><li><a>Three</a></li></ul>
      <div><p>First paragraph</p><p>Second</p></div>`);
    const links = all("li a");
    expect(findSimilar(links[1] as HTMLElement)).toEqual([links[0], links[2]]);
    expect(findSimilar(one("p"))).toEqual([]);
  });

  it("the same part by position: the second paragraph of each copy; a copy without it is left out", () => {
    page(`
      <div class="item"><p>a1</p><p>a2</p></div>
      <div class="item"><p>b1</p><p>b2</p></div>
      <div class="item"><p>c1</p></div>`);
    const ps = all("p");
    expect(findSimilar(ps[1] as HTMLElement)).toEqual([ps[3]]);
  });

  it("nothing repeats: nothing similar", () => {
    page(`<header class="top"><nav class="menu"><a>Home</a></nav></header>`);
    expect(findSimilar(one("a"))).toEqual([]);
  });
});
