import { mountPilot, type PilotInstance } from "@pilot/overlay";

/**
 * Canvas prototype: what a page exposes when it runs inside a canvas frame.
 * The canvas (canvas.html) is same-origin, so it calls these directly on
 * `iframe.contentWindow.__pilotFrame`. A real build would use postMessage.
 */
export interface FrameBridge {
  /** Mount Pilot in this frame and launch it (the canvas "enters" the frame). */
  enter(): void;
  /** Unmount Pilot. Its inline edits stay on the page. */
  exit(): void;
  /** The page's own size: the frame grows to fit it. Called on every change. */
  onSize(callback: (size: { width: number; height: number }) => void): () => void;
  /** Links on the page, with where they sit (for the canvas's flow arrows). */
  links(): Array<{ href: string; rect: Rect }>;
  /**
   * Show only `selector`'s element: everything else is hidden (but keeps its
   * layout, so the element renders exactly as it does in the page), and the
   * page background turns transparent. Returns where the element is and the
   * background it was on.
   */
  isolate(selector: string): { rect: Rect; background: string } | null;
  /** Where the isolated element is now (it moves and resizes with edits). */
  isolatedRect(): Rect | null;
  /** Force a pseudo-class state on an element: hover, active, focus-visible. */
  force(selector: string, state: ForcedState): void;
  /** Report inline-style changes on the page (Pilot's edits), by DOM path. */
  onStyleChange(callback: (path: number[], style: string) => void): () => void;
  /** Mirror an inline style from another frame of the same page. */
  applyStyle(path: number[], style: string): void;
}

export type ForcedState = "hover" | "active" | "focus-visible";
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function installFrameBridge(): void {
  document.documentElement.dataset.pilotFrame = "";
  let pilot: PilotInstance | null = null;
  let isolated: Element | null = null;
  const forced = new Set<ForcedState>();

  const rectOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  };

  const bridge: FrameBridge = {
    enter() {
      pilot ??= mountPilot();
      pilot.launch();
    },
    exit() {
      pilot?.destroy();
      pilot = null;
    },
    onSize(callback) {
      const report = () =>
        callback({ width: document.documentElement.clientWidth, height: Math.ceil(document.body.scrollHeight) });
      const observer = new ResizeObserver(report);
      observer.observe(document.body);
      if (isolated) observer.observe(isolated);
      report();
      return () => observer.disconnect();
    },
    links() {
      return [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
        .filter((a) => !a.getAttribute("href")?.startsWith("#"))
        .map((a) => ({ href: a.href, rect: rectOf(a) }));
    },
    isolate(selector) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const background = getComputedStyle(document.body).backgroundColor;
      isolated = el;
      el.setAttribute("data-pilot-isolate", "");
      const style = document.createElement("style");
      style.textContent = `
        html, body { background: transparent !important; }
        body * { visibility: hidden; }
        [data-pilot-isolate], [data-pilot-isolate] * { visibility: visible; }
      `;
      document.head.append(style);
      return { rect: rectOf(el), background };
    },
    isolatedRect: () => (isolated ? rectOf(isolated) : null),
    force(selector, state) {
      const el = document.querySelector(selector);
      if (!el) return;
      if (!forced.has(state)) {
        forced.add(state);
        for (const sheet of document.styleSheets) duplicateStateRules(sheet, state);
      }
      el.setAttribute(`data-force-${state}`, "");
    },
    onStyleChange(callback) {
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const el = record.target as Element;
          callback(pathOf(el), el.getAttribute("style") ?? "");
        }
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ["style"], subtree: true });
      return () => observer.disconnect();
    },
    applyStyle(path, style) {
      const el = elementAt(path);
      if (!el) return;
      if (style) el.setAttribute("style", style);
      else el.removeAttribute("style");
    },
  };
  (window as WindowWithBridge).__pilotFrame = bridge;
}

export type WindowWithBridge = Window & { __pilotFrame?: FrameBridge };

/**
 * Pseudo-classes can't be turned on from script. Copy every rule that uses
 * `:state` into one that uses `[data-force-state]` instead, right after the
 * original (so it wins the same way), inside the same @media/@layer.
 */
function duplicateStateRules(container: CSSStyleSheet | CSSGroupingRule, state: ForcedState): void {
  let rules: CSSRuleList;
  try {
    rules = container.cssRules;
  } catch {
    return; // cross-origin sheet
  }
  const pseudo = `:${state}`;
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if (rule instanceof CSSStyleRule) {
      if (!rule.selectorText.includes(pseudo)) continue;
      const selector = rule.selectorText.replaceAll(pseudo, `[data-force-${state}]`);
      try {
        container.insertRule(`${selector} { ${rule.style.cssText} }`, i + 1);
      } catch {
        // A selector that doesn't survive the rewrite: skip it.
      }
    } else if (rule instanceof CSSGroupingRule) {
      duplicateStateRules(rule, state);
    }
  }
}

/** An element's position as child indices from <body>: the same element in another frame of the page. */
function pathOf(el: Element): number[] {
  const path: number[] = [];
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    path.unshift(node.parentElement ? [...node.parentElement.children].indexOf(node) : 0);
  }
  return path;
}

function elementAt(path: number[]): Element | null {
  let node: Element | undefined = document.body;
  for (const index of path) node = node?.children[index];
  return node ?? null;
}
