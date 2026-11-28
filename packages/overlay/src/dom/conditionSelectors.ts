/**
 * Selectors under a condition (dom/declared.ts conditionalRules): what's
 * dynamic in them, and the condition they put on an element, relative to it.
 * A condition here is what isn't one of Pilot's other modifiers: an
 * ancestor's or a sibling's state (`.card:hover .title`, Tailwind's
 * `group-hover:` and `peer-checked:`), an attribute (`data-*`, `aria-*`,
 * `open`…), what it contains (`:has()`).
 */

/** Pseudo-classes that come and go with what's done on the page: a rule with one applies only while it holds. */
const DYNAMIC = new Set([
  "hover",
  "focus",
  "focus-within",
  "focus-visible",
  "active",
  "checked",
  "disabled",
  "enabled",
  "invalid",
  "valid",
  "user-invalid",
  "user-valid",
  "placeholder-shown",
  "target",
  "visited",
  "open",
  "popover-open",
  "empty",
  "indeterminate",
  "autofill",
]);

/** Attributes that say a state (the page sets and unsets them): `data-*`, `aria-*`, and a few of HTML's own. */
const STATE_ATTRIBUTE = /^\[\s*(?:data-|aria-|open\b|checked\b|selected\b|disabled\b|hidden\b|inert\b)/i;

/** A compound's simple selectors and the pieces between compounds, read at the top level (parentheses and brackets kept whole). */
function tokens(selector: string): string[] {
  const out: string[] = [];
  let i = 0;
  const s = selector;
  while (i < s.length) {
    const c = s[i] as string;
    // A combinator, with its spaces: one token.
    if (/[\s>+~]/.test(c)) {
      let j = i;
      while (j < s.length && /[\s>+~]/.test(s[j] as string)) j++;
      out.push(s.slice(i, j));
      i = j;
      continue;
    }
    let j = i + 1;
    if (c === "[") {
      while (j < s.length && s[j] !== "]") j++;
      j++;
    } else if (c === ":") {
      if (s[j] === ":") j++;
      while (j < s.length && /[\w-]/.test(s[j] as string)) j++;
      if (s[j] === "(") {
        let depth = 0;
        for (; j < s.length; j++) {
          if (s[j] === "(") depth++;
          else if (s[j] === ")" && --depth === 0) {
            j++;
            break;
          }
        }
      }
    } else {
      // A tag, class or id, with escapes (Tailwind's `.group-hover\/hero\:bg-…`).
      while (j < s.length) {
        const d = s[j] as string;
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (/[\s>+~[.:#]/.test(d)) break;
        j++;
      }
    }
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

const isCombinator = (t: string) => /^[\s>+~]+$/.test(t);

/** Split a selector list at its top-level commas. */
function list(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(selector.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(selector.slice(from).trim());
  return out.filter(Boolean);
}

/** A simple selector without what's dynamic in it: "" when it's all dynamic, the selector inside `:is()`/`:where()` relaxed. */
function relaxPiece(piece: string): string {
  if (piece.startsWith("[")) return STATE_ATTRIBUTE.test(piece) ? "" : piece;
  const m = /^:(?!:)([\w-]+)(?:\((.*)\))?$/s.exec(piece);
  if (!m) return piece;
  const [, name, args] = m as unknown as [string, string, string | undefined];
  if (args === undefined) return DYNAMIC.has(name) ? "" : piece;
  if (name === "has") return "";
  if (name === "not") return relaxSelector(args) !== args ? "" : piece;
  if (name === "is" || name === "where") return `:${name}(${list(args).map(relaxSelector).join(", ")})`;
  return piece;
}

/**
 * The selector without its dynamic parts (states, state attributes, `:has()`), compound by compound: what it
 * matches whatever's done on the page. A compound left empty is `*`.
 */
export function relaxSelector(selector: string): string {
  const out: string[] = [];
  let compound: string[] = [];
  const close = () => {
    out.push(compound.join("") || "*");
    compound = [];
  };
  for (const t of tokens(selector.trim())) {
    if (isCombinator(t)) {
      close();
      out.push(/\S/.test(t) ? ` ${t.trim()} ` : " ");
    } else {
      // A pseudo-element stays (it's what's styled, not a condition).
      compound.push(t.startsWith("::") ? t : relaxPiece(t));
    }
  }
  close();
  return out.join("");
}

/** Whether a selector has something dynamic in it. */
export function isDynamic(selector: string): boolean {
  return relaxSelector(selector) !== selector.trim();
}

/**
 * The condition a selector puts on the element it styles, relative to it, `&` for the element: the ancestors
 * and siblings it needs in a state as they're written (`.card:hover &`), and from the element's own compound
 * only what's dynamic (`&[data-state="open"]`, `&:is(:where(.group\/hero):hover *)`: Tailwind's group-hover),
 * its classes and tag left out, so every rule under one condition gives the same one. Null: nothing dynamic.
 */
export function conditionOfSelector(selector: string): string | null {
  const parts = tokens(selector.trim());
  // The subject: the last compound.
  let last = parts.length;
  while (last > 0 && !isCombinator(parts[last - 1] as string)) last--;
  const head = parts.slice(0, last).join("");
  const subject = parts.slice(last);
  const own = subject.filter((t) => !t.startsWith("::") && relaxPiece(t) !== t);
  // What's around it counts when something there is dynamic; else only the element's own.
  const around = head && isDynamic(head.replace(/[\s>+~]+$/, "")) ? head : "";
  if (!around && !own.length) return null;
  return `${around}&${own.join("")}`;
}

/**
 * The name Tailwind gives a condition: the variant of the element's class that declares it, unescaped
 * (`.group-hover\/hero\:bg-amber-200` → `group-hover/hero`, `@max-\[300px\]\:text-base` → `@max-[300px]`).
 * Null when no class in the selector's subject is a variant's.
 */
export function variantName(selector: string): string | null {
  const parts = tokens(selector.trim());
  let last = parts.length;
  while (last > 0 && !isCombinator(parts[last - 1] as string)) last--;
  const classes = parts
    .slice(last)
    .flatMap((t) => (t.startsWith(":is(") || t.startsWith(":where(") ? tokens(t.slice(t.indexOf("(") + 1, -1)) : [t]))
    .filter((t) => t.startsWith("."))
    .map((t) => t.slice(1).replace(/\\(.)/g, "$1"));
  for (const cls of classes) {
    // The variants: up to the last `:` outside brackets.
    let depth = 0;
    let at = -1;
    for (let i = 0; i < cls.length; i++) {
      const c = cls[i];
      if (c === "[") depth++;
      else if (c === "]") depth--;
      else if (c === ":" && depth === 0) at = i;
    }
    if (at > 0) return cls.slice(0, at);
  }
  return null;
}
