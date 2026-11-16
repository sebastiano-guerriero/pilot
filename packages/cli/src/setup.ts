import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import skill from "../../../skills/pilot/SKILL.md";

/**
 * `pilot setup`: makes `/pilot` available in every Claude Code chat, in every
 * project: installs the skill in the user's skills folder, and prints the
 * command that registers Pilot's MCP server for all projects (it's the user's
 * agent configuration: they run it).
 */
export async function setup(): Promise<string> {
  const dir = join(homedir(), ".claude", "skills", "pilot");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "SKILL.md");
  await writeFile(file, skill);
  return `Installed the /pilot skill: ${file}

Now register Pilot's MCP server with Claude Code, once, for every project:

  claude mcp add --scope user pilot -- npx -y usepilot mcp

Then, in any Claude Code chat: /pilot
`;
}
