/**
 * Text edits: the designer double-clicks a text element and types (see
 * select/inlineText.ts). The change is recorded like a CSS one, under the
 * reserved property TEXT_PROPERTY, and shown on the page here.
 *
 * CSS can't replace an element's text, so the preview writes it into the
 * element's own text nodes: the first one gets the text, the others are
 * emptied. The nodes themselves are kept (never replaced), so a framework
 * that holds them (React, Vue…) still finds them, and Pilot can tell what
 * the page itself writes into them: a MutationObserver watches the elements
 * Pilot shows text on, and a write that isn't Pilot's is the page's new
 * text (a re-render, hot reload after the agent changed the source). It
 * becomes the page's own text, and Pilot's is shown over it again until the
 * job is checked (edits/verify.ts compares the two).
 */

/** The reserved property of a text change in the history and the change set. Not a CSS property. */
export const TEXT_PROPERTY = "text";

/** Marks the element being edited inline: its cursor, and no focus ring (the selection outline shows it). */
export const TEXT_EDIT_ATTRIBUTE = "data-pilot-text";

/** A text to show on an element in place of its own. */
export interface TextRule {
  element: Element;
  text: string;
}

/** Where EditHistory shows its text changes. Given every text change in effect, each time. */
export interface TextPreview {
  render(rules: TextRule[]): void;
  /** The element's own text, as the page has it without Pilot's (whitespace as is). */
  pageText(element: Element): string;
}

/** Tags whose text isn't the copy a designer edits inline. */
const NOT_TEXT = new Set(["script", "style", "textarea", "select", "option", "optgroup", "title", "noscript", "template", "iframe"]);

/**
 * Whether the designer can edit `element`'s text inline: an HTML element
 * whose content is text only (no element inside it, `<br>` included), and
 * some of it visible (not just whitespace). A paragraph with a `<strong>`
 * inside isn't; its parts are, one at a time.
 */
export function isTextOnly(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || NOT_TEXT.has(element.localName)) return false;
  if (element.isContentEditable) return false; // the page's own editor
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) return false;
    if (node.nodeType === Node.TEXT_NODE) text += (node as Text).data;
  }
  return text.trim() !== "";
}

/** Text as the prompt and the checks compare it: whitespace runs as one space, trimmed, no-break spaces as spaces. */
export function normalizeText(text: string): string {
  return text.replace(/[\s ]+/g, " ").trim();
}

/** The page's own text of each text node Pilot writes into. */
const originals = new WeakMap<Text, string>();
/** The elements Pilot shows text on now: their text nodes, and the text shown. */
const shown = new Map<Element, { nodes: Text[]; text: string }>();
/** Elements being edited inline: what happens in them is the designer typing, not the page. */
const held = new Set<Element>();

let observer: MutationObserver | null = null;
const getObserver = () => {
  if (!observer && typeof MutationObserver !== "undefined") observer = new MutationObserver((records) => quiet(() => handle(records)));
  return observer;
};

/** Runs Pilot's own writes: the mutations they cause aren't the page's. */
function quiet(write: () => void): void {
  write();
  observer?.takeRecords();
}

/** Takes in what the page wrote since the last look (the observer's callback is async). */
function flush(): void {
  const records = observer?.takeRecords();
  if (records?.length) quiet(() => handle(records));
}

/**
 * The page wrote into an element Pilot shows text on: a text node's new data
 * is the page's own text now, and new nodes are taken in (show() does). Then
 * Pilot's text is shown again.
 */
function handle(records: MutationRecord[]): void {
  const touched = new Set<Element>();
  for (const record of records) {
    const element = [...shown.keys()].find((e) => e === record.target || e.contains(record.target));
    if (!element || held.has(element)) continue;
    if (record.type === "characterData" && record.target instanceof Text) originals.set(record.target, record.target.data);
    touched.add(element);
  }
  for (const element of touched) {
    const entry = shown.get(element);
    if (entry) show(element, entry.text);
  }
}

const ownTextNodes = (element: Element): Text[] => [...element.childNodes].filter((n): n is Text => n.nodeType === Node.TEXT_NODE);

function show(element: Element, text: string): void {
  let entry = shown.get(element);
  const nodes = ownTextNodes(element);
  const same = entry && entry.nodes.length === nodes.length && entry.nodes.every((n, i) => n === nodes[i]);
  if (!entry || !same) {
    // First time, or the page replaced its text nodes: what's in them now is its own text.
    for (const node of nodes) if (!originals.has(node)) originals.set(node, node.data);
    if (!nodes.length) {
      const node = document.createTextNode("");
      originals.set(node, "");
      element.append(node);
      nodes.push(node);
    }
    entry = { nodes, text };
    shown.set(element, entry);
  }
  entry.text = text;
  const [first, ...rest] = entry.nodes;
  if (first && first.data !== text) first.data = text;
  for (const node of rest) if (node.data !== "") node.data = "";
}

function restore(element: Element): void {
  const entry = shown.get(element);
  shown.delete(element);
  for (const node of entry?.nodes ?? []) {
    const own = originals.get(node);
    originals.delete(node);
    if (own !== undefined && node.data !== own) node.data = own;
  }
}

function observeShown(): void {
  const obs = getObserver();
  if (!obs) return;
  obs.disconnect();
  for (const element of shown.keys()) obs.observe(element, { characterData: true, childList: true, subtree: true });
}

/** The DOM text preview. One per page, like the stylesheet preview. */
export const domTextPreview: TextPreview = {
  render(rules) {
    flush();
    const wanted = new Map<Element, string>();
    for (const rule of rules) if (rule.element.isConnected) wanted.set(rule.element, rule.text);
    quiet(() => {
      for (const element of [...shown.keys()]) if (!wanted.has(element) && !held.has(element)) restore(element);
      for (const [element, text] of wanted) {
        if (held.has(element)) {
          const entry = shown.get(element);
          if (entry) entry.text = text; // shown once the edit is over
        } else show(element, text);
      }
    });
    observeShown();
  },
  pageText: pageTextContent,
};

/**
 * `element`'s text content as the page has it, Pilot's text previews left
 * out: what the change set describes it by (dom/target.ts), so the agent
 * greps for text that's in the source.
 */
export function pageTextContent(element: Element): string {
  flush();
  let text = "";
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const own = originals.get(node as Text);
    text += own ?? (node as Text).data;
  }
  return text;
}

/**
 * The designer is typing in `element` (inline editing): what changes in it
 * isn't the page's, and the preview leaves it alone. Call the returned
 * function once the element is back as it was before the edit; the
 * preview then shows what's in effect.
 */
export function holdText(element: Element): () => void {
  held.add(element);
  return () => {
    flush(); // the edit's own mutations, still ignored
    held.delete(element);
  };
}
