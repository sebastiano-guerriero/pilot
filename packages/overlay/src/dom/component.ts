/**
 * The page's components, from what the framework leaves on the DOM in
 * development (Pilot only runs there): which component instance renders an
 * element, every instance of that component on the page, and where its code
 * is. Plain HTML, or a framework Pilot doesn't read yet, gives null, and
 * callers fall back to the page's structure (dom/similar.ts).
 *
 * - **React** (16 and later): each DOM node carries its fiber
 *   (`__reactFiber$…`). Pilot walks the live tree once from its root (the
 *   root's `current`, so no stale copies), and a component is identified by
 *   its type (the function or class): every `<ProductCard>` is an instance,
 *   whatever its props. The file comes from the element's `_debugSource`
 *   (React 18 and earlier) or the stack React 19 records where the element
 *   was created (`_debugStack`), when its frames point at a source file.
 * - **Vue 3**: each element carries the component that rendered it
 *   (`__vueParentComponent`); the instances come from walking the app's
 *   tree from its root; the file is the component's `__file`.
 *
 * Svelte and Angular aren't read yet.
 */

/** A component instance on the page. */
export interface ComponentInstance {
  /** What makes two instances the same component: its function, class or definition. */
  type: unknown;
  /** Its name (`ProductCard`), "" when it has none. */
  name: string;
  /** The DOM elements it renders at its top level (several for a fragment), in order. */
  roots: Element[];
}

/** Where an element's code is, as far as the framework says. */
export interface ComponentSource {
  component?: string;
  file?: string;
  line?: number;
}

/** A framework Pilot reads components from. */
interface Reader {
  /** The instances rendering `element`, the nearest first, up to the app's root. */
  ownersOf(element: Element): ComponentInstance[];
  /** Every instance of `type` on the page. */
  instancesOf(element: Element, type: unknown): ComponentInstance[];
  sourceOf(element: Element): ComponentSource | null;
}

/** The instances rendering `element`, the nearest first; empty when Pilot can't tell. */
export function ownersOf(element: Element): ComponentInstance[] {
  return readerFor(element)?.ownersOf(element) ?? [];
}

/** Every instance of the same component as `instance` on the page, `instance` included. */
export function instancesOf(element: Element, instance: ComponentInstance): ComponentInstance[] {
  return readerFor(element)?.instancesOf(element, instance.type) ?? [];
}

/** The component rendering `element` and its file, when the framework says. */
export function componentSource(element: Element): ComponentSource | null {
  try {
    return readerFor(element)?.sourceOf(element) ?? null;
  } catch {
    return null;
  }
}

function readerFor(element: Element): Reader | null {
  if (reactFiberOf(element)) return react;
  if (vueOwnerOf(element)) return vue;
  return null;
}

// React

interface Fiber {
  tag: number;
  type: unknown;
  stateNode: unknown;
  return: Fiber | null;
  child: Fiber | null;
  sibling: Fiber | null;
  _debugSource?: { fileName?: string; lineNumber?: number };
  _debugStack?: { stack?: string };
  _debugOwner?: Fiber | null;
}

/** Fiber tags (React's ReactWorkTags). */
const FUNCTION = 0;
const CLASS = 1;
const ROOT = 3;
const PORTAL = 4;
const HOST = 5;
const FORWARD_REF = 11;
const SIMPLE_MEMO = 15;
/** React 19's host elements for hoisted tags and `html`/`head`/`body`. */
const HOST_HOISTABLE = 26;
const HOST_SINGLETON = 27;

const isComponent = (f: Fiber) => f.tag === FUNCTION || f.tag === CLASS || f.tag === FORWARD_REF || f.tag === SIMPLE_MEMO;
const isHost = (f: Fiber) => f.tag === HOST || f.tag === HOST_HOISTABLE || f.tag === HOST_SINGLETON;

function reactFiberOf(node: Node): Fiber | null {
  for (const key of Object.keys(node)) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"))
      return (node as unknown as Record<string, Fiber>)[key] ?? null;
  }
  return null;
}

function reactName(type: unknown): string {
  const t = type as { displayName?: string; name?: string; render?: { displayName?: string; name?: string } } | null;
  return t?.displayName || t?.name || t?.render?.displayName || t?.render?.name || "";
}

/** The live tree: every component fiber by type, and the host fiber of each element. */
interface ReactTree {
  byType: Map<unknown, Fiber[]>;
  hostOf: Map<Element, Fiber>;
}

function reactTree(element: Element): ReactTree | null {
  let fiber = reactFiberOf(element);
  while (fiber && fiber.tag !== ROOT) fiber = fiber.return;
  const current = (fiber?.stateNode as { current?: Fiber } | undefined)?.current;
  if (!current) return null;
  const byType = new Map<unknown, Fiber[]>();
  const hostOf = new Map<Element, Fiber>();
  const stack: Fiber[] = [current];
  let visited = 0;
  while (stack.length && visited++ < 50_000) {
    const f = stack.pop() as Fiber;
    if (isComponent(f)) {
      const list = byType.get(f.type);
      if (list) list.push(f);
      else byType.set(f.type, [f]);
    } else if (isHost(f) && f.stateNode instanceof Element) hostOf.set(f.stateNode, f);
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
  }
  return { byType, hostOf };
}

/** A component fiber's top-level DOM elements (a portal's aren't on its spot of the page). */
function reactRoots(fiber: Fiber): Element[] {
  const roots: Element[] = [];
  const walk = (f: Fiber | null) => {
    for (let c = f?.child ?? null; c; c = c.sibling) {
      if (isHost(c)) {
        if (c.stateNode instanceof Element) roots.push(c.stateNode);
      } else if (c.tag !== PORTAL) walk(c);
    }
  };
  walk(fiber);
  return roots;
}

const reactInstance = (f: Fiber): ComponentInstance => ({ type: f.type, name: reactName(f.type), roots: reactRoots(f) });

const react: Reader = {
  ownersOf(element) {
    const host = reactTree(element)?.hostOf.get(element);
    const owners: ComponentInstance[] = [];
    for (let f = host?.return ?? null; f; f = f.return) if (isComponent(f)) owners.push(reactInstance(f));
    return owners;
  },
  instancesOf(element, type) {
    return (reactTree(element)?.byType.get(type) ?? []).map(reactInstance);
  },
  sourceOf(element) {
    const fiber = reactFiberOf(element);
    if (!fiber) return null;
    // The component whose code wrote this element (its owner), else the nearest one rendering it.
    let owner = fiber._debugOwner ?? null;
    if (!owner || !isComponent(owner)) for (owner = fiber.return; owner && !isComponent(owner); owner = owner.return);
    const source: ComponentSource = {};
    const name = owner && reactName(owner.type);
    if (name) source.component = name;
    const at = fiber._debugSource;
    if (at?.fileName) {
      source.file = at.fileName;
      if (at.lineNumber) source.line = at.lineNumber;
    } else {
      const file = fileFromStack(fiber._debugStack?.stack);
      if (file) source.file = file;
    }
    return source.component || source.file ? source : null;
  },
};

/**
 * The source file a React 19 element was created in, from the stack React
 * records then: the first frame that's the app's own code (not React, not
 * a dependency, not a bundle chunk). Its line is the transformed module's,
 * so only the file is kept.
 */
export function fileFromStack(stack: string | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split("\n")) {
    // "    at Card (url:line:col)", or "    at url:line:col"; a webpack URL has parentheses of its own.
    const location = /\((.*)\)\s*$/.exec(line)?.[1] ?? /\bat (\S+)\s*$/.exec(line)?.[1];
    const url = location?.replace(/(?::\d+){1,2}$/, "");
    if (!url || !/^(?:https?|webpack-internal|file):\/\//.test(url)) continue;
    if (/\/node_modules\/|\/\.vite\/deps\/|\/@vite\/|\/@react-refresh|\/_next\/|\/chunks\//.test(url)) continue;
    // webpack-internal:///(app-pages-browser)/./src/Card.tsx, http://localhost:5173/src/Card.tsx?t=123
    const path = decodeURIComponent(
      url.replace(/^webpack-internal:\/\/\/(\([^)]*\)\/)?\.?\/?/, "").replace(/^(?:https?|file):\/\/[^/]*\//, ""),
    ).replace(/\?.*$/, "");
    if (/\.(?:[jt]sx?|mjs|vue|svelte)$/.test(path)) return path;
  }
  return null;
}

// Vue 3

interface VueInstance {
  type: { name?: string; __name?: string; __file?: string } | null;
  parent: VueInstance | null;
  subTree: VNode | null;
}

interface VNode {
  type: unknown;
  el: unknown;
  component: VueInstance | null;
  children: unknown;
}

function vueOwnerOf(element: Element): VueInstance | null {
  return ((element as unknown as { __vueParentComponent?: VueInstance }).__vueParentComponent ?? null) || null;
}

function vueName(type: VueInstance["type"]): string {
  return (
    type?.name ||
    type?.__name ||
    type?.__file
      ?.split("/")
      .pop()
      ?.replace(/\.vue$/, "") ||
    ""
  );
}

function vueRoots(vnode: VNode | null): Element[] {
  if (!vnode) return [];
  if (vnode.component) return vueRoots(vnode.component.subTree);
  if (typeof vnode.type === "string") return vnode.el instanceof Element ? [vnode.el] : [];
  return Array.isArray(vnode.children) ? (vnode.children as VNode[]).flatMap((c) => (c && typeof c === "object" ? vueRoots(c) : [])) : [];
}

const vueInstance = (i: VueInstance): ComponentInstance => ({ type: i.type, name: vueName(i.type), roots: vueRoots(i.subTree) });

const vue: Reader = {
  ownersOf(element) {
    const owners: ComponentInstance[] = [];
    for (let i = vueOwnerOf(element); i; i = i.parent) owners.push(vueInstance(i));
    return owners;
  },
  instancesOf(element, type) {
    let root = vueOwnerOf(element);
    while (root?.parent) root = root.parent;
    const found: ComponentInstance[] = [];
    let visited = 0;
    const walk = (vnode: unknown) => {
      if (!vnode || typeof vnode !== "object" || visited++ > 50_000) return;
      const v = vnode as VNode;
      if (v.component) return visit(v.component);
      if (Array.isArray(v.children)) for (const c of v.children) walk(c);
    };
    const visit = (i: VueInstance) => {
      if (i.type === type) found.push(vueInstance(i));
      walk(i.subTree);
    };
    if (root) visit(root);
    return found;
  },
  sourceOf(element) {
    const owner = vueOwnerOf(element);
    if (!owner) return null;
    const source: ComponentSource = {};
    const name = vueName(owner.type);
    if (name) source.component = name;
    if (owner.type?.__file) source.file = owner.type.__file;
    return source.component || source.file ? source : null;
  },
};
