import type { CommentAction } from "@pilot/protocol";

/**
 * What the comment box's `/` menu offers: tasks for the agent about the
 * element. `/` at the start of any word opens it (not in a word: "and/or",
 * URLs), as `@` does. Picked, an action becomes a chip at the start of the
 * message, its `/word` leaves the text; the words, and any files, go with it. Each is sent as a
 * job of its own (see PilotSession.comment), and shows in the thread as
 * the designer's message, with the agent's reply after it.
 */
export interface Action {
  id: CommentAction;
  /** What's typed after `/` to find it (a word of the name works too); not shown. */
  command: string;
  name: string;
  description: string;
}

export const ACTIONS: Action[] = [
  {
    id: "responsive",
    command: "responsive",
    name: "Make responsive",
    description: "Make it work at every screen width",
  },
  {
    id: "break-and-fix",
    command: "break",
    name: "Break and fix",
    description: "Try odd content and fix what breaks",
  },
];

/** The `/` being typed right before the caret (at the start, or after a space), and what follows it; null otherwise. */
export function actionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)\/([^\s/]*)$/.exec(before);
  if (!m) return null;
  return { start: before.length - (m[2] as string).length - 1, query: m[2] as string };
}

/** `text` without the `/query` at `at` (it became the chip), one space kept where it was; and where the caret goes. */
export function withoutQuery(text: string, at: { start: number; query: string }): { text: string; caret: number } {
  let before = text.slice(0, at.start);
  let after = text.slice(at.start + 1 + at.query.length);
  if (!before.trim()) before = "";
  if (before.endsWith(" ") && after.startsWith(" ")) after = after.slice(1);
  if (!before) after = after.trimStart();
  return { text: before + after, caret: before.length };
}

/** The actions for what's typed after `/`: by command or name, those that start with it first. */
export function matchActions(typed: string): Action[] {
  const query = typed.toLowerCase();
  if (!query) return ACTIONS;
  const words = (a: Action) => [a.command, ...a.name.toLowerCase().split(/\s+/)];
  const starts = ACTIONS.filter((a) => words(a).some((w) => w.startsWith(query)));
  const contains = ACTIONS.filter((a) => !starts.includes(a) && (a.command.includes(query) || a.name.toLowerCase().includes(query)));
  return [...starts, ...contains];
}

/** An action's name, for its chip ("Make responsive"). */
export function actionName(id: CommentAction): string {
  return ACTIONS.find((a) => a.id === id)?.name ?? id;
}
