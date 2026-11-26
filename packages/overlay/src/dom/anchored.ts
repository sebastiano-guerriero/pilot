import { baseValue } from "./declared.ts";

/**
 * Base edits shown beside the page's own CSS (the owner's call, 2026-11-26):
 * an edit made without the width chip or a state pill changes the element's
 * base value, the one it declares without a media query or a state, and the
 * project's breakpoint, state and condition rules keep winning where they
 * apply, as they will once the agent changes the code. So Pilot doesn't
 * override them (its layer's `!important`): it puts its value right after
 * the declaration it replaces, in the page's own stylesheet, for this element
 * only, and the browser's cascade does the rest.
 *
 *     .pt-4 { padding-top: 1rem; &:where([data-pilot-edit="3"]) { padding-top: 20px; } }
 *
 * Nested in the rule (`&`: its selector and specificity), right after its
 * declarations, so whatever came after it (`.md\:pt-3`, a nested `@media`, a
 * `:hover` rule) still comes after it. Where a rule can't hold nested rules,
 * the same right after the rule, with its selector spelled out:
 * `:is(.pt-4):where([data-pilot-edit="3"])`. The browser's in-memory copy of
 * the stylesheet only (CSSOM), never the project's files. A property the
 * element declares nowhere (or only in its style attribute) has nothing to
 * sit beside: the caller shows it in its own layer, as before.
 *
 * The page can drop or move what Pilot leaned on: a hot reload replaces a
 * stylesheet (Pilot's rule goes with the old one), and a component restyled
 * with other props gets another class (CSS-in-JS). `check` looks for both,
 * and puts the rule back beside the base declaration found again.
 */

/** One base edit shown beside its declaration. */
interface Anchored {
  element: Element;
  property: string;
  /** The declaration, as written: `padding-top: 20px;`. */
  text: string;
  /** The page's declarations it sits after. */
  anchor: CSSStyleDeclaration;
  /** The rule's selector that matched the element (nesting resolved): it must still match. */
  selector: string;
  rule: CSSStyleRule;
}

/** What to show: one base edit, with the element's preview id. */
export interface AnchorRequest {
  element: Element;
  property: string;
  text: string;
  id: number;
}

const shown = new Map<string, Anchored>();

const keyOf = (r: { element: Element; property: string }, id: number) => `${id}|${r.property}`;

/** The elements with a base edit shown beside the page's CSS now (their classes are watched). */
export function anchoredElements(): Element[] {
  return [...new Set([...shown.values()].map((a) => a.element))];
}

/**
 * Show `requests` beside the page's declarations, in order, and take away
 * those not asked for anymore. With `check`, each one already shown is looked
 * at again (its stylesheet replaced, its declaration no longer the base, its
 * selector no longer matching) and put back where it belongs. Returns the
 * requests it couldn't place: nothing to sit beside.
 */
export function renderAnchored(requests: AnchorRequest[], check: boolean): AnchorRequest[] {
  const wanted = new Set(requests.map((r) => keyOf(r, r.id)));
  for (const [key, entry] of shown) {
    if (wanted.has(key)) continue;
    remove(entry);
    shown.delete(key);
  }
  const left: AnchorRequest[] = [];
  // Several edits beside the same declarations (padding, then padding-top): in the order they were made.
  const lastBeside = new Map<CSSStyleDeclaration, CSSStyleRule>();
  for (const request of requests) {
    const key = keyOf(request, request.id);
    const entry = shown.get(key);
    if (entry && live(entry.rule) && entry.element === request.element) {
      const still = !check || (sameBase(entry) && matches(entry.element, entry.selector));
      if (still) {
        if (entry.text !== request.text) {
          entry.rule.style.cssText = request.text;
          entry.text = request.text;
        }
        lastBeside.set(entry.anchor, entry.rule);
        continue;
      }
    }
    if (entry) {
      remove(entry);
      shown.delete(key);
    }
    const base = baseValue(request.element, request.property);
    if (!base?.rule || base.source === "inline") {
      left.push(request);
      continue;
    }
    const rule = place({ rule: base.rule, selector: base.source.selector }, request, lastBeside.get(base.rule));
    if (!rule) {
      left.push(request);
      continue;
    }
    lastBeside.set(base.rule, rule);
    shown.set(key, { element: request.element, property: request.property, text: request.text, anchor: base.rule, selector: base.source.selector, rule });
  }
  return left;
}

/** Whether the declaration it sits beside is still the element's base for its property. */
function sameBase(entry: Anchored): boolean {
  return baseValue(entry.element, entry.property)?.rule === entry.anchor;
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

type Container = { cssRules: CSSRuleList; insertRule(text: string, index?: number): number; deleteRule(index: number): void };
type RuleLike = CSSRule & { cssRules?: CSSRuleList; insertRule?: Container["insertRule"]; selectorText?: string; style?: CSSStyleDeclaration };

const containerOf = (rule: CSSRule): Container | null => (rule.parentRule as unknown as Container | null) ?? (rule.parentStyleSheet as unknown as Container | null);
const indexIn = (container: Container, rule: CSSRule) => Array.from(container.cssRules).indexOf(rule);

/** Whether a rule Pilot inserted is still in a stylesheet the page uses. */
function live(rule: CSSStyleRule): boolean {
  const sheet = rule.parentStyleSheet;
  if (!sheet) return false;
  const owner = sheet.ownerNode as (Node & { sheet?: CSSStyleSheet | null }) | null;
  // A <style> or <link>: still on the page, and still holding this sheet (a hot reload makes a new one).
  if (owner && (!owner.isConnected || owner.sheet !== sheet)) return false;
  const container = containerOf(rule);
  return !!container && indexIn(container, rule) >= 0;
}

function remove(entry: Anchored) {
  const container = containerOf(entry.rule);
  if (!container) return;
  const index = indexIn(container, entry.rule);
  if (index < 0) return;
  try {
    container.deleteRule(index);
  } catch {
    // Its sheet went away meanwhile.
  }
}

/**
 * Insert the request's rule right after `base`'s declarations (or after
 * `after`, an earlier edit beside them): nested in the rule they belong to,
 * else right after that rule at the top level. Null when the page's
 * stylesheet can't take it (not readable, or the browser refuses).
 */
function place(base: { rule: CSSStyleDeclaration; selector: string }, request: AnchorRequest, after?: CSSStyleRule): CSSStyleRule | null {
  const where = `[data-pilot-edit="${request.id}"]`;
  const nested = `&:where(${where}) { ${request.text} }`;
  // After an earlier edit beside the same declarations: as it was placed.
  if (after) {
    const container = containerOf(after);
    if (!container) return null;
    const text = after.selectorText.startsWith("&") ? nested : `:is(${base.selector}):where(${where}) { ${request.text} }`;
    return insert(container, text, indexIn(container, after) + 1);
  }
  const owner = base.rule.parentRule as RuleLike | null;
  if (!owner) return null;
  // The rule's own declarations: first among its nested rules. A block of declarations after some (CSSNestedDeclarations): right after it.
  const styleRule = owner.selectorText !== undefined ? owner : (owner.parentRule as RuleLike | null);
  if (styleRule?.selectorText !== undefined && typeof styleRule.insertRule === "function") {
    const index = owner === styleRule ? 0 : indexIn(styleRule as unknown as Container, owner) + 1;
    const rule = insert(styleRule as unknown as Container, nested, index);
    if (rule) return rule;
  }
  // No nesting: right after the outermost style rule, with the selector spelled out.
  let outer: RuleLike | null = styleRule;
  while (outer?.parentRule && (outer.parentRule as RuleLike).selectorText !== undefined) outer = outer.parentRule as RuleLike;
  if (!outer) return null;
  const container = containerOf(outer);
  if (!container) return null;
  return insert(container, `:is(${base.selector}):where(${where}) { ${request.text} }`, indexIn(container, outer) + 1);
}

function insert(container: Container, text: string, index: number): CSSStyleRule | null {
  try {
    const at = container.insertRule(text, index);
    const rule = container.cssRules[at] as CSSStyleRule | undefined;
    return rule?.style ? rule : null;
  } catch {
    return null;
  }
}
