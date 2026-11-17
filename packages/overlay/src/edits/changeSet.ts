import type { AgentRequest, ChangeSet, CommentMessage, ElementEdit, StyleChange } from "@pilot/protocol";
import { pageBreakpoints } from "../dom/breakpoints.ts";
import { declaredValue } from "../dom/declared.ts";
import { describeElement } from "../dom/target.ts";
import { normalizeText, textRunOf } from "../dom/text.ts";
import { sourceOf } from "./clear.ts";
import type { EditHistory, RecordedChange } from "./history.ts";

/**
 * The change set for what's in the history now: one edit per element, in the
 * order they were first changed, each with its changes in effect.
 * - `from` is the page's own value, as declared in its CSS (Pilot's preview
 *   is left out of declared values), or "" when the page doesn't set it; with
 *   `source`, where it's declared (a rule's selector, how many elements it
 *   matches, its @media).
 * - A removal says so (`removed`), with the removed value and its source.
 * - `widths`, when the change is for some widths only.
 * - Text changes are the edit's `texts`: per text run, the page's own text and the new one.
 * Elements still on the page are described afresh; one that isn't (another
 * page of the app, or re-rendered) keeps the description taken when it was
 * first changed. `unsent`: only the changes not sent to the agent yet (what
 * Send hands over); Copy prompt takes everything in effect. `only`: just the
 * changes it picks (Send leaves out the ones that wait for a job).
 */
export function buildChangeSet(
  history: EditHistory,
  options: { unsent?: boolean; id?: string; only?: (change: RecordedChange) => boolean } = {},
): ChangeSet {
  const edits = new Map<Element, ElementEdit>();
  for (const change of history.changes({ unsent: options.unsent })) {
    if (options.only && !options.only(change)) continue;
    const { element, property, value, removal, widths, states } = change;
    let edit = edits.get(element);
    if (!edit) {
      edit = { target: element.isConnected ? describeElement(element) : change.target, changes: [] };
      edits.set(element, edit);
    }
    const run = textRunOf(property);
    if (run !== null) {
      const from = element.isConnected ? history.pageText(element, run) : (change.from ?? "");
      (edit.texts ??= []).push({ from: normalizeText(from), to: normalizeText(value) });
      continue;
    }
    const page = removal ? null : element.isConnected ? declaredValue(element, property, states) : null;
    const styleChange: StyleChange = removal
      ? { property, from: removal.from, to: "", removed: true, source: removal.source }
      : { property, from: page?.value ?? "", to: value, ...(page && { source: sourceOf(element, page) }) };
    if (widths) styleChange.widths = widths;
    if (states?.length) styleChange.states = states;
    edit.changes.push(styleChange);
  }
  return {
    id: options.id ?? `cs_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    page: {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    edits: [...edits.values()],
  };
}

/**
 * A task for the agent about one element, as a change set with no edits
 * (see AgentRequest), with the page's breakpoints: Make responsive, or a
 * comment with its `thread` (the designer's latest message last).
 */
export function buildRequest(
  element: Element,
  kind: AgentRequest["kind"],
  options: { id?: string; thread?: CommentMessage[] } = {},
): ChangeSet {
  const target = describeElement(element);
  const breakpoints = pageBreakpoints();
  const request: AgentRequest =
    kind === "comment" ? { kind, target, breakpoints, thread: options.thread ?? [] } : { kind, target, breakpoints };
  return {
    id: options.id ?? `cs_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    page: {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    edits: [],
    request,
  };
}

/**
 * Put `text` on the clipboard. The async Clipboard API where it's allowed
 * (localhost and https), else the old copy command through a hidden textarea.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
