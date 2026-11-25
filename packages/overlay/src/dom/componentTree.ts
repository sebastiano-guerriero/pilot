import type { ComponentNode } from "./component.ts";
import { isEditable } from "./target.ts";

/**
 * The DOM tree panel's Components view: the page's component instances
 * (dom/component.ts, componentTree) as rows, expanded where the designer
 * opened them and down to the selection, as the DOM view's (dom/domTree.ts).
 */

/** One row: a component instance. */
export interface ComponentRow {
  node: ComponentNode;
  /** Nesting level, 0 for the app's outermost components. */
  depth: number;
  expandable: boolean;
  expanded: boolean;
  /** The ids of the nodes around it, outermost first (← goes to the last one). */
  path: number[];
}

/** The rows to show: each expanded node's children, depth first. */
export function componentRows(nodes: readonly ComponentNode[], expanded: ReadonlySet<number>): ComponentRow[] {
  const rows: ComponentRow[] = [];
  const walk = (list: readonly ComponentNode[], depth: number, path: number[]) => {
    for (const node of list) {
      const expandable = node.children.length > 0;
      const open = expandable && expanded.has(node.id);
      rows.push({ node, depth, expandable, expanded: open, path });
      if (open) walk(node.children, depth + 1, [...path, node.id]);
    }
  };
  walk(nodes, 0, []);
  return rows;
}

/** Whether the node draws `element`: one of its top-level elements is it, or holds it. */
function draws(node: ComponentNode, element: Element): boolean {
  return node.roots.some((root) => root === element || root.contains(element));
}

/**
 * The nodes around `element`, outermost first, down to the innermost one
 * that draws it: what to open to show it. Empty when no component draws it.
 */
export function pathTo(nodes: readonly ComponentNode[], element: Element): ComponentNode[] {
  for (const node of nodes) {
    if (!draws(node, element)) continue;
    return [node, ...pathTo(node.children, element)];
  }
  return [];
}

/**
 * The node standing for `element`: the innermost one it's a top-level
 * element of (a `<Card>` and the `<CardRoot>` it renders share their
 * element: the inner one), or null when it's inside a component, not its top.
 */
export function nodeOf(nodes: readonly ComponentNode[], element: Element): ComponentNode | null {
  const path = pathTo(nodes, element);
  for (let i = path.length - 1; i >= 0; i--) if ((path[i] as ComponentNode).roots.includes(element)) return path[i] as ComponentNode;
  return null;
}

/** What picking a row selects: the instance's top-level elements Pilot can edit. */
export function selectable(node: ComponentNode): Element[] {
  return node.roots.filter(isEditable);
}
