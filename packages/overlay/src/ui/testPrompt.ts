import { type ChangeSet, formatPrompt } from "@pilot/protocol";
import { copyText } from "../edits/changeSet.ts";

/**
 * TEMPORARY, for testing what reaches the agent (the owner's call,
 * 2026-11-26): a Copy prompt button next to Send and one in the comment
 * panel, copying the prompt the page builds for what would be sent now,
 * without sending anything (PilotSession.previewSend, previewComment). The
 * page's part of a run's prompt (formatPrompt): `npx usepilot` adds where
 * the elements' code is, the project's facts, the skill's start line and the
 * closing instructions. Turn off (or remove, with the buttons) when done:
 * the product has no Copy prompt, everything goes through a run.
 */
export const TEST_PROMPT_COPY = true;

/** Copy the prompt for a change set; whether it was copied. */
export function copyPrompt(changeSet: ChangeSet | null): Promise<boolean> {
  return changeSet ? copyText(formatPrompt(changeSet)) : Promise.resolve(false);
}
