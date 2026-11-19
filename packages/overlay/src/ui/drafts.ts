import type { ElementTarget } from "@pilot/protocol";
import { describeElement, findTarget } from "../dom/target.ts";

/**
 * Comments being written, kept per element for the tab (sessionStorage):
 * close the comment box (Esc, a click elsewhere), come back to the element,
 * or reload, and what was written is there again. Sending clears it. Found
 * again by the element's target (findTarget), as threads are. Storage can
 * throw (privacy modes): then drafts last as long as the page.
 */
interface Draft {
  target: ElementTarget;
  text: string;
  at: number;
}

const STORAGE_KEY = "pilot:drafts";
/** The most kept, the newest: older ones go. */
const MAX = 20;
/** A draft older than this is let go: a tab come back to much later. */
const KEEP_FOR = 24 * 60 * 60_000;

let drafts: Draft[] | null = null;

function all(): Draft[] {
  if (drafts) return drafts;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as Draft[];
    drafts = Array.isArray(saved)
      ? saved.filter((d) => d?.target?.selector && typeof d.text === "string" && Date.now() - d.at < KEEP_FOR)
      : [];
  } catch {
    drafts = [];
  }
  return drafts;
}

function save(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all()));
  } catch {
    // Kept for this page load only.
  }
}

/** What was being written on `element`, if anything. */
export function draftFor(element: Element): string | undefined {
  return all().find((d) => findTarget(d.target) === element)?.text;
}

/** Keeps `text` as `element`'s draft (or lets it go, when empty). */
export function keepDraft(element: Element, text: string): void {
  const others = all().filter((d) => findTarget(d.target) !== element);
  drafts = text.trim() ? [{ target: describeElement(element), text, at: Date.now() }, ...others].slice(0, MAX) : others;
  save();
}

/** For tests: forget what's loaded, so the next read comes from storage. */
export function resetDrafts(): void {
  drafts = null;
}
