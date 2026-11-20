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
  /** A preview's id isn't a CommentAction: it's never sent. */
  id: CommentAction | `preview-${string}`;
  /** What's typed after `/` to find it (a word of the name works too); not shown. */
  command: string;
  name: string;
  description: string;
  /** Offered only when the selection is a component's instance (its top-level element). */
  forComponent?: boolean;
  /**
   * Listed, not built yet (the roadmap): shown in the menu (the owner's video,
   * and a look at what's coming), but picking it does nothing.
   */
  preview?: boolean;
}

export const ACTIONS: Action[] = [
  {
    id: "responsive",
    command: "responsive",
    name: "Make responsive",
    description: "Make it work at every screen width",
  },
  {
    id: "preview-container",
    command: "container",
    name: "Fit its container",
    description: "Adapt to the space it's in, with container queries",
    preview: true,
  },
  {
    id: "preview-a11y",
    command: "a11y",
    name: "Check accessibility",
    description: "Fix contrast, labels, focus and keyboard use",
    preview: true,
  },
  {
    id: "preview-variations",
    command: "variations",
    name: "Explore variations",
    description: "Try a few takes on it, to pick from",
    preview: true,
  },
  {
    id: "break-and-fix",
    command: "break",
    name: "Break and fix",
    description: "Try odd content and fix what breaks",
  },
  {
    id: "preview-tokens",
    command: "tokens",
    name: "Use design tokens",
    description: "Swap hardcoded values for the project's tokens",
    preview: true,
  },
  {
    id: "preview-states",
    command: "states",
    name: "Add states",
    description: "Design its hover, focus and disabled looks",
    preview: true,
  },
  {
    id: "preview-dark",
    command: "dark",
    name: "Support dark mode",
    description: "Make it work in dark mode",
    preview: true,
  },
  {
    id: "preview-motion",
    command: "motion",
    name: "Add motion",
    description: "A subtle transition or entrance",
    preview: true,
  },
  {
    id: "props",
    command: "props",
    name: "Props",
    description: "Change the component's props from a list",
    forComponent: true,
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
  // A component selected: its own actions (Props) first, then the rest.
  const offered = context.component
    ? [...ACTIONS.filter((a) => a.forComponent), ...ACTIONS.filter((a) => !a.forComponent)]
    : ACTIONS.filter((a) => !a.forComponent);
  if (!query) return offered;
  const words = (a: Action) => [a.command, ...a.name.toLowerCase().split(/\s+/)];
  const starts = offered.filter((a) => words(a).some((w) => w.startsWith(query)));
  const contains = offered.filter((a) => !starts.includes(a) && (a.command.includes(query) || a.name.toLowerCase().includes(query)));
  return [...starts, ...contains];
}

/** What's typed for an action (`responsive`, `break`): a sent message shows it as `/responsive`. */
export function actionCommand(id: CommentAction): string {
  return ACTIONS.find((a) => a.id === id)?.command ?? id;
}

/** An action's name, for its chip ("Make responsive"). */
export function actionName(id: CommentAction): string {
  return ACTIONS.find((a) => a.id === id)?.name ?? id;
}
