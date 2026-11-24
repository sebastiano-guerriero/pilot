import type { CommentAction } from "@pilot/protocol";

/**
 * What the comment box's `/` menu offers: the designer's skills (see
 * matchSkills), after Pilot's own two, listed as skills of Pilot's (its
 * name in the row's corner, where a skill's author goes): Props, on a
 * component's instance, and Make responsive. The rest of Pilot's tasks
 * (Break and fix) and the previews of what was planned left the menu (the
 * owner's call, 2026-11-24): the designer's skills, their team's own
 * workflows, are what `/` is for. `/` at the start of any word opens it
 * (not in a word: "and/or", URLs), as `@` does. Picked, it becomes a chip
 * at the start of the message, its `/word` leaves the text; the words, and
 * any files, go with it. Pilot's are sent as a job of their own (see
 * PilotSession.comment), shown in the thread as the designer's message,
 * with the agent's reply after it.
 */
export interface Action {
  id: CommentAction;
  /** What's typed after `/` to find it (a word of the name works too); not shown. */
  command: string;
  name: string;
  description: string;
  /** Offered only when the selection is a component's instance (its top-level element). */
  forComponent?: boolean;
}

/** Who made Pilot's own (the row's corner, as a skill's author). */
export const PILOT_AUTHOR = "Pilot";

export const ACTIONS: Action[] = [
  {
    id: "props",
    command: "props",
    name: "Props",
    description: "Change the component's props from a list",
    forComponent: true,
  },
  {
    id: "responsive",
    command: "responsive",
    name: "Make responsive",
    description: "Make it work at every screen width",
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
export function matchActions(typed: string, context: { component?: boolean } = {}): Action[] {
  const query = typed.toLowerCase();
  // A component's (Props) only on a component's instance, and first there: it's what that selection is most likely for.
  const offered = ACTIONS.filter((a) => !a.forComponent || context.component);
  if (!query) return offered;
  const words = (a: Action) => [a.command, ...a.name.toLowerCase().split(/\s+/)];
  const starts = offered.filter((a) => words(a).some((w) => w.startsWith(query)));
  const contains = offered.filter((a) => !starts.includes(a) && (a.command.includes(query) || a.name.toLowerCase().includes(query)));
  return [...starts, ...contains];
}

/** What's typed for an action (`props`; a task asked before they left the menu, by its kind): a sent message shows it as `/props`. */
export function actionCommand(id: CommentAction): string {
  return ACTIONS.find((a) => a.id === id)?.command ?? id;
}

/** An action's name, for its chip ("Props"). */
export function actionName(id: CommentAction): string {
  return ACTIONS.find((a) => a.id === id)?.name ?? id;
}

/**
 * The agent's skills for what's typed after `/`, listed after Props (on a
 * component), in the same rows: by name, those whose name (or a word of it: `ui` finds
 * `better-ui`) starts with it first. Names only: a description says what a
 * skill is for, not what it's called.
 */
export function matchSkills<T extends { name: string }>(skills: readonly T[], typed: string): T[] {
  const query = typed.toLowerCase();
  if (!query) return [...skills];
  const words = (name: string) => [name.toLowerCase(), ...name.toLowerCase().split(/[-_:.\s]+/)];
  const starts = skills.filter((s) => words(s.name).some((w) => w.startsWith(query)));
  const contains = skills.filter((s) => !starts.includes(s) && s.name.toLowerCase().includes(query));
  return [...starts, ...contains];
}
