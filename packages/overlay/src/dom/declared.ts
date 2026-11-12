/**
 * Declared values: the CSS that actually applies to an element for a
 * property, from any source (the page's stylesheets, Tailwind classes, the
 * app's inline styles, Pilot's own edits). Not computed values: `50%` stays
 * `50%`, `var(--space-4)` stays as written, and a property nothing declares
 * has no value (the field is empty).
 *
 * How: walk the stylesheets of the element's root in document order, keep the
 * style rules that match the element and whose conditions hold (@media,
 * @supports), and pick the winning declaration per property the way the
 * cascade does: importance, element-attached (inline) styles, @layer order,
 * specificity, then order of appearance.
 *
 * Known gaps: @container conditions can't be evaluated from script, so those
 * rules are skipped; @scope's end bound is ignored; cross-origin stylesheets
 * can't be read; the browser's own (user-agent) styles aren't visible to
 * script, so a <ul>'s default padding counts as nothing declared. Logical
 * properties are mapped for horizontal, left-to-right text.
 */

/** A declaration that applies to the element. */
export interface Declared {
  value: string;
  important: boolean;
  /** Where it comes from: the style attribute, or the selector of the winning rule. */
  source: "inline" | { selector: string };
  /** The winning rule's declarations (for a rule source), to leave it out (see declaredWithout). */
  rule?: CSSStyleDeclaration;
}

/** A style rule that matches the element, with what the cascade needs to rank it. */
export interface MatchedRule {
  style: CSSStyleDeclaration;
  selector: string;
  /** [ids, classes/attributes/pseudo-classes, types/pseudo-elements]. */
  specificity: Specificity;
  /**
   * Its @layer position, outermost first: each entry is the layer's order
   * among its siblings, and Infinity for "not in a sub-layer" (unlayered
   * styles beat layered ones). Top-level unlayered rules are [Infinity].
   */
  layer: number[];
  /** Order of appearance across all the stylesheets. */
  order: number;
}

export type Specificity = [number, number, number];

/**
 * The properties a declaration of `property` can come from, most specific
 * first: the property itself, then its logical equivalents and shorthands.
 * CSSOM already expands shorthands into longhands, except when they contain
 * var() (then only the shorthand has text), and logical properties are
 * separate properties that share the physical one's value.
 */
const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];
const LOGICAL: Record<Side, [string, string]> = {
  top: ["block-start", "block"],
  bottom: ["block-end", "block"],
  left: ["inline-start", "inline"],
  right: ["inline-end", "inline"],
};

interface Source {
  property: string;
  /** For a shorthand: which of its values belongs to `property` (see pickSide). */
  side?: { of: "box" | "pair"; index: number };
}

export function sourcesOf(property: string): Source[] {
  const box = property.match(/^(padding|margin)-(top|right|bottom|left)$/);
  if (box) {
    const [, kind, side] = box as unknown as [string, string, Side];
    const [longhand, axis] = LOGICAL[side];
    const boxIndex = SIDES.indexOf(side);
    const pairIndex = side === "top" || side === "left" ? 0 : 1;
    return [
      { property },
      { property: `${kind}-${longhand}` },
      { property: `${kind}-${axis}`, side: { of: "pair", index: pairIndex } },
      { property: kind, side: { of: "box", index: boxIndex } },
    ];
  }
  const border = property.match(/^border-(top|right|bottom|left)-width$/);
  if (border) {
    const side = border[1] as Side;
    return [{ property }, { property: "border-width", side: { of: "box", index: SIDES.indexOf(side) } }];
  }
  return [{ property }];
}

/**
 * One side's value from a shorthand's text, when it splits cleanly into
 * top-level values: a box shorthand (`10px 18px` → right is `18px`) or a
 * logical pair (`padding-inline: 8px 12px` → end is `12px`). The whole text
 * when it's one value (`var(--space)` applies to every side), null when it
 * can't be split (a var() standing for several values, or too many parts).
 */
export function pickSide(text: string, side: { of: "box" | "pair"; index: number }): string | null {
  const parts = splitTopLevel(text, " ");
  if (parts.length === 1) return parts[0] as string;
  if (side.of === "pair") return parts.length === 2 ? (parts[side.index] as string) : null;
  if (parts.length > 4) return null;
  const [t, r = t, b = t, l = r] = parts as [string, string?, string?, string?];
  return [t, r, b, l][side.index] ?? null;
}

/** The declared value of each property, or null where nothing declares it. */
export function declaredValues(element: Element, properties: string[]): Record<string, Declared | null> {
  const rules = matchedRules(element);
  const inline = (element as HTMLElement).style as CSSStyleDeclaration | undefined;
  return Object.fromEntries(properties.map((p) => [p, resolve(p, inline, rules)]));
}

/** The declared value of one property, or null. */
export function declaredValue(element: Element, property: string): Declared | null {
  return declaredValues(element, [property])[property] ?? null;
}

/**
 * What would apply to `property` without some of its declarations: without
 * the style attribute (`inline: false`), and without the rules in `skip`
 * (their `rule`, from a Declared). How Pilot previews a removed value: the
 * next declaration in the cascade, or null when nothing else declares it.
 */
export function declaredWithout(
  element: Element,
  property: string,
  without: { inline: boolean; skip?: CSSStyleDeclaration[] },
): Declared | null {
  const rules = matchedRules(element).filter((r) => !without.skip?.includes(r.style));
  const inline = without.inline ? undefined : ((element as HTMLElement).style as CSSStyleDeclaration | undefined);
  return resolve(property, inline, rules);
}

/** The winner for `property` among the inline style and the matched rules. */
export function resolve(
  property: string,
  inline: CSSStyleDeclaration | undefined,
  rules: MatchedRule[],
): Declared | null {
  const sources = sourcesOf(property);
  const read = (style: CSSStyleDeclaration) => {
    for (const source of sources) {
      const text = style.getPropertyValue(source.property).trim();
      if (!text) continue;
      const value = source.side ? pickSide(text, source.side) : text;
      if (value) return { value, important: style.getPropertyPriority(source.property) === "important" };
    }
    return null;
  };

  const fromInline = inline ? read(inline) : null;
  let best: { rule: MatchedRule; value: string; important: boolean } | null = null;
  for (const rule of rules) {
    const found = read(rule.style);
    if (found && (!best || beats({ ...found, rule }, best))) best = { ...found, rule };
  }
  // Important declarations beat normal ones; within the same importance,
  // inline (element-attached) styles beat any rule.
  if (fromInline?.important) return { ...fromInline, source: "inline" };
  const fromRule = (r: NonNullable<typeof best>): Declared => ({
    value: r.value,
    important: r.important,
    source: { selector: r.rule.selector },
    rule: r.rule.style,
  });
  if (best?.important) return fromRule(best);
  if (fromInline) return { ...fromInline, source: "inline" };
  if (best) return fromRule(best);
  return null;
}

/** Whether declaration `a` wins over `b` in the cascade (both from rules). */
export function beats(
  a: { important: boolean; rule: Pick<MatchedRule, "layer" | "specificity" | "order"> },
  b: { important: boolean; rule: Pick<MatchedRule, "layer" | "specificity" | "order"> },
): boolean {
  if (a.important !== b.important) return a.important;
  // Layers: for normal declarations later layers (and unlayered styles) win;
  // for important ones the order flips.
  const layer = compare(a.rule.layer, b.rule.layer);
  if (layer !== 0) return a.important ? layer < 0 : layer > 0;
  const specificity = compare(a.rule.specificity, b.rule.specificity);
  if (specificity !== 0) return specificity > 0;
  return a.rule.order > b.rule.order;
}

/** Lexicographic comparison; a missing entry counts as Infinity (not in a sub-layer). */
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? Number.POSITIVE_INFINITY;
    const y = b[i] ?? Number.POSITIVE_INFINITY;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// --- Collecting the rules that match -------------------------------------

/**
 * Matched rules are cached for the rest of the current task, so every editor
 * in the dialog (they render in the same pass) shares one walk of the
 * stylesheets. The cache also checks a cheap signature (the stylesheets and
 * their rule counts, the element's classes and id), so a change within the
 * same task isn't missed.
 */
let cache: { element: Element; signature: string; rules: MatchedRule[] } | null = null;

export function matchedRules(element: Element): MatchedRule[] {
  const signature = signatureOf(element);
  if (cache?.element === element && cache.signature === signature) return cache.rules;
  const rules = collect(element);
  cache = { element, signature, rules };
  queueMicrotask(() => {
    cache = null;
  });
  return rules;
}

/** A stable id per stylesheet object: replacing a <style>'s text makes a new one. */
const sheetIds = new WeakMap<CSSStyleSheet, number>();
let nextSheetId = 0;

function signatureOf(element: Element): string {
  const parts = [element.className, element.id];
  for (const sheet of sheetsOf(element)) {
    let id = sheetIds.get(sheet);
    if (id === undefined) sheetIds.set(sheet, (id = nextSheetId++));
    let count = -1;
    try {
      count = sheet.cssRules.length;
    } catch {
      // cross-origin
    }
    parts.push(`${id}:${count}`);
  }
  return parts.join("|");
}

function sheetsOf(element: Element): CSSStyleSheet[] {
  const root = element.getRootNode() as Document | ShadowRoot;
  return [
    ...Array.from(root.styleSheets ?? []),
    ...Array.from((root as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []),
  ];
}

interface Walk {
  element: Element;
  out: MatchedRule[];
  order: number;
  /** Layer order per parent layer name ("" = top level): name → index. */
  layers: Map<string, Map<string, number>>;
  anonymous: number;
  /** Media query results, so repeated queries (`@media (min-width: 768px)`) are evaluated once. */
  media: Map<string, boolean>;
}

function collect(element: Element): MatchedRule[] {
  const walk: Walk = { element, out: [], order: 0, layers: new Map(), anonymous: 0, media: new Map() };
  for (const sheet of sheetsOf(element)) walkSheet(walk, sheet, "", null);
  return walk.out;
}

function walkSheet(walk: Walk, sheet: CSSStyleSheet, layer: string, parents: string[] | null) {
  if (sheet.disabled) return;
  if (sheet.media?.mediaText && !mediaMatches(walk, sheet.media.mediaText)) return;
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return; // cross-origin: can't be read
  }
  walkRules(walk, rules, layer, parents);
}

function walkRules(walk: Walk, rules: CSSRuleList, layer: string, parents: string[] | null) {
  for (const rule of Array.from(rules)) walkRule(walk, rule, layer, parents);
}

function walkRule(walk: Walk, rule: CSSRule, layer: string, parents: string[] | null) {
  const r = rule as CSSRule & {
    selectorText?: string;
    style?: CSSStyleDeclaration;
    cssRules?: CSSRuleList;
    media?: MediaList;
    conditionText?: string;
    name?: string;
    nameList?: string[];
    styleSheet?: CSSStyleSheet | null;
    layerName?: string | null;
    start?: string | null;
  };
  const kind = rule.constructor?.name ?? "";

  // A style rule (possibly nested: its selector is relative to the parents').
  if (typeof r.selectorText === "string" && r.style) {
    const selectors = resolveNesting(splitTopLevel(r.selectorText, ","), parents);
    addIfMatching(walk, r.style, selectors, layer);
    if (r.cssRules?.length) walkRules(walk, r.cssRules, layer, selectors);
    return;
  }
  // Declarations nested in a group rule inside a style rule: the parents' selector.
  if (r.style && parents && !r.cssRules) {
    addIfMatching(walk, r.style, parents, layer);
    return;
  }
  if (kind === "CSSImportRule" || (r.styleSheet !== undefined && "href" in r)) {
    if (r.media?.mediaText && !mediaMatches(walk, r.media.mediaText)) return;
    const importLayer = r.layerName == null ? layer : declareLayer(walk, layer, r.layerName);
    if (r.styleSheet) walkSheet(walk, r.styleSheet, importLayer, parents);
    return;
  }
  if (kind === "CSSLayerStatementRule" || (r.nameList && !r.cssRules)) {
    for (const name of r.nameList ?? []) declareLayer(walk, layer, name);
    return;
  }
  if (kind === "CSSLayerBlockRule") {
    const inner = declareLayer(walk, layer, r.name ?? "");
    if (r.cssRules) walkRules(walk, r.cssRules, inner, parents);
    return;
  }
  if (kind === "CSSMediaRule" || (r.media && r.cssRules)) {
    if (mediaMatches(walk, r.media?.mediaText ?? "") && r.cssRules) walkRules(walk, r.cssRules, layer, parents);
    return;
  }
  if (kind === "CSSSupportsRule") {
    if (supports(r.conditionText ?? "") && r.cssRules) walkRules(walk, r.cssRules, layer, parents);
    return;
  }
  if (kind === "CSSScopeRule") {
    if ((!r.start || walk.element.closest(r.start)) && r.cssRules) walkRules(walk, r.cssRules, layer, parents);
    return;
  }
  // @container (can't be evaluated), @keyframes, @font-face, @page,
  // @starting-style…: nothing that applies to the element here.
}

/** Register a layer under `parent`, in order of first appearance; returns its full name. */
function declareLayer(walk: Walk, parent: string, name: string): string {
  let full = parent;
  const parts = name ? name.split(".").map((p) => p.trim()) : [`\0anonymous-${walk.anonymous++}`];
  for (const part of parts) {
    const siblings = walk.layers.get(full) ?? new Map<string, number>();
    walk.layers.set(full, siblings);
    if (!siblings.has(part)) siblings.set(part, siblings.size);
    full = full ? `${full}.${part}` : part;
  }
  return full;
}

/** A layer's position, outermost first, ending in Infinity (see MatchedRule.layer). */
function layerPath(walk: Walk, layer: string): number[] {
  if (!layer) return [Number.POSITIVE_INFINITY];
  const path: number[] = [];
  let parent = "";
  for (const part of layer.split(".")) {
    path.push(walk.layers.get(parent)?.get(part) ?? 0);
    parent = parent ? `${parent}.${part}` : part;
  }
  path.push(Number.POSITIVE_INFINITY);
  return path;
}

function addIfMatching(walk: Walk, style: CSSStyleDeclaration, selectors: string[], layer: string) {
  const order = walk.order++;
  let best: { selector: string; specificity: Specificity } | null = null;
  for (const selector of selectors) {
    let matches = false;
    try {
      matches = walk.element.matches(selector);
    } catch {
      // A selector this browser can't parse: it can't apply either.
    }
    if (!matches) continue;
    const s = specificity(selector);
    if (!best || compare(s, best.specificity) > 0) best = { selector, specificity: s };
  }
  if (best) walk.out.push({ style, selector: best.selector, specificity: best.specificity, layer: layerPath(walk, layer), order });
}

/**
 * Nested selectors made absolute: `&` stands for the parents (`&:hover`),
 * and a selector without `&` is a descendant of them (`.title`).
 */
function resolveNesting(selectors: string[], parents: string[] | null): string[] {
  if (!parents) return selectors;
  // A single simple selector (`.card`) can stand in as is; anything else is
  // wrapped in :is(), which also gives `&` the parents' highest specificity.
  const only = parents.length === 1 ? (parents[0] as string) : null;
  const wrapped = only && /^[\w-]*(?:[.#][\w-]+)*$/.test(only) ? only : `:is(${parents.join(", ")})`;
  return selectors.map((s) => (s.includes("&") ? s.replaceAll("&", wrapped) : `${wrapped} ${s}`));
}

function mediaMatches(walk: Walk, text: string): boolean {
  const t = text.trim();
  if (!t || t === "all") return true;
  let result = walk.media.get(t);
  if (result === undefined) {
    try {
      result = typeof matchMedia === "function" ? matchMedia(t).matches : true;
    } catch {
      result = false;
    }
    walk.media.set(t, result);
  }
  return result;
}

function supports(condition: string): boolean {
  try {
    return typeof CSS !== "undefined" && typeof CSS.supports === "function" ? CSS.supports(condition) : true;
  } catch {
    return false;
  }
}

// --- Selectors -------------------------------------------------------------

/**
 * Split at top-level `separator`s (commas between selectors, spaces between
 * values), ignoring the ones inside parentheses, brackets and quotes.
 */
export function splitTopLevel(text: string, separator: "," | " "): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (ch === "\\") {
      current += ch + (text[i + 1] ?? "");
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && (separator === "," ? ch === "," : /\s/.test(ch))) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const PSEUDO_ELEMENTS_LEGACY = ["before", "after", "first-line", "first-letter"];
const TAKES_ARGUMENT_SPECIFICITY = ["is", "not", "has", "matches", "-webkit-any", "-moz-any"];

/** The specificity of one complex selector (no commas at the top level). */
export function specificity(selector: string): Specificity {
  let a = 0;
  let b = 0;
  let c = 0;
  const add = (s: Specificity) => {
    a += s[0];
    b += s[1];
    c += s[2];
  };
  const maxOf = (list: string) =>
    splitTopLevel(list, ",").reduce<Specificity>((best, s) => {
      const sp = specificity(s);
      return compare(sp, best) > 0 ? sp : best;
    }, [0, 0, 0]);

  let i = 0;
  const ident = () => {
    let out = "";
    while (i < selector.length) {
      const ch = selector[i] as string;
      if (ch === "\\") {
        out += selector.slice(i, i + 2);
        i += 2;
      } else if (/[\w-]/.test(ch) || ch.charCodeAt(0) > 127) {
        out += ch;
        i++;
      } else break;
    }
    return out;
  };
  const argument = () => {
    // At "(": return what's inside the matching ")".
    let depth = 0;
    const start = i + 1;
    for (; i < selector.length; i++) {
      if (selector[i] === "(") depth++;
      else if (selector[i] === ")" && --depth === 0) break;
    }
    const inner = selector.slice(start, i);
    i++;
    return inner;
  };

  while (i < selector.length) {
    const ch = selector[i] as string;
    if (ch === "#") {
      i++;
      ident();
      a++;
    } else if (ch === ".") {
      i++;
      ident();
      b++;
    } else if (ch === "[") {
      let quote = "";
      for (; i < selector.length; i++) {
        const q = selector[i];
        if (quote) {
          if (q === quote) quote = "";
        } else if (q === '"' || q === "'") quote = q;
        else if (q === "]") break;
      }
      i++;
      b++;
    } else if (ch === ":") {
      const element = selector[i + 1] === ":";
      i += element ? 2 : 1;
      const name = ident().toLowerCase();
      const arg = selector[i] === "(" ? argument() : null;
      if (element || PSEUDO_ELEMENTS_LEGACY.includes(name)) c++;
      else if (name === "where") {
        // zero specificity
      } else if (TAKES_ARGUMENT_SPECIFICITY.includes(name) && arg !== null) add(maxOf(arg));
      else if ((name === "nth-child" || name === "nth-last-child") && arg && /\sof\s/i.test(arg)) {
        b++;
        add(maxOf(arg.split(/\sof\s/i)[1] ?? ""));
      } else b++;
    } else if (/[a-zA-Z_-]/.test(ch) || ch.charCodeAt(0) > 127) {
      ident();
      c++; // type selector
    } else if (ch === "\\") {
      ident();
      c++;
    } else {
      i++; // combinators, whitespace, `*`, `|`
    }
  }
  return [a, b, c];
}
