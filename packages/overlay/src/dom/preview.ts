import type { ElementState } from "@pilot/protocol";
import { stateSelector } from "../edits/states.ts";
import type { WidthRange } from "@pilot/protocol";
import { type AnchorRequest, anchoredElements, renderAnchored } from "./anchored.ts";
import { type ExclusionRequest, renderExclusions } from "./excluded.ts";
import { schemeOf, schemeParts } from "./scheme.ts";

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
 * A change with no widths and no states is the element's base value, and is
 * shown beside the page's own declaration instead, in the page's stylesheet,
 * so the project's breakpoint, state and condition rules still win where
 * they apply (dom/anchored.ts). What follows is the rest: changes for some
 * widths or states, removals, and base values the element declares nowhere.
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
  /**
   * A condition described in words (edits/condition.ts): the rule applies only while it holds. Always in Pilot's
   * layer: beside the page's rule for the element as it is, it would apply all the time.
   */
  condition?: { selector?: string; media?: string };
  /** A cleared field the page's CSS declares (EditHistory's removal): `value` is only what shows without it, the layer's fallback. */
  removal?: unknown;
}

/** Where EditHistory shows its changes. Given every rule in effect, in order, each time. */
export interface Preview {
  render(rules: PreviewRule[]): void;
}

const ids = new WeakMap<Element, number>();
let nextId = 1;
/** Elements carrying EDIT_ATTRIBUTE now, to take it off when they have no rules left. */
const marked = new Set<Element>();

/** The stylesheet preview. One per page: every EditHistory shares the same sheets. */
export const stylesheetPreview: Preview = {
  render(rules) {
    last = rules;
    draw(rules, false);
  },
};

/** What was last shown, to show again when the page's stylesheets or an element's classes change. */
let last: PreviewRule[] = [];

/** A value shown in the page's own CSS (dom/anchored.ts): all but removals (dom/excluded.ts) and `revert-layer` (only meaningful in Pilot's layer). */
const isPlaced = (rule: PreviewRule) => !rule.removal && rule.value !== "revert-layer" && !rule.condition;

function draw(rules: PreviewRule[], check: boolean) {
    const byRoot = new Map<Document | ShadowRoot, string[]>();
    const used = new Set<Element>();
    // Base changes beside the page's declarations; those with nothing to sit beside stay in the layer below.
    const requests: Array<AnchorRequest & { rule: PreviewRule }> = [];
    for (const rule of rules) {
      if (!isPlaced(rule) || !rule.element.isConnected) continue;
      const text = plainDeclaration(rule.property, rule.value);
      if (text)
        requests.push({ element: rule.element, property: rule.property, text, id: idOf(rule.element), widths: rule.widths, states: rule.states, rule });
    }
    // Cleared fields the page's CSS declares: its rule skips the element, a copy keeps the rest (dom/excluded.ts).
    const removals: Array<ExclusionRequest & { rule: PreviewRule }> = rules
      .filter((r) => r.removal && !r.condition && r.element.isConnected)
      .map((rule) => ({ element: rule.element, property: rule.property, id: idOf(rule.element), widths: rule.widths, states: rule.states, rule }));
    const excluded = renderExclusions(removals, check);
    const notExcluded = new Set(excluded.left);
    for (const r of removals) if (!notExcluded.has(r)) used.add(r.element);
    // Pilot's values beside the page's rules; placed again when exclusions changed (beside a skipped rule, they go in its copy).
    const left = new Set(renderAnchored(requests, check || excluded.changed));
    const anchored = new Set([...requests.filter((r) => !left.has(r)).map((r) => r.rule), ...removals.filter((r) => !notExcluded.has(r)).map((r) => r.rule)]);
    for (const rule of anchored) used.add(rule.element);
    watch(anchored.size > 0);
    const add = (element: Element, text: string, widths?: WidthRange, states?: ElementState[], condition?: PreviewRule["condition"]) => {
      const root = element.getRootNode() as Document | ShadowRoot;
      if (!byRoot.has(root)) byRoot.set(root, []);
      // The scheme the project's way (dom/scheme.ts), the states and pseudo-element after the element. A condition's
      // selector around it (`.card:focus-within &`: the element in `&`'s place, its states after the whole, the
      // element being its subject), its media with the rest.
      const scheme = schemeParts(schemeOf(states));
      const subject = `[${EDIT_ATTRIBUTE}="${idOf(element)}"]`;
      const selector = `${condition?.selector ? condition.selector.replace(/&/g, subject) : subject}${scheme.selector}${stateSelector(states)}`;
      // A media type (`print`) first, as CSS wants it: `print and (min-width: 768px)`.
      const own = condition?.media ? wrapMedia(condition.media) : "";
      const isType = /^[a-z]+$/i.test(own);
      const media = [isType && own, widths && mediaQuery(widths), scheme.media, !isType && own].filter(Boolean).join(" and ");
      byRoot.get(root)?.push(media ? `@media ${media} { ${selector} { ${text} } }` : `${selector} { ${text} }`);
      used.add(element);
    };
    // A change for some states is a rule for those states (`:hover:active`),
    // more specific than the element's own, as the agent's will be.
    for (const rule of rules) {
      if (anchored.has(rule)) continue;
      const text = declaration(rule.property, rule.value);
      if (text) add(rule.element, text, rule.widths, rule.states, rule.condition);
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
      const before = written.get(style);
      if ((before?.text ?? style.textContent) === text) continue;
      // The same rules with other values (a drag, a field stepped): those rules' values, in place.
      if (!before || !updateValues(style, before.lines, lines)) style.textContent = text;
      written.set(style, { lines, text });
    }
}

/** A media condition to join others with ` and `: a media type (`print`) as it is, a feature in parentheses. */
function wrapMedia(media: string): string {
  const m = media.trim();
  return /^[a-z]+$/i.test(m) || m.startsWith("(") || /^not\s/i.test(m) ? m : `(${m})`;
}

/**
 * Base changes lean on the page's stylesheets and the elements' classes,
 * which change under them: a hot reload replaces a stylesheet (Pilot's rule
 * goes with it), a component restyled with other props gets another class.
 * While any is shown, both are watched, and the preview is drawn again,
 * checked, once a frame at most.
 */
let styles: MutationObserver | null = null;
let classes: MutationObserver | null = null;
let frame = 0;

function recheck() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw(last, true);
  });
}

function onLinkLoad(e: Event) {
  if (e.target instanceof HTMLLinkElement) recheck();
}

function watch(on: boolean) {
  if (typeof MutationObserver === "undefined" || typeof requestAnimationFrame === "undefined") return;
  if (!on) {
    styles?.disconnect();
    classes?.disconnect();
    styles = classes = null;
    document.removeEventListener("load", onLinkLoad, true);
    return;
  }
  if (!styles) {
    styles = new MutationObserver((records) => {
      if (records.some(isPageMutation)) recheck();
    });
    styles.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    document.addEventListener("load", onLinkLoad, true);
  }
  // The elements shown so: their classes (observed again each draw, as they change).
  classes?.disconnect();
  classes = new MutationObserver(recheck);
  for (const element of anchoredElements()) {
    classes.observe(element, { attributes: true, attributeFilter: ["class"] });
    // In a shadow root: its stylesheets live there.
    const root = element.getRootNode();
    if (root instanceof ShadowRoot) styles.observe(root, { childList: true, subtree: true, characterData: true });
  }
}

/**
 * A change in the head that's the page's, not Pilot's. Pilot's preview sheet
 * lives in the head too, and every check rewrites it: if those rewrites
 * counted, each check would trigger the next one, forever.
 */
export function isPageMutation(r: Pick<MutationRecord, "type" | "target" | "addedNodes" | "removedNodes">): boolean {
  const ours = (node: Node | null) => !!(node instanceof Element ? node : node?.parentElement)?.closest(`[${PREVIEW_ATTRIBUTE}]`);
  if (ours(r.target)) return false;
  return r.type !== "childList" || [...r.addedNodes, ...r.removedNodes].some((n) => !ours(n));
}

/** Each preview <style>'s rules as last written (its text, and each rule's line), since in-place updates leave its text behind. */
const written = new WeakMap<HTMLStyleElement, { lines: string[]; text: string }>();

/** The CSS Pilot's preview shows in a root, as written (its <style>'s text can lag behind, see updateValues). */
export function previewCss(root: Document | ShadowRoot = document): string {
  for (const style of sheets) if (style.isConnected && style.getRootNode() === root) return written.get(style)?.text ?? style.textContent ?? "";
  return "";
}

/** A rule's line split around its declarations: `[data-pilot-edit="1"] { ` · `padding-top: 24px !important;` · ` }`. */
const LINE = /^(.*\{ )([^{}]*)( \}(?: \})?)$/;

/**
 * The same rules as before, in the same order, some with other values: the
 * values go into the sheet's rules (CSSOM), and the browser restyles only the
 * elements those rules select. Rewriting the sheet's text made it reparse it
 * and restyle the whole page (a new sheet with a cascade layer): ~10ms a
 * change on a 600-element page, against ~0.3ms, so each frame of a drag (the
 * color picker's, a drag handle's) went past its budget. False when the rules
 * changed (added, removed, moved) or the sheet doesn't read as expected: the
 * caller rewrites it then.
 */
export function updateValues(style: Pick<HTMLStyleElement, "sheet">, before: string[], after: string[]): boolean {
  if (before.length !== after.length) return false;
  const layer = style.sheet?.cssRules[0] as (CSSRule & { cssRules?: CSSRuleList }) | undefined;
  if (!layer?.cssRules || layer.cssRules.length !== after.length) return false;
  const changes: Array<{ rule: CSSStyleRule; text: string }> = [];
  for (let i = 0; i < after.length; i++) {
    if (before[i] === after[i]) continue;
    const [was, now] = [before[i]?.match(LINE), after[i]?.match(LINE)];
    if (!was || !now || was[1] !== now[1] || was[3] !== now[3]) return false;
    let rule = layer.cssRules[i] as CSSRule & { cssRules?: CSSRuleList; style?: CSSStyleDeclaration };
    // Inside @media. (Not by `cssRules`: a style rule has one too in browsers with CSS nesting, empty.)
    if (!rule.style && rule.cssRules) rule = rule.cssRules[0] as typeof rule;
    if (!rule?.style) return false;
    changes.push({ rule: rule as CSSStyleRule, text: now[2] as string });
  }
  for (const { rule, text } of changes) rule.style.cssText = text;
  return true;
}

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

/** `padding-top: 24px;`, without `!important` (a base change beside the page's CSS), or "". */
function plainDeclaration(property: string, value: string): string {
  const style = document.createElement("div").style;
  style.setProperty(property, value);
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
