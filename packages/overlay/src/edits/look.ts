import { editors } from "../editors/registry.ts";
import { propertiesOf } from "../editors/types.ts";
import type { EditHistory } from "./history.ts";

/**
 * How elements look, as far as the property dialog can change it: the
 * computed value of every property its editors write, with the page's own
 * CSS only (Pilot's previews left out, EditHistory.probe). Plain data, saved
 * with the job.
 *
 * What it's for: a thread's job, sent, notes its elements' look; after the
 * agent's reply, Pilot compares it with the look once the code is on the
 * page (`changedLook`). Only a job that changed it gets **Edit manually**
 * under its reply: the dialog can tweak what the agent chose there. A reply
 * that changed nothing, or only what the dialog can't edit (an icon swapped
 * for another of the same size, text, props), doesn't.
 */
export type Look = Record<string, string>;

/** The properties the dialog's editors write (and read): what Edit manually could tweak. */
let properties: string[] | null = null;
function lookProperties(): string[] {
  properties ??= [...new Set(editors.flatMap(propertiesOf))];
  return properties;
}

/** Each element's look (see Look), in order; null for one that isn't on the page. */
export function looksOf(history: EditHistory, elements: Array<Element | null>): Array<Look | null> {
  const props = lookProperties();
  return history.probe([], () =>
    elements.map((element) => {
      if (!element?.isConnected) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p).trim()]));
    }),
  );
}

/** Whether any element's look changed: a property with another value now. Elements missing either time don't count. */
export function changedLook(before: Array<Look | null>, after: Array<Look | null>): boolean {
  return before.some((b, i) => {
    const a = after[i];
    if (!b || !a) return false;
    return Object.keys(b).some((p) => a[p] !== b[p]);
  });
}
