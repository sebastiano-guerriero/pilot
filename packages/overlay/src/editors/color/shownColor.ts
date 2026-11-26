/**
 * The color a color field's swatch shows: the field's own value, the page's
 * variables in it resolved on the element (`var(--brand)` → its color), so
 * it's the color the field holds, for the state, width or scheme the pills
 * are for. Else (nothing set, `currentColor`, a value the browser can't
 * read as a color) the element's computed color now.
 *
 * Before, it was always the computed color: Pilot doesn't force states on the
 * page, so with the hover pill a heading's `color: red` showed its white.
 */
export function shownColor(element: Element, value: string, computed: string): string {
  const text = value.trim();
  if (!text || /currentcolor|inherit|initial|unset|revert/i.test(text)) return computed;
  const resolved = resolveVariables(element, text);
  if (resolved === null || /var\(/i.test(resolved)) return computed;
  return isColor(resolved) ? resolved : computed;
}

/** `var(--x, fallback)` replaced by the variable's value on the element (or the fallback); null if one has neither. */
export function resolveVariables(element: Element, text: string): string | null {
  const style = getComputedStyle(element);
  let result = text;
  // Innermost first (a fallback can hold another var()), a few levels at most.
  for (let i = 0; i < 5 && /var\(/i.test(result); i++) {
    let missing = false;
    result = result.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/gi, (_, name: string, fallback?: string) => {
      const value = style.getPropertyValue(name).trim() || fallback?.trim() || "";
      if (!value) missing = true;
      return value;
    });
    if (missing) return null;
  }
  return result;
}

function isColor(text: string): boolean {
  try {
    return typeof CSS !== "undefined" && typeof CSS.supports === "function" ? CSS.supports("color", text) : true;
  } catch {
    return false;
  }
}
