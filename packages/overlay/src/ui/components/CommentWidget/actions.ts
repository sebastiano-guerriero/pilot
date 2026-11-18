import type { CommentAction } from "@pilot/protocol";

/**
 * What the comment box's `/` menu offers: tasks for the agent about the
 * element. Picked, an action becomes a chip at the start of the message;
 * the words typed after it, and any files, go with it. Each is sent as a
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

/** The message starts with `/` (and nothing else yet but the action's name): the menu is open. */
export function isActionQuery(text: string): boolean {
  return /^\/\S*$/.test(text);
}

/** The actions for what's typed after `/`: by command or name, those that start with it first. */
export function matchActions(text: string): Action[] {
  const query = text.slice(1).toLowerCase();
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
