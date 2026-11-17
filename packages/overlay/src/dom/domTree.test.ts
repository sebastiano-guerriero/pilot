// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ancestorsWithin, domRows } from "./domTree.ts";

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

const names = (rows: ReturnType<typeof domRows>) => rows.map((r) => `${"  ".repeat(r.depth)}${r.name}${r.text ? ` "${r.text}"` : ""}`);

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
});
