import type { PropValue } from "@pilot/protocol";
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
 *   **Server Components** (Next.js's App Router, the default there) have no
 *   fibers on the client: React records them in development on the fibers
 *   they rendered (`_debugInfo`) and as the owner of the elements they wrote
 *   (`_debugOwner`), by name. An instance is one such record, its elements
 *   the fibers that carry it. With Server Components on the page, a client
 *   component counts only when it was created, step by step, by one of them
 *   (the app's pages and layouts): the framework's own components
 *   (`InnerLayoutRouter`, `SegmentViewNode`…) trace back to none, so they're
 *   never taken for the app's.
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

/**
 * The component an element is the top-level element of (the card a
 * `<ProductCard>` renders), for the hover label: its name, or null (an
 * element inside a component, or no component Pilot reads). Cheap, as it
 * runs on every hover: it walks up from the element only, never the whole
 * tree. The innermost one when several share the element; with Server
 * Components on the page, only the app's (as for Select similar).
 */
export function componentName(element: Element): string | null {
  try {
    const fiber = reactFiberOf(element);
    if (fiber) return reactRootName(fiber);
    const owner = vueOwnerOf(element);
    if (owner && vueRoots(owner.subTree).includes(element)) return vueName(owner.type) || null;
  } catch {
    // A framework's internals Pilot didn't expect: no name.
  }
  return null;
}

/** An instance's props as Pilot can show and set them: strings, numbers and on-off values; and where it's written. */
export interface InstanceProps {
  component: string;
  props: Record<string, PropValue>;
  /** The file where the instance is written (its parent's code: `<ProductCard …>`), when the framework says. */
  usedIn?: string;
}

/** Props never listed: the framework's own, and what a designer doesn't set from a list. */
const NOT_PROPS = new Set(["children", "key", "ref", "className", "class", "style", "id"]);
const MAX_PROPS = 30;

function scalarProps(all: Record<string, unknown> | null | undefined): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [name, value] of Object.entries(all ?? {})) {
    if (Object.keys(out).length >= MAX_PROPS) break;
    if (NOT_PROPS.has(name) || name.startsWith("__")) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[name] = value;
  }
  return out;
}

/**
 * The props of the component an element is the top of (see componentName),
 * as this instance has them now, read from the framework in development:
 * React's fiber (`memoizedProps`), Vue's instance (`props`). Null for an
 * element inside a component, a Server Component (its props stay on the
 * server), or a framework Pilot doesn't read.
 */
export function componentProps(element: Element): InstanceProps | null {
  try {
    const name = componentName(element);
    if (!name) return null;
    const found = reactFiberOf(element);
    const fiber = found && currentFiber(found);
    if (fiber) {
      for (let f = fiber.return; f && !isHost(f); f = f.return) {
        if (!isComponent(f) || reactName(f.type) !== name) continue;
        const usedIn = f._debugSource?.fileName ?? fileFromStack(f._debugStack?.stack) ?? undefined;
        return { component: name, props: scalarProps(f.memoizedProps), ...(usedIn ? { usedIn } : {}) };
      }
      return null;
    }
    const owner = vueOwnerOf(element);
    if (!owner) return null;
    const usedIn = owner.parent?.type?.__file;
    return { component: name, props: scalarProps(owner.props), ...(usedIn ? { usedIn } : {}) };
  } catch {
    return null;
  }
}

/**
 * The fiber as the page shows it now: React keeps two of each (the one on
 * screen and the one it works on) and the one a DOM node points at may be
 * the other, with the props from before the last render. The root knows
 * which is on screen (as React DevTools tells them apart).
 */
function currentFiber(fiber: Fiber): Fiber {
  let root: Fiber = fiber;
  while (root.return) root = root.return;
  const onScreen = (root.stateNode as { current?: Fiber } | null)?.current;
  return root.tag === ROOT && onScreen && onScreen !== root && fiber.alternate ? fiber.alternate : fiber;
}

function reactRootName(fiber: Fiber): string | null {
  // A Server Component whose output starts here.
  const server = serversAt(fiber)[0];
  if (server) return server.name;
  // Up to the next element: the components on the way render this one at their top level.
  let rsc: boolean | null = null;
  for (let f = fiber.return; f && !isHost(f); f = f.return) {
    if (serversAt(f)[0]) return (serversAt(f)[0] as ServerComponent).name;
    if (!isComponent(f)) continue;
    rsc ??= usesServerComponents(fiber);
    if (!rsc || ownedByServerComponent(f)) return reactName(f.type) || null;
  }
  return null;
}

/** Whether the page renders Server Components: React's records of them on the way up to the root. */
function usesServerComponents(fiber: Fiber): boolean {
  for (let f: Fiber | null = fiber; f; f = f.return) if (serversAt(f).length) return true;
  return false;
}

/** Whether the chain of who created `fiber` reaches a Server Component (the app's, see isAppComponent). */
function ownedByServerComponent(fiber: Fiber): boolean {
  let owner = fiber._debugOwner ?? null;
  for (let i = 0; owner && i < 200; i++) {
    if (isServerComponent(owner)) return true;
    owner = isFiber(owner) ? (owner._debugOwner ?? null) : ((owner as ServerComponent).owner ?? null);
  }
  return false;
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
  _debugOwner?: Fiber | ServerComponent | null;
  _debugInfo?: unknown[] | null;
  memoizedProps?: Record<string, unknown> | null;
  alternate?: Fiber | null;
}

/** A Server Component as React records it in development (ReactComponentInfo). */
interface ServerComponent {
  name: string;
  env?: string;
  owner?: Fiber | ServerComponent | null;
}

const isFiber = (x: unknown): x is Fiber => typeof (x as Fiber | null)?.tag === "number";
/** A Server Component record (not React's timing records, nor a framework's own `__next…`). */
const isServerComponent = (x: unknown): x is ServerComponent =>
  !!x && typeof x === "object" && typeof (x as ServerComponent).name === "string" && !isFiber(x) && !(x as ServerComponent).name.startsWith("__");
/** The Server Components whose output starts at `f`, the innermost first. */
const serversAt = (f: Fiber): ServerComponent[] => (Array.isArray(f._debugInfo) ? f._debugInfo.filter(isServerComponent).reverse() : []);
const SERVER = "rsc:";

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

/** The live tree: every component fiber by type, the host fiber of each element, and each Server Component's fibers. */
interface ReactTree {
  byType: Map<unknown, Fiber[]>;
  hostOf: Map<Element, Fiber>;
  /** By name, each instance (its record) and the fibers it rendered. */
  servers: Map<string, Map<ServerComponent, Fiber[]>>;
}

function reactTree(element: Element): ReactTree | null {
  let fiber = reactFiberOf(element);
  while (fiber && fiber.tag !== ROOT) fiber = fiber.return;
  const current = (fiber?.stateNode as { current?: Fiber } | undefined)?.current;
  if (!current) return null;
  const byType = new Map<unknown, Fiber[]>();
  const hostOf = new Map<Element, Fiber>();
  const servers = new Map<string, Map<ServerComponent, Fiber[]>>();
  const stack: Fiber[] = [current];
  let visited = 0;
  while (stack.length && visited++ < 50_000) {
    const f = stack.pop() as Fiber;
    for (const info of serversAt(f)) {
      const instances = servers.get(info.name) ?? new Map<ServerComponent, Fiber[]>();
      servers.set(info.name, instances);
      instances.set(info, [...(instances.get(info) ?? []), f]);
    }
    if (isComponent(f)) {
      const list = byType.get(f.type);
      if (list) list.push(f);
      else byType.set(f.type, [f]);
    } else if (isHost(f) && f.stateNode instanceof Element) hostOf.set(f.stateNode, f);
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
  }
  return { byType, hostOf, servers };
}

/**
 * Whether a client component is the app's: always, on a page without Server
 * Components; with them, when the chain of who created it reaches one.
 */
function isAppComponent(fiber: Fiber, tree: ReactTree): boolean {
  if (!tree.servers.size) return true;
  let owner = fiber._debugOwner ?? null;
  for (let i = 0; owner && i < 200; i++) {
    if (isServerComponent(owner)) return true;
    owner = isFiber(owner) ? (owner._debugOwner ?? null) : ((owner as ServerComponent).owner ?? null);
  }
  return false;
}

/** A fiber's top-level DOM elements: itself for an element, else what it renders. */
const hostsOf = (f: Fiber): Element[] => (isHost(f) ? (f.stateNode instanceof Element ? [f.stateNode] : []) : reactRoots(f));

const serverInstance = (tree: ReactTree, info: ServerComponent): ComponentInstance => ({
  type: SERVER + info.name,
  name: info.name,
  roots: (tree.servers.get(info.name)?.get(info) ?? []).flatMap(hostsOf),
});

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
    const tree = reactTree(element);
    const host = tree?.hostOf.get(element);
    const owners: ComponentInstance[] = [];
    if (!tree) return owners;
    // Up from the element: the client components rendering it, and the Server Components whose output starts on the way.
    for (let f: Fiber | null = host ?? null; f; f = f.return) {
      if (f !== host && isComponent(f) && isAppComponent(f, tree)) owners.push(reactInstance(f));
      for (const info of serversAt(f)) owners.push(serverInstance(tree, info));
    }
    return owners;
  },
  instancesOf(element, type) {
    const tree = reactTree(element);
    if (!tree) return [];
    if (typeof type === "string" && type.startsWith(SERVER)) {
      return [...(tree.servers.get(type.slice(SERVER.length))?.keys() ?? [])].map((info) => serverInstance(tree, info));
    }
    return (tree.byType.get(type) ?? []).map(reactInstance);
  },
  sourceOf(element) {
    const fiber = reactFiberOf(element);
    if (!fiber) return null;
    // The component whose code wrote this element (its owner: a client component, or a Server Component's record), else the nearest one rendering it.
    const writer = fiber._debugOwner ?? null;
    let name = "";
    if (isServerComponent(writer)) name = writer.name;
    else {
      let owner: Fiber | null = isFiber(writer) && isComponent(writer) ? writer : null;
      if (!owner) for (owner = fiber.return; owner && !isComponent(owner); owner = owner.return);
      name = owner ? reactName(owner.type) : "";
    }
    const source: ComponentSource = {};
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
  props?: Record<string, unknown>;
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
