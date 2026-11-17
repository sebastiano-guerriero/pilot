// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ancestorsWithin, describe as describeRow, domRows } from "./domTree.ts";

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("main");
  root.innerHTML = `
    <section id="hero">
      <h1>Ship the design you meant</h1>
      <div class="actions"><a class="btn">Get started</a><a class="btn">Learn more</a></div>
    </section>
    <script>1</script>
    <pilot-root></pilot-root>
    <footer data-testid="foot"></footer>`;
  document.body.append(root);
});
afterEach(() => root.remove());

const names = (rows: ReturnType<typeof domRows>) =>
  rows.map((r) => `${"  ".repeat(r.depth)}${r.tag}${r.identifiers ?? ""}${r.details ? `(${r.details})` : ""}${r.text ? ` "${r.text}"` : ""}`);

describe("layers", () => {
  it("collapsed: the root's children, without scripts or Pilot", () => {
    expect(names(domRows(root, new Set()))).toEqual(["section#hero", "footer[data-testid=foot]"]);
  });

  it("expanded elements show their children, indented, with their own text", () => {
    const hero = root.querySelector("#hero") as Element;
    const actions = root.querySelector(".actions") as Element;
    expect(names(domRows(root, new Set([hero, actions])))).toEqual([
      "section#hero",
      '  h1 "Ship the design you meant"',
      "  div",
      '    a "Get started"',
      '    a "Learn more"',
      "footer[data-testid=foot]",
    ]);
  });

  it("says which rows open, and which are open", () => {
    const rows = domRows(root, new Set());
    expect(rows.map((r) => [r.expandable, r.expanded])).toEqual([
      [true, false],
      [false, false],
    ]);
  });

  it("the ancestors to expand to show an element", () => {
    const link = root.querySelector(".btn") as Element;
    expect(ancestorsWithin(link, root).map((e) => e.tagName.toLowerCase())).toEqual(["section", "div"]);
  });

  it("describes each row: identifiers always (id, data-*, no classes), what it points at, its text", () => {
    const el = (html: string) => {
      const t = document.createElement("template");
      t.innerHTML = html;
      return t.content.firstElementChild as Element;
    };
    expect(describeRow(el(`<div id="hero" class="flex p-4" data-slot="card-header" data-open data-pilot-edit="3">Hi</div>`))).toEqual({
      tag: "div",
      identifiers: "#hero[data-slot=card-header][data-open]",
      text: "Hi",
    });
    expect(describeRow(el(`<a class="nav" href="${location.origin}/about#team">About</a>`))).toEqual({
      tag: "a",
      details: 'href="/about#team"',
      text: "About",
    });
    // A long URL keeps its end: the file name.
    const long = "https://cdn.example.com/a/very/long/path/to/the/images/hero-large.jpg";
    expect(describeRow(el(`<img src="${long}">`)).details).toBe(`src="…${long.slice(-39)}"`);
    expect(describeRow(el(`<input type="email" name="email">`)).details).toBe('type="email" name="email"');
    expect(describeRow(el(`<input>`)).details).toBe('type="text"');
    // No text of its own: its aria-label says what it is.
    expect(describeRow(el(`<button type="button" aria-label="Close"><svg></svg></button>`)).details).toBe('type="button" aria-label="Close"');
    expect(describeRow(el(`<div role="dialog" data-state="open"></div>`))).toEqual({ tag: "div", identifiers: "[data-state=open]", details: 'role="dialog"' });
  });
});
