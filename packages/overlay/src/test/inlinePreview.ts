import type { Preview } from "../dom/preview.ts";

/**
 * Tests only: a preview that writes Pilot's rules as inline styles, ignoring
 * widths, so editor tests can read what an edit did from `element.style`
 * (happy-dom can't parse the real preview's @layer sheet). Each element's own
 * inline style, as it was before its first change, is put back before every
 * render.
 */
export function inlinePreview(): Preview {
  const original = new Map<HTMLElement, string>();
  return {
    render(rules) {
      for (const { element } of rules) {
        const el = element as HTMLElement;
        if (!original.has(el)) original.set(el, el.style.cssText);
      }
      for (const [el, css] of original) el.style.cssText = css;
      for (const { element, property, value } of rules) (element as HTMLElement).style.setProperty(property, value);
    },
  };
}
