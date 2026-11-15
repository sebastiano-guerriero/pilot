import type { ElementTarget } from "@pilot/protocol";
import { type EditableElement, isEditable } from "../dom/target.ts";
import { EditHistory, type SavedHistory } from "./history.ts";

/**
 * Edits survive reloads. A dev session reloads all the time (the agent
 * editing files, HMR full reloads, the designer refreshing): losing the
 * changes made so far would make Pilot useless. So the history is saved in
 * the tab's sessionStorage after every change, undo and redo, and restored
 * when Pilot mounts again: the preview comes back, undo and redo still work,
 * and Copy prompt still has everything.
 *
 * Each change keeps how to find its element (`target.selector`, unique when
 * it was taken) and the page it was made on. On restore, an element found on
 * this page gets its changes back; one that isn't (another page of the app,
 * or not rendered yet) gets a detached stand-in, so its changes are kept, in
 * the prompt too, and they find the element again later (`reattach`: on a
 * launch, a selection, or navigation).
 *
 * Per tab (sessionStorage): a new tab starts clean, closing the tab ends the
 * session. Storage can throw (privacy modes, quota): Pilot then works without
 * it for this page load.
 */
const STORAGE_KEY = "pilot:edits";

/** The live element for a saved change, or a detached stand-in. */
export function resolveTarget(target: ElementTarget, path: string): EditableElement {
  if (path === location.pathname) {
    try {
      const element = document.querySelector(target.selector);
      if (isEditable(element)) return element;
    } catch {
      // A selector this document can't parse: treat as not found.
    }
  }
  return document.createElement(target.tag || "div");
}

/** A history restored from this tab's last session (empty when there's none), saving itself from now on. */
export function persistentHistory(): EditHistory {
  const history = new EditHistory();
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) history.load(JSON.parse(saved) as SavedHistory, resolveTarget);
  } catch {
    // Unreadable or unavailable: start empty.
  }
  history.subscribe(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.serialize()));
    } catch {
      // Not saved; the edits still work for this page load.
    }
  });
  return history;
}
