import type { ElementTarget } from "@pilot/protocol";
import type { Tool } from "./components/Toolbar/Toolbar.tsx";

/**
 * What the designer had open, kept through a reload the agent causes (a
 * full page reload after its edit): the tool and the selected elements (as
 * targets, found again with findTarget). The comment being written comes
 * back with its element (drafts.ts).
 * Per tab (sessionStorage), like the history; storage can throw (privacy
 * modes): then nothing is kept, and a reload starts with nothing open.
 */
export interface KeptSelection {
  tool: Exclude<Tool, null>;
  /** The selected elements, the first one first. */
  targets: ElementTarget[];
  /** When it was saved: an old one (the tab came back much later) isn't restored. */
  at: number;
}

const STORAGE_KEY = "pilot:selection";
/** A reload the agent causes is seconds away; past this, what was open is history. */
const KEEP_FOR = 10 * 60_000;

export function saveSelection(kept: Omit<KeptSelection, "at"> | null): void {
  try {
    if (kept?.targets.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...kept, at: Date.now() }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not kept: a reload starts with nothing open.
  }
}

export function loadSelection(now = Date.now()): KeptSelection | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as KeptSelection | null;
    if (!kept || !Array.isArray(kept.targets) || !kept.targets.length || (kept.tool !== "select" && kept.tool !== "comment")) return null;
    return now - (kept.at ?? 0) < KEEP_FOR ? kept : null;
  } catch {
    return null;
  }
}
