import type { ElementState } from "@pilot/protocol";
import { stateSelector } from "../edits/states.ts";
import type { WidthRange } from "@pilot/protocol";

/**
 * How Pilot shows its edits on the page: as rules in a stylesheet it adds,
 * never by touching the elements' own `style`. Each edited element gets a
 * `data-pilot-edit` id, and each change becomes a rule for it, inside
 * `@media` when it's for some widths only, so resizing the window shows each
 * range's changes in their range and the page's own CSS everywhere else.
 *
 *     @layer pilot-preview {
 *       [data-pilot-edit="1"] { padding-top: 24px !important; }
 *       @media (min-width: 1200px) { [data-pilot-edit="1"] { padding-top: 40px !important; } }
 *     }
 *
 * Every declaration is `!important` in a layer declared before any of the
 * page's (the <style> is the first in its root), and important declarations
 * in the first layer beat every other stylesheet's, layered or not. So a rule
 * wins over the page's CSS like an inline style did. The one thing it can't
 * beat is the app's own `style` attribute with `!important`. Among Pilot's
 * rules, the later one wins: they're written in the order the changes were made.
 *
 * Values are checked and written by the browser (a scratch style
 * declaration), so a value it doesn't accept is left out, like an inline
 * value would be. Elements in a shadow root get a sheet in that root.
 */

/** Marks Pilot's <style> elements, so reading the page's CSS can leave them out (declared.ts). */
export const PREVIEW_ATTRIBUTE = "data-pilot-preview";
/** The id each edited element gets, which its rules select. */
export const EDIT_ATTRIBUTE = "data-pilot-edit";
const LAYER = "pilot-preview";

/** One declaration to show: on `element`, for `widths` (none: every width) and `states` (none: as it is). */
export interface PreviewRule {
  element: Element;
  property: string;
  value: string;
  widths?: WidthRange;
  states?: ElementState[];
}

/**
 * An element shown in some states while the designer edits them (state
 * pills set): the page's own declarations for those states (`page`, see
 * forcedDeclarations), and Pilot's changes for them, apply without the
 * pointer or focus being there, like the browser's "force state".
 */
export interface Forced {
  element: Element;
  states: ElementState[];
  page: Array<{ property: string; value: string }>;
}

/** Where EditHistory shows its changes. Given every rule in effect, in order, each time. */
export interface Preview {
  render(rules: PreviewRule[], forced?: Forced | null): void;
}

const ids = new WeakMap<Element, number>();
let nextId = 1;
/** Elements carrying EDIT_ATTRIBUTE now, to take it off when they have no rules left. */
const marked = new Set<Element>();

/** The stylesheet preview. One per page: every EditHistory shares the same sheets. */
export const stylesheetPreview: Preview = {
  render(rules, forced) {
    const byRoot = new Map<Document | ShadowRoot, string[]>();
    const used = new Set<Element>();
    const add = (element: Element, text: string, widths?: WidthRange, states = "") => {
      const root = element.getRootNode() as Document | ShadowRoot;
      if (!byRoot.has(root)) byRoot.set(root, []);
      const selector = `[${EDIT_ATTRIBUTE}="${idOf(element)}"]${states}`;
      const media = widths && mediaQuery(widths);
      byRoot.get(root)?.push(media ? `@media ${media} { ${selector} { ${text} } }` : `${selector} { ${text} }`);
      used.add(element);
    };
    // A change for some states is a rule for those states (`:hover:active`),
    // more specific than the element's own, as the agent's will be.
    for (const rule of rules) {
      const text = declaration(rule.property, rule.value);
      if (text) add(rule.element, text, rule.widths, stateSelector(rule.states));
    }
    // Forced states, last so they win: the page's own declarations for the
    // states, then Pilot's changes for any of them (fewer states first, as
    // their selectors are less specific), without the pseudo-classes.
    if (forced) {
      for (const { property, value } of forced.page) {
        const text = declaration(property, value);
        if (text) add(forced.element, text);
      }
      const inStates = rules
        .filter((r) => r.element === forced.element && r.states?.length && r.states.every((s) => forced.states.includes(s)))
        .sort((a, b) => (a.states?.length ?? 0) - (b.states?.length ?? 0));
      for (const rule of inStates) {
        const text = declaration(rule.property, rule.value);
        if (text) add(rule.element, text, rule.widths);
      }
    }
    for (const element of used) {
      element.setAttribute(EDIT_ATTRIBUTE, String(idOf(element)));
      marked.add(element);
    }
    for (const element of marked) {
      if (used.has(element)) continue;
      element.removeAttribute(EDIT_ATTRIBUTE);
      marked.delete(element);
    }
    // Every root that has (or had) a sheet: rewritten, emptied when it has no rules left.
    const roots = new Set(byRoot.keys());
    for (const style of sheets) roots.add(style.getRootNode() as Document | ShadowRoot);
    for (const root of roots) {
      const lines = byRoot.get(root) ?? [];
      const style = sheetFor(root);
      const text = lines.length ? `@layer ${LAYER} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n` : "";
      if (style.textContent !== text) style.textContent = text;
    }
  },
};

/** The media query for a width range, both ends included: `(min-width: 768px) and (max-width: 1199px)`. */
export function mediaQuery({ min, max }: WidthRange): string | undefined {
  const parts = [min !== undefined && `(min-width: ${min}px)`, max !== undefined && `(max-width: ${max}px)`];
  const query = parts.filter(Boolean).join(" and ");
  return query || undefined;
}

/** `padding-top: 24px !important;` as the browser writes it, or "" when it doesn't take the value. */
function declaration(property: string, value: string): string {
  const style = document.createElement("div").style;
  style.setProperty(property, value, "important");
  return style.cssText.trim();
}

function idOf(element: Element): number {
  let id = ids.get(element);
  if (id === undefined) ids.set(element, (id = nextId++));
  return id;
}

/** Pilot's <style> elements, one per root. */
const sheets = new Set<HTMLStyleElement>();

/** The root's preview <style>, made first in it (before the page's sheets) if it isn't there. */
function sheetFor(root: Document | ShadowRoot): HTMLStyleElement {
  for (const style of sheets) {
    if (style.isConnected && style.getRootNode() === root) {
      ensureFirst(root, style);
      return style;
    }
  }
  const style = document.createElement("style");
  style.setAttribute(PREVIEW_ATTRIBUTE, "");
  sheets.add(style);
  ensureFirst(root, style);
  return style;
}

/** First in the document's head (or the shadow root), so its layer comes before the page's. */
function ensureFirst(root: Document | ShadowRoot, style: HTMLStyleElement) {
  // nodeType, not instanceof: a document from another realm (an iframe, tests) isn't a `Document` here.
  const parent = root.nodeType === Node.DOCUMENT_NODE ? ((root as Document).head ?? (root as Document).documentElement) : root;
  if (parent.firstChild !== style) parent.prepend(style);
}

/** Whether a stylesheet is one of Pilot's preview sheets. */
export function isPreviewSheet(sheet: CSSStyleSheet): boolean {
  const owner = sheet.ownerNode;
  return owner instanceof Element && owner.hasAttribute(PREVIEW_ATTRIBUTE);
}

/** The id of select mode's <style> (the crosshair cursor, select/useElementPicker.ts). */
export const SELECT_CURSOR_STYLE_ID = "pilot-select-cursor";

/**
 * Whether a stylesheet is Pilot's own: a preview sheet, or select mode's
 * cursor (`cursor: crosshair !important` on everything, which the cursor
 * field would otherwise show as the page's).
 */
export function isPilotSheet(sheet: CSSStyleSheet): boolean {
  const owner = sheet.ownerNode;
  return isPreviewSheet(sheet) || (owner instanceof Element && owner.id === SELECT_CURSOR_STYLE_ID);
}
