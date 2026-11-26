import { type ElementState, type WidthRange, isPseudoElement } from "@pilot/protocol";
import { stateSelector } from "../edits/states.ts";
import { mediaRange } from "./breakpoints.ts";
import { type Placed, baseValue, beats, declarationsOf, subjectStates } from "./declared.ts";
import { copyFor } from "./excluded.ts";
import { schemeOf, schemeParts } from "./scheme.ts";

/**
 * Pilot's changes shown in the page's own CSS (the owner's call, 2026-11-26):
 * not over it, in a layer of `!important` rules that beat every rule of the
 * project's, but among its rules, where the agent will write them, so the
 * browser's cascade shows what the code will. Pilot builds on what's there.
 *
 * - **Beside the project's own rule** for the same widths and states, when
 *   it has one: the base value (`pt-4`, no media query, no state), its
 *   `md:pt-3` for "from 768px", its `:hover` rule for hover. Nested in that
 *   rule (`&`: its selector and specificity), right after its declarations,
 *   so whatever came after it still does (`.md\:pt-3` after `.pt-4`, focus
 *   after hover):
 *
 *       .pt-4 { padding-top: 1rem; &:where([data-pilot-edit="3"]) { padding-top: 20px; } }
 *
 * - **A rule of its own** otherwise (a breakpoint or a state the project has
 *   no rule for here), placed where the project's would go: a "from" width
 *   after the project's smaller "from" breakpoints for the property and
 *   before its larger ones (mobile first), a "to" width after the larger
 *   "to" ones (desktop first), a range after every rule overlapping it (it's
 *   meant to win in it), a state right after the element's base rule (the
 *   project's other states, later, still win when they apply):
 *
 *       @media (min-width: 900px) { :is(.card):where([data-pilot-edit="3"]) { padding: 24px; } }
 *       :is(.btn):where([data-pilot-edit="3"]):hover { background: red; }
 *
 * The browser's in-memory copy of the stylesheet only (CSSOM), never the
 * project's files. A property the element declares nowhere (or only in its
 * style attribute), and a removal for a state (`revert-layer`, which only
 * means something in Pilot's layer), have nothing to sit among: the caller
 * shows them in its layer, as before.
 *
 * The page can drop or move what Pilot leaned on: a hot reload replaces a
 * stylesheet (Pilot's rule goes with the old one), and a component restyled
 * with other props gets another class (CSS-in-JS). `check` looks for both,
 * and places the rule again.
 */

/** What to show: one change, with the element's preview id. */
export interface AnchorRequest {
  element: Element;
  property: string;
  /** The declaration, as written: `padding-top: 20px;`. */
  text: string;
  id: number;
  widths?: WidthRange;
  states?: ElementState[];
}

/** Where a change goes among the page's rules. */
type Spot =
  | { kind: "beside"; declared: Placed["declared"]; media?: string }
  | { kind: "after"; unit: CSSRule; selector: string };

/** One change shown in the page's CSS. */
interface Shown {
  element: Element;
  text: string;
  /** What it's placed by: the declaration it sits beside, or the rule it comes after. */
  by: CSSStyleDeclaration | CSSRule;
  /** What Pilot inserted (to take it away), and the declarations it writes (to update in place). */
  rule: CSSRule;
  style: CSSStyleDeclaration;
}

const shown = new Map<string, Shown>();

const keyOf = (r: AnchorRequest) => `${r.id}|${r.property}|${r.widths?.min ?? ""}-${r.widths?.max ?? ""}|${r.states?.join(",") ?? ""}`;

/** The elements with a change shown in the page's CSS now (their classes are watched). */
export function anchoredElements(): Element[] {
  return [...new Set([...shown.values()].map((a) => a.element))];
}

/**
 * Show `requests` in the page's CSS, in order, and take away those not asked
 * for anymore. With `check`, each one already shown is placed again if where
 * it belongs changed (its stylesheet replaced, its rule no longer the one,
 * its element's classes changed). Returns the requests it couldn't place.
 */
export function renderAnchored(requests: AnchorRequest[], check: boolean): AnchorRequest[] {
  const wanted = new Set(requests.map(keyOf));
  for (const [key, entry] of shown) {
    if (wanted.has(key)) continue;
    remove(entry.rule);
    shown.delete(key);
  }
  const left: AnchorRequest[] = [];
  // Several changes placed by the same rule (padding, then padding-top): in the order they were made.
  const lastBy = new Map<CSSStyleDeclaration | CSSRule, CSSRule>();
  for (const request of requests) {
    const key = keyOf(request);
    const entry = shown.get(key);
    const looked = !entry || check || !live(entry.rule);
    const spot = looked ? spotFor(request) : null;
    if (entry && live(entry.rule) && entry.element === request.element && (!looked || (spot && byOf(spot, request.element) === entry.by))) {
      if (entry.text !== request.text) {
        entry.style.cssText = request.text;
        entry.text = request.text;
      }
      lastBy.set(entry.by, entry.rule);
      continue;
    }
    if (entry) {
      remove(entry.rule);
      shown.delete(key);
    }
    if (!spot) {
      left.push(request);
      continue;
    }
    const by = byOf(spot, request.element);
    const placed = place(spot, request, lastBy.get(by));
    if (!placed) {
      left.push(request);
      continue;
    }
    lastBy.set(by, placed.rule);
    shown.set(key, { element: request.element, text: request.text, by, ...placed });
  }
  return left;
}

/** What a change is placed by: beside a rule the element skips (a cleared field, dom/excluded.ts), its copy's declarations. */
const byOf = (spot: Spot, element: Element): CSSStyleDeclaration | CSSRule =>
  spot.kind === "beside" ? (copyFor(spot.declared.rule, element) ?? spot.declared.rule) : spot.unit;

const sameRange = (a: { min?: number; max?: number }, b: { min?: number; max?: number }) => a.min === b.min && a.max === b.max;
const overlaps = (a: { min?: number; max?: number }, b: { min?: number; max?: number }) =>
  (a.min ?? 0) <= (b.max ?? Number.POSITIVE_INFINITY) && (b.min ?? 0) <= (a.max ?? Number.POSITIVE_INFINITY);

/** Where a change goes among the page's rules (see the module's comment), or null: nothing to place it by. */
function spotFor(request: AnchorRequest): Spot | null {
  const { element, property, states } = request;
  const want = request.widths ?? {};
  const rules = declarationsOf(element, property, states).flatMap((p) => {
    const range = p.media ? mediaRange(p.media) : {};
    return range ? [{ placed: p, range }] : [];
  });
  // The project's own rule for exactly these widths and states: beside the one that wins (the cascade's, `beats`).
  const exact = rules
    .filter((r) => sameRange(r.range, want))
    .reduce<(typeof rules)[number] | undefined>(
      (best, r) =>
        !best || beats({ important: r.placed.declared.important, rule: r.placed.match }, { important: best.placed.declared.important, rule: best.placed.match }) ? r : best,
      undefined,
    );
  if (exact) return { kind: "beside", declared: exact.placed.declared, ...(exact.placed.media ? { media: exact.placed.media } : {}) };
  // A rule of its own: the element's selector, as its base rule writes it.
  const base = baseValue(element, property);
  const selector = base?.rule && base.source !== "inline" ? base.source.selector : rules[0] ? subjectStates(rules[0].placed.declared.source.selector).stripped : null;
  if (!selector) return null;
  // After which rule: among the project's breakpoints for it, else after its rule without one (the state's), else the base.
  const plain = rules.filter((r) => r.range.min === undefined && r.range.max === undefined).at(-1);
  let after = plain;
  if (want.min !== undefined && want.max === undefined) {
    after = rules.filter((r) => r.range.max === undefined && r.range.min !== undefined && r.range.min <= (want.min as number)).at(-1) ?? plain;
  } else if (want.max !== undefined && want.min === undefined) {
    after = rules.filter((r) => r.range.min === undefined && r.range.max !== undefined && r.range.max >= (want.max as number)).at(-1) ?? plain;
  } else if (want.min !== undefined && want.max !== undefined) {
    after = rules.filter((r) => (r.range.min !== undefined || r.range.max !== undefined) && overlaps(r.range, want)).at(-1) ?? plain;
  }
  const by = after?.placed.declared.rule ?? (base?.rule && base.source !== "inline" ? base.rule : null);
  const unit = by && unitOf(by);
  return unit ? { kind: "after", unit, selector } : null;
}

/**
 * The rule a declaration belongs to, as one piece of its stylesheet: the
 * style rule, with any rule it's nested in (`.md\:p-8 { @media { … } }`), or
 * the `@media` around it (`@media { .card { … } }`). What a rule of Pilot's own goes after.
 */
function unitOf(declarations: CSSStyleDeclaration): CSSRule | null {
  let rule = declarations.parentRule;
  while (rule?.parentRule && rule.parentRule.constructor.name !== "CSSLayerBlockRule") rule = rule.parentRule;
  return rule ?? null;
}

type Container = { cssRules: CSSRuleList; insertRule(text: string, index?: number): number; deleteRule(index: number): void };
type RuleLike = CSSRule & { cssRules?: CSSRuleList; insertRule?: Container["insertRule"]; selectorText?: string };

const containerOf = (rule: CSSRule): Container | null => (rule.parentRule as unknown as Container | null) ?? (rule.parentStyleSheet as unknown as Container | null);
const indexIn = (container: Container, rule: CSSRule) => Array.from(container.cssRules).indexOf(rule);

/** Whether a rule Pilot inserted is still in a stylesheet the page uses. */
function live(rule: CSSRule): boolean {
  const sheet = rule.parentStyleSheet;
  if (!sheet) return false;
  const owner = sheet.ownerNode as (Node & { sheet?: CSSStyleSheet | null }) | null;
  // A <style> or <link>: still on the page, and still holding this sheet (a hot reload makes a new one).
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

/**
 * Insert the request's rule at `spot` (or right after `after`, an earlier
 * change placed by the same rule). Null when the page's stylesheet can't take
 * it (not readable, or the browser refuses).
 */
function place(spot: Spot, request: AnchorRequest, after?: CSSRule): { rule: CSSRule; style: CSSStyleDeclaration } | null {
  const where = `[data-pilot-edit="${request.id}"]`;
  const own = (selector: string) => {
    // A color scheme the project's way: a class on the root after the subject, or a media condition.
    const scheme = schemeParts(schemeOf(request.states));
    const rule = `:is(${selector}):where(${where})${scheme.selector}${stateSelector(request.states)} { ${request.text} }`;
    const media = [request.widths && mediaFor(request.widths), scheme.media].filter(Boolean).join(" and ");
    return media ? `@media ${media} { ${rule} }` : rule;
  };
  // For a pseudo-element, never nested in the project's rule: `.q::before { &:where(…) }` would put
  // `:where()` after the pseudo-element, which matches nothing. Beside it instead, the pseudo-element last.
  const pseudo = !!request.states?.some(isPseudoElement);
  const beside = (s: Extract<Spot, { kind: "beside" }>) => (pseudo ? besidePseudo(s, where, request) : besideOutside(s, where, request.text));
  if (after) {
    const container = containerOf(after);
    if (!container) return null;
    const nested = !pseudo && (after as RuleLike).selectorText?.startsWith("&");
    const text = nested ? `&:where(${where}) { ${request.text} }` : spot.kind === "after" ? own(spot.selector) : beside(spot);
    return insert(container, text, indexIn(container, after) + 1);
  }
  if (spot.kind === "after") {
    const container = containerOf(spot.unit);
    return container ? insert(container, own(spot.selector), indexIn(container, spot.unit) + 1) : null;
  }
  // Beside: nested in the rule the declarations belong to, right after them (the copy's, when the element skips the rule).
  const owner = (copyFor(spot.declared.rule, request.element) ?? spot.declared.rule).parentRule as RuleLike | null;
  if (!owner) return null;
  const nested = `&:where(${where}) { ${request.text} }`;
  // The rule's own declarations: first among its nested rules. A block of declarations after some (CSSNestedDeclarations): right after it.
  const target = (owner.selectorText !== undefined ? owner : owner.parentRule) as RuleLike | null;
  if (!pseudo && target && typeof target.insertRule === "function") {
    const placed = insert(target as unknown as Container, nested, owner === target ? 0 : indexIn(target as unknown as Container, owner) + 1);
    if (placed) return placed;
  }
  // No nesting: right after the rule's piece of the stylesheet, its selector and media spelled out.
  const unit = unitOf(spot.declared.rule);
  const container = unit && containerOf(unit);
  return unit && container ? insert(container, beside(spot), indexIn(container, unit) + 1) : null;
}

/**
 * A rule beside a pseudo-element's declaration, right after the project's:
 * its element's selector (`:is()` can't hold a pseudo-element), the scheme
 * the project's way when it's a class, then the states and the
 * pseudo-element; its media (widths, a scheme's query) as the project's rule.
 */
function besidePseudo(spot: Extract<Spot, { kind: "beside" }>, where: string, request: AnchorRequest): string {
  const scheme = schemeParts(schemeOf(request.states));
  const rule = `:is(${subjectStates(spot.declared.source.selector).stripped}):where(${where})${scheme.selector}${stateSelector(request.states)} { ${request.text} }`;
  return spot.media ? `@media ${spot.media} { ${rule} }` : rule;
}

/** A rule beside a declaration, written out at the top: its selector (states included) and media. */
function besideOutside(spot: Extract<Spot, { kind: "beside" }>, where: string, text: string): string {
  const rule = `:is(${spot.declared.source.selector}):where(${where}) { ${text} }`;
  return spot.media ? `@media ${spot.media} { ${rule} }` : rule;
}

/** The media query for a width range, both ends included (preview.ts's mediaQuery, not imported: preview imports this module). */
function mediaFor({ min, max }: WidthRange): string | undefined {
  const parts = [min !== undefined && `(min-width: ${min}px)`, max !== undefined && `(max-width: ${max}px)`];
  return parts.filter(Boolean).join(" and ") || undefined;
}

function insert(container: Container, text: string, index: number): { rule: CSSRule; style: CSSStyleDeclaration } | null {
  try {
    const at = container.insertRule(text, index);
    const rule = container.cssRules[at] as RuleLike | undefined;
    if (!rule) return null;
    const style = (rule as CSSRule & { style?: CSSStyleDeclaration }).style ?? (rule.cssRules?.[0] as CSSStyleRule | undefined)?.style;
    return style ? { rule, style } : null;
  } catch {
    return null;
  }
}
