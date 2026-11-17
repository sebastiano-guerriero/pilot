/**
 * Text edits: the designer double-clicks a text and types (see
 * select/inlineText.ts). The change is recorded like a CSS one, under a
 * reserved property (textProperty), and shown on the page here.
 *
 * What's edited is a **text run**: the text between an element's child
 * elements, one or more text nodes in a row (comments between them don't
 * break it). `<p>A sample page, <code>/pilot</code> launches it.</p>` has
 * two runs, "A sample page, " (0) and " launches it." (1); a text-only
 * element has one, its whole text. Each run is a change of its own: the
 * property is `text` for run 0 and `text:N` for run N.
 *
 * CSS can't replace text, so the preview writes it into the run's own text
 * nodes: the first one gets the text, the others are emptied. The nodes
 * themselves are kept (never replaced or removed), so a framework that holds
 * them (React, Vue…) still finds them, the runs keep their places, and Pilot
 * can tell what the page itself writes into them: a MutationObserver watches
 * the elements Pilot shows text on, and a write that isn't Pilot's is the
 * page's new text (a re-render, hot reload after the agent changed the
 * source). It becomes the page's own text, and Pilot's is shown over it
 * again until the job is checked (edits/verify.ts compares the two).
 */

/** The reserved property of a text change (run 0) in the history. Not a CSS property. */
export const TEXT_PROPERTY = "text";

/** The history property of the element's text run `run`: `text`, `text:1`, `text:2`… */
export function textProperty(run: number): string {
  return run === 0 ? TEXT_PROPERTY : `${TEXT_PROPERTY}:${run}`;
}

/** The text run a history property is for, or null when it isn't a text change. */
export function textRunOf(property: string): number | null {
  if (property === TEXT_PROPERTY) return 0;
  const match = /^text:(\d+)$/.exec(property);
  return match ? Number(match[1]) : null;
}

/** Marks what's being edited inline: its cursor, and no focus ring (the selection outline shows it). */
export const TEXT_EDIT_ATTRIBUTE = "data-pilot-text";

/** A text to show in place of an element's text run. */
export interface TextRule {
  element: Element;
  run: number;
  text: string;
}

/** Where EditHistory shows its text changes. Given every text change in effect, each time. */
export interface TextPreview {
  render(rules: TextRule[]): void;
  /** The text of the element's run `run`, as the page has it without Pilot's (whitespace as is). */
  pageText(element: Element, run: number): string;
}

/** Tags whose text isn't the copy a designer edits inline. */
const NOT_TEXT = new Set(["script", "style", "textarea", "select", "option", "optgroup", "title", "noscript", "template", "iframe"]);

/** The element's text runs: its text nodes, grouped between its child elements. */
export function textRuns(element: Element): Text[][] {
  const runs: Text[][] = [];
  let current: Text[] | null = null;
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!current) runs.push((current = []));
      current.push(node as Text);
    } else if (node.nodeType === Node.ELEMENT_NODE) current = null;
  }
  return runs;
}

const runText = (nodes: readonly Text[]) => nodes.map((n) => n.data).join("");

/** Whether `element` is one the designer can edit text in: HTML, its text the page's copy, not the page's own editor. */
function canEditIn(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && !NOT_TEXT.has(element.localName) && !element.isContentEditable;
}

/**
 * Whether `element`'s content is text only (no element inside it, `<br>`
 * included), some of it visible: the whole element is edited, as itself.
 */
export function isTextOnly(element: Element): element is HTMLElement {
  if (!canEditIn(element)) return false;
  const runs = textRuns(element);
  return runs.length === 1 && element.children.length === 0 && runText(runs[0] as Text[]).trim() !== "";
}

/**
 * The text run of `element` that `node` (the text under the pointer) is
 * in, when the designer can edit it: some of it visible. Null for text in a
 * child element (that one's own run), or an element that can't be edited.
 */
export function textRunAt(element: Element, node: Node | null): { run: number; nodes: Text[] } | null {
  if (!node || node.nodeType !== Node.TEXT_NODE || node.parentNode !== element || !canEditIn(element)) return null;
  const runs = textRuns(element);
  const run = runs.findIndex((nodes) => nodes.includes(node as Text));
  const nodes = runs[run];
  return nodes && runText(nodes).trim() !== "" ? { run, nodes } : null;
}

/** Text as the prompt and the checks compare it: whitespace runs as one space, trimmed, no-break spaces as spaces. */
export function normalizeText(text: string): string {
  return text.replace(/[\s ]+/g, " ").trim();
}

/** The page's own text of each text node Pilot writes into. */
const originals = new WeakMap<Text, string>();
/** The elements Pilot shows text on now: per run, its text nodes and the text shown. */
const shown = new Map<Element, Map<number, { nodes: Text[]; text: string }>>();
/** Elements text is being edited in: what happens in them is the designer typing, not the page. */
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
    for (const [run, entry] of shown.get(element) ?? []) show(element, run, entry.text);
  }
}

function show(element: Element, run: number, text: string): void {
  const runs = shown.get(element) ?? new Map<number, { nodes: Text[]; text: string }>();
  shown.set(element, runs);
  let entry = runs.get(run);
  const nodes = textRuns(element)[run];
  if (!nodes && !(run === 0 && element.childNodes.length === 0)) {
    // The run isn't there anymore (the page changed the element): nothing to show it in.
    if (entry) restore(element, run);
    return;
  }
  const current = nodes ?? [];
  const same = entry && entry.nodes.length === current.length && entry.nodes.every((n, i) => n === current[i]);
  if (!entry || !same) {
    // First time, or the page replaced the run's text nodes: what's in them now is its own text.
    for (const node of current) if (!originals.has(node)) originals.set(node, node.data);
    if (!current.length) {
      const node = document.createTextNode("");
      originals.set(node, "");
      element.append(node);
      current.push(node);
    }
    entry = { nodes: current, text };
    runs.set(run, entry);
  }
  entry.text = text;
  const [first, ...rest] = entry.nodes;
  if (first && first.data !== text) first.data = text;
  for (const node of rest) if (node.data !== "") node.data = "";
}

function restore(element: Element, run: number): void {
  const runs = shown.get(element);
  const entry = runs?.get(run);
  runs?.delete(run);
  if (runs && !runs.size) shown.delete(element);
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
    const wanted = new Map<Element, Map<number, string>>();
    for (const { element, run, text } of rules) {
      if (!element.isConnected) continue;
      if (!wanted.has(element)) wanted.set(element, new Map());
      wanted.get(element)?.set(run, text);
    }
    quiet(() => {
      for (const [element, runs] of [...shown]) {
        if (held.has(element)) continue;
        for (const run of [...runs.keys()]) if (!wanted.get(element)?.has(run)) restore(element, run);
      }
      for (const [element, runs] of wanted) {
        for (const [run, text] of runs) {
          if (held.has(element)) {
            const entry = shown.get(element)?.get(run);
            if (entry) entry.text = text; // shown once the edit is over
          } else show(element, run, text);
        }
      }
    });
    observeShown();
  },
  pageText(element, run) {
    flush();
    const nodes = shown.get(element)?.get(run)?.nodes ?? textRuns(element)[run] ?? [];
    return nodes.map((n) => originals.get(n) ?? n.data).join("");
  },
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
