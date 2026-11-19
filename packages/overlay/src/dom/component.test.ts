// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { componentName, componentProps, componentSource, fileFromStack, ownersOf } from "./component.ts";
import { elementName } from "./name.ts";
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
  _debugOwner?: Fiber | object;
  _debugInfo?: object[];
  memoizedProps?: Record<string, unknown>;
  alternate?: Fiber;
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

  it("the hover label: a component's top-level element by its name; elements inside it by their own", () => {
    const titles = page();
    const card = document.querySelector("article") as HTMLElement;
    expect(componentName(card)).toBe("ProductCard");
    expect(elementName(card)).toBe("ProductCard");
    expect(componentName(titles[0] as HTMLElement)).toBeNull();
    expect(elementName(titles[0] as HTMLElement)).toBe("h3");
    expect(elementName(document.querySelector(".app > h3") as HTMLElement)).toBe("Hero");
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

describe("components: React Server Components (Next.js App Router)", () => {
  function InnerLayoutRouter() {}
  function Badge() {}

  /**
   * Three ProductCard Server Components (no fibers: React records each on
   * the element it rendered, `_debugInfo`, and as the owner of the elements
   * it wrote, `_debugOwner`), inside the framework's own client components
   * (no owner), the second card with a client Badge it created.
   */
  const page = () => {
    const home = { name: "Home", env: "Server" };
    const cards = ["One", "Two", "Three"].map((text, i) => {
      const info = { name: "ProductCard", env: "Server", owner: home, props: {} };
      const title = host("h3", { text });
      title._debugOwner = info;
      const extra = i === 1 ? [component(Badge, host("span", { text: "New" }))] : [];
      for (const c of extra) c._debugOwner = info;
      const article = host("article", { class: ["bg-white p-4", "bg-black p-6 shadow", "ring-1"][i] }, ...extra, title);
      article._debugInfo = [{ time: 1 }, info, { time: 2 }];
      article._debugOwner = info;
      return article;
    });
    const main = host("main", {}, ...cards);
    main._debugInfo = [home];
    // The framework's own client components around the page: two of them, created by nothing of the app's.
    mountReact(host("div", {}, component(InnerLayoutRouter, component(InnerLayoutRouter, main))));
    return [...document.querySelectorAll("article h3")] as HTMLElement[];
  };

  it("each card's title: every ProductCard instance, never the framework's components", () => {
    const titles = page();
    expect(ownersOf(titles[0] as HTMLElement).map((o) => o.name)).toEqual(["ProductCard", "Home"]);
    expect(similarOf(titles[0] as HTMLElement)).toEqual({ component: "ProductCard", elements: [titles[1], titles[2]] });
    const cards = [...document.querySelectorAll("article")];
    expect(similarOf(cards[2] as HTMLElement)).toEqual({ component: "ProductCard", elements: [cards[0], cards[1]] });
  });

  it("the hover label: Server Components by name, never the framework's own components", () => {
    page();
    expect(elementName(document.querySelector("article") as HTMLElement)).toBe("ProductCard");
    expect(elementName(document.querySelector("main") as HTMLElement)).toBe("Home");
    expect(elementName(document.querySelector("body > div") as HTMLElement)).toBe("div");
  });

  it("the source: the Server Component that wrote the element; a client component it created counts as the app's", () => {
    const titles = page();
    expect(componentSource(titles[1] as HTMLElement)).toEqual({ component: "ProductCard" });
    const badge = document.querySelector("span") as HTMLElement;
    expect(ownersOf(badge).map((o) => o.name)).toEqual(["Badge", "ProductCard", "Home"]);
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

describe("an instance's props", () => {
  it("React: the instance's own props as the page has them (strings, numbers, on-off), and the file it's written in", () => {
    const card = component(ProductCard, host("article", { class: "card" }));
    card.memoizedProps = {
      tone: "light",
      name: "Desk lamp",
      count: 3,
      featured: false,
      onClick: () => {},
      children: "x",
      className: "card",
      style: {},
    };
    card._debugSource = { fileName: "src/App.jsx", lineNumber: 7 };
    mountReact(host("main", {}, card));
    const article = document.querySelector("article") as Element;
    expect(componentProps(article)).toEqual({
      component: "ProductCard",
      props: { tone: "light", name: "Desk lamp", count: 3, featured: false },
      usedIn: "src/App.jsx",
    });
    // An element inside it isn't the instance's.
    expect(componentProps(document.querySelector("main") as Element)).toBeNull();
  });

  it("React: after a render, from the copy on screen, not the stale one the DOM node points at", () => {
    const stale = component(ProductCard, host("article"));
    stale.memoizedProps = { tone: "light" };
    mountReact(host("main", {}, stale));
    const article = document.querySelector("article") as Element;
    const node = (article as unknown as Record<string, Fiber>)["__reactFiber$abc123"] as Fiber;
    // React rendered again: the other copies are on screen, with the new props.
    const fresh = { ...stale, memoizedProps: { tone: "dark" } };
    node.alternate = { ...node, return: fresh };
    let root = node;
    while (root.return) root = root.return;
    (root.stateNode as { current: unknown }).current = {};
    expect(componentProps(article)?.props).toEqual({ tone: "dark" });
  });

  it("Vue: the instance's props, and its parent's file", () => {
    const node = document.createElement("div");
    const instance = {
      type: { __name: "PriceCard" },
      parent: { type: { __file: "/app/src/Pricing.vue" }, parent: null, subTree: null },
      subTree: { type: "div", el: node, component: null, children: [] },
      props: { plan: "Starter", featured: false, onSelect: () => {} },
    };
    Object.defineProperty(node, "__vueParentComponent", { value: instance, enumerable: false });
    document.body.append(node);
    expect(componentProps(node)).toEqual({
      component: "PriceCard",
      props: { plan: "Starter", featured: false },
      usedIn: "/app/src/Pricing.vue",
    });
  });
});
