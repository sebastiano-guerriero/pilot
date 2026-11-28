import type { ElementState, WidthRange } from "@pilot/protocol";
import { baseValue, conditionValue, rangeValue, splitTopLevel } from "./declared.ts";

/**
 * A cleared field, in the page's CSS: "this element doesn't declare the
 * property here", for exactly that field's pills (the base, a breakpoint, a
 * state), and nothing else overridden (the owner's call, 2026-11-26). CSS
 * can't skip one declaration, and a value put in its place (what applies
 * without it) would be wrong wherever that differs by another modifier
 * (hovered at 1300px, the base's value over the project's `md:` one). So
 * the project's rule stops applying to this element, and a copy of it for
 * this element only, without the cleared properties, takes its place:
 *
 *     .btn:hover:not([data-pilot-skip~="r2"]) { background: …; color: …; }
 *     :is(.btn:hover):where([data-pilot-edit="5"]) { color: …; }
 *
 * The skip clause goes on each selector of the rule's list (same
 * specificity), the element carries the rule's token, and the copy sits
 * right after the rule, at its specificity: the cascade then does what the
 * code will, at every width and in every state. Other elements the rule
 * matches are untouched. In the browser's copy of the stylesheet only
 * (CSSOM), never the project's files; the rule's selector is put back when
 * no element skips it anymore. Reading the page's CSS leaves the skip clause
 * out (dom/declared.ts), so fields and the change set still see the
 * project's rule as written. Pilot's other changes for the element that
 * would sit beside the rule go into the copy (`copyFor`).
 */

export const SKIP_ATTRIBUTE = "data-pilot-skip";

/** What to show: a property the element shouldn't declare for these pills, with its preview id. */
export interface ExclusionRequest {
  element: Element;
  property: string;
  id: number;
  widths?: WidthRange;
  states?: ElementState[];
  /** A condition's CSS: the project's rule for it is the one skipped (dom/declared.ts conditionValue). */
  condition?: { selector?: string; media?: string; container?: string };
}

/** One element skipping one of the project's rules, and its copy. */
interface Exclusion {
  rule: CSSStyleRule;
  token: string;
  element: Element;
  id: number;
  /** The properties left out of the copy. */
  properties: string[];
  copy: CSSStyleRule;
}

const exclusions = new Map<string, Exclusion>();
/** The project's rules as written, before a skip clause (to put them back). */
const originals = new WeakMap<CSSStyleRule, string>();
const tokens = new WeakMap<CSSStyleRule, string>();
let nextToken = 1;

const tokenOf = (rule: CSSStyleRule) => {
  let token = tokens.get(rule);
  if (!token) tokens.set(rule, (token = `r${nextToken++}`));
  return token;
};
const skipClause = (token: string) => `:not([${SKIP_ATTRIBUTE}~="${token}"])`;

/** A selector without Pilot's skip clauses: the project's as written. */
export function withoutSkips(selector: string): string {
  return selector.includes(SKIP_ATTRIBUTE) ? selector.replace(/:not\(\[data-pilot-skip~="[^"]*"\]\)/g, "") : selector;
}

/**
 * Show `requests` in the page's CSS, and put back what's no longer asked
 * for. With `check`, each one is looked at again (its stylesheet replaced by
 * a hot reload, its declaration no longer the project's rule for those
 * pills). Returns the requests it couldn't show (the property in the
 * element's style attribute, a rule for a pseudo-element, or nothing of the
 * page's for those pills), and whether anything changed (Pilot's changes
 * placed beside a rule now skipped then move into its copy).
 */
export function renderExclusions(requests: ExclusionRequest[], check: boolean): { left: ExclusionRequest[]; changed: boolean } {
  const left: ExclusionRequest[] = [];
  // What's asked for: per element and rule, the properties to leave out.
  const wanted = new Map<string, { rule: CSSStyleRule; element: Element; id: number; properties: Set<string> }>();
  for (const request of requests) {
    const rule = ruleFor(request);
    if (!rule) {
      left.push(request);
      continue;
    }
    const key = `${tokenOf(rule)}|${request.id}`;
    const entry = wanted.get(key) ?? { rule, element: request.element, id: request.id, properties: new Set<string>() };
    entry.properties.add(request.property);
    wanted.set(key, entry);
  }
  let changed = false;
  for (const [key, exclusion] of exclusions) {
    const want = wanted.get(key);
    const same = want && want.element === exclusion.element && sameList([...want.properties], exclusion.properties) && live(exclusion.rule) && live(exclusion.copy);
    if (same && !check) continue;
    if (same && check && ruleStillHolds(exclusion)) continue;
    undo(exclusion);
    exclusions.delete(key);
    changed = true;
  }
  for (const [key, want] of wanted) {
    if (exclusions.has(key)) continue;
    const exclusion = apply(want.rule, want.element, want.id, [...want.properties]);
    if (exclusion) {
      exclusions.set(key, exclusion);
      changed = true;
    } else for (const request of requests) if (ruleFor(request) === want.rule && request.element === want.element) left.push(request);
  }
  return { left, changed };
}

/** The project's rule an element skips is the one holding `declarations`: their counterpart in its copy for that element, else null. */
export function copyFor(declarations: CSSStyleDeclaration, element: Element): CSSStyleDeclaration | null {
  const rule = styleRuleOf(declarations);
  if (!rule) return null;
  const token = tokens.get(rule);
  if (!token) return null;
  for (const exclusion of exclusions.values()) {
    if (exclusion.rule !== rule || exclusion.element !== element) continue;
    return counterpart(rule, exclusion.copy, declarations);
  }
  return null;
}

/** The project's declaration for exactly the request's pills: the rule holding it, when Pilot can skip it. */
function ruleFor(request: ExclusionRequest): CSSStyleRule | null {
  const declared = request.condition
    ? conditionValue(request.element, request.property, { words: "", ...request.condition }, request.states ?? [], request.widths)
    : request.widths
    ? rangeValue(request.element, request.property, request.widths, request.states)
    : baseValue(request.element, request.property, request.states);
  if (!declared?.rule || declared.source === "inline") return null;
  const rule = styleRuleOf(declared.rule);
  // A pseudo-element's rule (`::before`): a clause after it wouldn't parse.
  return rule && !withoutSkips(rule.selectorText).includes("::") ? rule : null;
}

/** Whether the skipped rule is still the project's rule for its pills (a hot reload replaced it, or the element's classes changed). */
function ruleStillHolds(exclusion: Exclusion): boolean {
  return live(exclusion.rule) && exclusion.element.isConnected;
}

/** The style rule that holds `declarations` (its own, or a block nested in it, inside a nested `@media`). */
function styleRuleOf(declarations: CSSStyleDeclaration): CSSStyleRule | null {
  let rule = declarations.parentRule as (CSSRule & { selectorText?: string }) | null;
  while (rule && rule.selectorText === undefined) rule = rule.parentRule as typeof rule;
  return (rule as CSSStyleRule | null) ?? null;
}

function apply(rule: CSSStyleRule, element: Element, id: number, properties: string[]): Exclusion | null {
  const token = tokenOf(rule);
  const original = originals.get(rule) ?? rule.selectorText;
  // The copy first, from the rule as the project wrote it.
  const container = containerOf(rule);
  if (!container) return null;
  const copy = insertCopy(container, rule, original, id, properties);
  if (!copy) return null;
  if (!originals.has(rule)) originals.set(rule, original);
  const skipped = splitTopLevel(original, ",")
    .map((s) => `${s}${skipClause(token)}`)
    .join(", ");
  if (rule.selectorText !== skipped) {
    try {
      rule.selectorText = skipped;
    } catch {
      // Selectors that can't be changed (a DOM without it): nothing to skip with.
    }
    // The browser refused it (a selector it reads differently): nothing to skip with.
    if (!rule.selectorText.includes(token)) {
      remove(copy);
      return null;
    }
  }
  const list = new Set((element.getAttribute(SKIP_ATTRIBUTE) ?? "").split(/\s+/).filter(Boolean));
  list.add(token);
  element.setAttribute(SKIP_ATTRIBUTE, [...list].join(" "));
  return { rule, token, element, id, properties, copy };
}

function undo(exclusion: Exclusion) {
  remove(exclusion.copy);
  const { element, token, rule } = exclusion;
  const list = (element.getAttribute(SKIP_ATTRIBUTE) ?? "").split(/\s+/).filter((t) => t && t !== token);
  if (list.length) element.setAttribute(SKIP_ATTRIBUTE, list.join(" "));
  else element.removeAttribute(SKIP_ATTRIBUTE);
  // No element skips the rule anymore: the project's selector, as written.
  const stillUsed = [...exclusions.values()].some((e) => e !== exclusion && e.rule === rule);
  const original = originals.get(rule);
  if (!stillUsed && original !== undefined) {
    try {
      if (live(rule)) rule.selectorText = original;
    } catch {
      // Gone meanwhile.
    }
    originals.delete(rule);
  }
}

/**
 * The rule, for one element only, right after it: its text with the
 * selector `:is(…):where([data-pilot-edit="id"])` (the same specificity),
 * without Pilot's rules nested in it and without the cleared properties.
 */
function insertCopy(container: Container, rule: CSSStyleRule, original: string, id: number, properties: string[]): CSSStyleRule | null {
  const text = rule.cssText;
  const open = text.indexOf("{");
  if (open < 0) return null;
  const copyText = `:is(${original}):where([data-pilot-edit="${id}"]) ${text.slice(open)}`;
  let copy: CSSStyleRule | null = null;
  try {
    const at = container.insertRule(copyText, indexIn(container, rule) + 1);
    copy = (container.cssRules[at] as CSSStyleRule | undefined) ?? null;
  } catch {
    return null;
  }
  if (!copy?.style) return null;
  stripPilot(copy);
  for (const block of blocksOf(copy)) for (const property of properties) block.removeProperty(property);
  return copy;
}

/** Pilot's own rules nested in a copy (they came with the rule's text): gone, they're placed again by the preview. */
function stripPilot(rule: CSSRule & { cssRules?: CSSRuleList; deleteRule?(i: number): void }) {
  const list = rule.cssRules;
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const child = list[i] as CSSRule & { selectorText?: string; cssRules?: CSSRuleList };
    if (child.selectorText?.includes("data-pilot-edit")) rule.deleteRule?.(i);
    else stripPilot(child);
  }
}

/** Every block of declarations in a rule: its own, and those nested in it (a nested `@media`'s). */
function blocksOf(rule: CSSRule & { style?: CSSStyleDeclaration; cssRules?: CSSRuleList; selectorText?: string }): CSSStyleDeclaration[] {
  const out: CSSStyleDeclaration[] = [];
  if (rule.style) out.push(rule.style);
  for (const child of Array.from(rule.cssRules ?? [])) {
    const c = child as CSSRule & { selectorText?: string };
    // A nested style rule is a selector of its own (`&:hover`): its declarations aren't the rule's.
    if (c.selectorText === undefined) out.push(...blocksOf(c));
  }
  return out;
}

/** The block in `copy` at the same place as `declarations` in `rule` (counting the project's nested rules only, not Pilot's). */
function counterpart(rule: CSSStyleRule, copy: CSSStyleRule, declarations: CSSStyleDeclaration): CSSStyleDeclaration | null {
  if (declarations === rule.style) return copy.style;
  const path: number[] = [];
  let node: CSSRule | null = declarations.parentRule;
  while (node && node !== rule) {
    const parent = node.parentRule;
    if (!parent) return null;
    const siblings = Array.from((parent as CSSRule & { cssRules: CSSRuleList }).cssRules).filter((r) => !(r as CSSStyleRule).selectorText?.includes("data-pilot-edit"));
    path.unshift(siblings.indexOf(node));
    node = parent;
  }
  let target: CSSRule = copy;
  for (const index of path) {
    const next = Array.from((target as CSSRule & { cssRules?: CSSRuleList }).cssRules ?? [])[index];
    if (!next) return null;
    target = next;
  }
  return (target as CSSRule & { style?: CSSStyleDeclaration }).style ?? null;
}

type Container = { cssRules: CSSRuleList; insertRule(text: string, index?: number): number; deleteRule(index: number): void };
const containerOf = (rule: CSSRule): Container | null => (rule.parentRule as unknown as Container | null) ?? (rule.parentStyleSheet as unknown as Container | null);
const indexIn = (container: Container, rule: CSSRule) => Array.from(container.cssRules).indexOf(rule);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function live(rule: CSSRule): boolean {
  const sheet = rule.parentStyleSheet;
  if (!sheet) return false;
  const owner = sheet.ownerNode as (Node & { sheet?: CSSStyleSheet | null }) | null;
  if (owner && (!owner.isConnected || owner.sheet !== sheet)) return false;
  const container = containerOf(rule);
  return !!container && indexIn(container, rule) >= 0;
}

function remove(rule: CSSRule) {
  const container = containerOf(rule);
  if (!container) return;
  const index = indexIn(container, rule);
  if (index < 0) return;
  try {
    container.deleteRule(index);
  } catch {
    // Its sheet went away meanwhile.
  }
}
