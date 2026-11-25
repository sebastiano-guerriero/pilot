// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentNode } from "./component.ts";
import { componentRows, nodeOf, pathTo } from "./componentTree.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Page: <App main> <Card article (CardRoot shares it) > h3 </Card> <Footer footer/> </App> */
function page() {
  document.body.innerHTML = "<main><article><h3>Title</h3></article><footer></footer></main>";
  const [main, article, h3, footer] = ["main", "article", "h3", "footer"].map((t) => document.querySelector(t) as Element);
  const cardRoot: ComponentNode = { id: 3, name: "CardRoot", roots: [article as Element], children: [] };
  const card: ComponentNode = { id: 2, name: "Card", roots: [article as Element], children: [cardRoot] };
  const foot: ComponentNode = { id: 4, name: "Footer", roots: [footer as Element], children: [] };
  const app: ComponentNode = { id: 1, name: "App", roots: [main as Element], children: [card, foot] };
  return { nodes: [app], h3: h3 as Element, article: article as Element };
}

describe("component tree rows", () => {
  it("rows: each opened node's children, depth first, with the path around each", () => {
    const { nodes } = page();
    expect(componentRows(nodes, new Set()).map((r) => r.node.name)).toEqual(["App"]);
    const rows = componentRows(nodes, new Set([1, 2]));
    expect(rows.map((r) => [r.node.name, r.depth, r.expandable, r.expanded])).toEqual([
      ["App", 0, true, true],
      ["Card", 1, true, true],
      ["CardRoot", 2, false, false],
      ["Footer", 1, false, false],
    ]);
    expect(rows[2]?.path).toEqual([1, 2]);
  });

  it("an element: the components around it to open, and the innermost it's the top of", () => {
    const { nodes, h3, article } = page();
    expect(pathTo(nodes, h3).map((n) => n.name)).toEqual(["App", "Card", "CardRoot"]);
    expect(nodeOf(nodes, article)?.name).toBe("CardRoot");
    // Inside a component, not its top: none stands for it.
    expect(nodeOf(nodes, h3)).toBeNull();
  });
});
