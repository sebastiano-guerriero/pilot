import { componentName } from "./component.ts";
import { elementName } from "./name.ts";
import { isEditable } from "./target.ts";
import { pageTokens, type Token } from "./tokens.ts";

/**
 * What `@` in the comment box can mention, from the page as it is now:
 * its tokens (CSS variables, dom/tokens.ts), its components (each by the
 * first element it renders at its top level, dom/component.ts) and its
 * named elements (an id or a naming attribute, as the hover label names
 * them: `section#features`). Plain tags (`div`) aren't listed: there are
 * too many, and they name nothing. Read when the list opens, never stored.
 */
export interface Mentionables {
  tokens: Token[];
  components: Array<{ name: string; element: Element }>;
  elements: Array<{ name: string; element: Element }>;
}

/** Elements looked at, at most: a page's first ones, in document order. */
const MAX_ELEMENTS = 5000;

export function mentionables(nameAttributes: readonly string[] = [], doc: Document = document): Mentionables {
  const components = new Map<string, Element>();
  const elements = new Map<string, Element>();
  const all = doc.body ? Array.from(doc.body.querySelectorAll("*")).slice(0, MAX_ELEMENTS) : [];
  for (const el of all) {
    if (!isEditable(el) || el.closest("pilot-root")) continue;
    const component = componentName(el);
    if (component) {
      if (!components.has(component)) components.set(component, el);
      continue;
    }
    const name = elementName(el, nameAttributes);
    if ((name.includes("#") || name.includes("[")) && !elements.has(name)) elements.set(name, el);
  }
  return {
    tokens: pageTokens(doc),
    components: [...components].map(([name, element]) => ({ name, element })),
    elements: [...elements].map(([name, element]) => ({ name, element })),
  };
}
