// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { componentSource, fileFromStack, ownersOf } from "./component.ts";
import { similarOf } from "./similar.ts";

/**
 * Fake framework trees, shaped as React and Vue leave them on the DOM in
 * development: enough of a fiber (tag, type, stateNode, links) and of a Vue
 * instance (type, parent, subTree vnodes).
 */

interface Fiber {
  tag: number;
  type: unknown;
  stateNode: unknown;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  _debugSource?: { fileName: string; lineNumber: number };
  _debugStack?: { stack: string };
  _debugOwner?: Fiber;
}

const fiber = (tag: number, type: unknown, stateNode: unknown = null): Fiber => ({
  tag,
  type,
  stateNode,
  return: null,
  child: null,
  sibling: null,
});

/** Links `children` under `parent` (child, sibling, return). */
function link(parent: Fiber, ...children: Fiber[]): Fiber {
  parent.child = children[0] ?? null;
  children.forEach((c, i) => {
    c.return = parent;
    c.sibling = children[i + 1] ?? null;
  });
  return parent;
}

/** A host fiber for a new element, which gets the fiber as React does; `children` are fibers under it. */
function host(tag: string, attrs: { class?: string; text?: string } = {}, ...children: Fiber[]): Fiber {
  const el = document.createElement(tag);
  if (attrs.class) el.className = attrs.class;
  if (attrs.text) el.textContent = attrs.text;
  const f = fiber(5, tag, el);
  (el as unknown as Record<string, Fiber>)["__reactFiber$abc123"] = f;
  for (const c of children) {
    // DOM children: the host elements at the top of each child fiber.
    for (const node of topElements(c)) el.append(node);
  }
  return link(f, ...children);
}

function topElements(f: Fiber): Element[] {
  if (f.tag === 5) return [f.stateNode as Element];
  const out: Element[] = [];
  for (let c = f.child; c; c = c.sibling) out.push(...topElements(c));
  return out;
}

/** A function component fiber rendering `children`. */
const component = (type: unknown, ...children: Fiber[]) => link(fiber(0, type), ...children);

/** Mounts `app` (a host fiber) under a HostRoot, into the body. */
function mountReact(app: Fiber): void {
  const root = fiber(3, null);
  root.stateNode = { current: root };
  link(root, app);
  document.body.append(app.stateNode as Element);
}

afterEach(() => {
  document.body.innerHTML = "";
});

function ProductCard() {}
function CardTitle() {}
function Hero() {}
function Button() {}

describe("components: React", () => {
  /** Three ProductCards as variants (classes differ entirely), each with a title and a text; the second has a badge first. */
  const page = (withTitleComponent = false) => {
    const title = (text: string) => (withTitleComponent ? component(CardTitle, host("h3", { text })) : host("h3", { text }));
    const card = (cls: string, text: string, badge = false) =>
      component(
        ProductCard,
        host(
          "article",
          { class: cls },
          ...(badge ? [host("span", { text: "New" })] : []),
          title(text),
          host("p", { text: `${text} text` }),
        ),
      );
    mountReact(
      host(
        "div",
        { class: "app" },
        component(Hero, host("h3", { text: "Hero" })),
        card("bg-white p-4 rounded-lg", "One"),
        card("bg-zinc-900 px-6 py-3 shadow", "Two", true),
        card("border ring-1 grid", "Three"),
      ),
    );
    return [...document.querySelectorAll("article h3")] as HTMLElement[];
  };

  it("a card's title: the title of every instance of its component, whatever their classes (variants)", () => {
    const titles = page();
    const similar = similarOf(titles[0] as HTMLElement);
    expect(similar.component).toBe("ProductCard");
    expect(similar.elements).toEqual([titles[1], titles[2]]);
    // The page's structure alone wouldn't find them: the classes differ.
    expect(ownersOf(titles[0] as HTMLElement).map((o) => o.name)).toEqual(["ProductCard"]);
  });

  it("the nearest component with other instances: a title component's instances", () => {
    const titles = page(true);
    expect(similarOf(titles[2] as HTMLElement)).toEqual({ component: "CardTitle", elements: [titles[0], titles[1]] });
  });

  it("a component with one instance on the page passes it on; none repeats: the page's structure", () => {
    page();
    const hero = document.querySelector(".app > h3") as HTMLElement;
    expect(similarOf(hero)).toEqual({ elements: [] });
  });

  it("instances of a component whatever their props: every Button", () => {
    mountReact(
      host(
        "div",
        {},
        component(Button, host("button", { class: "btn btn-primary", text: "Save" })),
        component(Button, host("button", { class: "btn-ghost text-sm", text: "Cancel" })),
      ),
    );
    const [save, cancel] = [...document.querySelectorAll("button")] as HTMLElement[];
    expect(similarOf(save as HTMLElement)).toEqual({ component: "Button", elements: [cancel] });
  });

  it("the source: the component that wrote the element, and its file (React 18's _debugSource, React 19's stack)", () => {
    const titles = page();
    const titleFiber = (titles[0] as unknown as Record<string, Fiber>)["__reactFiber$abc123"] as Fiber;
    expect(componentSource(titles[0] as HTMLElement)).toEqual({ component: "ProductCard" });
    titleFiber._debugSource = { fileName: "/app/src/ProductCard.tsx", lineNumber: 12 };
    expect(componentSource(titles[0] as HTMLElement)).toEqual({ component: "ProductCard", file: "/app/src/ProductCard.tsx", line: 12 });
    titleFiber._debugSource = undefined;
    titleFiber._debugStack = {
      stack: [
        "Error: react-stack-top-frame",
        "    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:250:30)",
        "    at ProductCard (http://localhost:5173/src/components/ProductCard.tsx?t=1700000:21:9)",
      ].join("\n"),
    };
    expect(componentSource(titles[0] as HTMLElement)).toEqual({ component: "ProductCard", file: "src/components/ProductCard.tsx" });
  });
});

describe("fileFromStack", () => {
  it("the first frame in the app's own code: Vite, webpack; never React, dependencies or bundle chunks", () => {
    expect(fileFromStack("    at Card (webpack-internal:///(app-pages-browser)/./src/components/Card.tsx:14:5)")).toBe(
      "src/components/Card.tsx",
    );
    expect(fileFromStack("    at Card (http://localhost:3000/_next/static/chunks/src_Card_tsx.js:1:200)")).toBeNull();
    expect(
      fileFromStack("    at x (http://localhost:5173/node_modules/react/index.js:1:1)\n    at App (http://localhost:5173/src/App.jsx:3:1)"),
    ).toBe("src/App.jsx");
    expect(fileFromStack(undefined)).toBeNull();
  });
});

describe("components: Vue", () => {
  interface Instance {
    type: object;
    parent: Instance | null;
    subTree: unknown;
  }

  /** An element vnode, its element owned by `owner` (Vue sets __vueParentComponent, not enumerable). */
  function el(
    owner: Instance,
    tag: string,
    cls: string,
    ...children: Array<{ el: Element }>
  ): { type: string; el: Element; component: null; children: unknown[] } {
    const node = document.createElement(tag);
    node.className = cls;
    Object.defineProperty(node, "__vueParentComponent", { value: owner, enumerable: false });
    for (const c of children) node.append(c.el);
    return { type: tag, el: node, component: null, children };
  }

  it("instances of a component, by its definition; the source is its __file", () => {
    const Card = { __name: "PriceCard", __file: "/app/src/components/PriceCard.vue" };
    const App = { name: "App" };
    const app: Instance = { type: App, parent: null, subTree: null };
    const cards = ["bg-white", "bg-black shadow", "ring-1"].map((cls) => {
      const instance: Instance = { type: Card, parent: app, subTree: null };
      const tree = el(instance, "div", cls, el(instance, "h4", "price"));
      instance.subTree = tree;
      return { type: Card, el: tree.el, component: instance, children: null };
    });
    const root = el(app, "main", "", ...cards);
    root.children = cards;
    app.subTree = root;
    document.body.append(root.el);
    const prices = [...document.querySelectorAll("h4")] as HTMLElement[];
    expect(similarOf(prices[1] as HTMLElement)).toEqual({ component: "PriceCard", elements: [prices[0], prices[2]] });
    expect(componentSource(prices[1] as HTMLElement)).toEqual({ component: "PriceCard", file: "/app/src/components/PriceCard.vue" });
  });
});
