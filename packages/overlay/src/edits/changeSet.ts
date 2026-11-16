import type { ChangeSet, ElementEdit, StyleChange } from "@pilot/protocol";
import { declaredValue } from "../dom/declared.ts";
import { describeElement } from "../dom/target.ts";
import { sourceOf } from "./clear.ts";
import type { EditHistory } from "./history.ts";

/**
 * The change set for what's in the history now: one edit per element, in the
 * order they were first changed, each with its changes in effect.
 * - `from` is the page's own value, as declared in its CSS (Pilot's preview
 *   is left out of declared values), or "" when the page doesn't set it; with
 *   `source`, where it's declared (a rule's selector, how many elements it
 *   matches, its @media).
 * - A removal says so (`removed`), with the removed value and its source.
 * - `widths`, when the change is for some widths only.
 * Elements still on the page are described afresh; one that isn't (another
 * page of the app, or re-rendered) keeps the description taken when it was
 * first changed. `unsent`: only the changes not sent to the agent yet (what
 * Send hands over); Copy prompt takes everything in effect.
 */
export function buildChangeSet(history: EditHistory, options: { unsent?: boolean; id?: string } = {}): ChangeSet {
  const edits = new Map<Element, ElementEdit>();
  for (const change of history.changes({ unsent: options.unsent })) {
    const { element, property, value, removal, widths } = change;
    let edit = edits.get(element);
    if (!edit) {
      edit = { target: element.isConnected ? describeElement(element) : change.target, changes: [] };
      edits.set(element, edit);
    }
    const page = removal ? null : element.isConnected ? declaredValue(element, property) : null;
    const styleChange: StyleChange = removal
      ? { property, from: removal.from, to: "", removed: true, source: removal.source }
      : { property, from: page?.value ?? "", to: value, ...(page && { source: sourceOf(element, page) }) };
    if (widths) styleChange.widths = widths;
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
