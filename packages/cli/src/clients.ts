import type { AgentId } from "./init.ts";

/**
 * How each client loads a new Pilot: when its server process starts. Some
 * start one per chat (Claude Code, Codex: a new chat is enough); others keep
 * one for all their chats while the app runs (Cursor, VS Code: the server
 * has to be restarted). `update` and `pilot_launch` say it, so a new
 * version doesn't wait for the app to be quit.
 */
export const RESTART: Record<AgentId, string> = {
  "claude-code": "In Claude Code, open a new chat (or run `/mcp` and reconnect `pilot`).",
  cursor:
    "In Cursor, restart Pilot's server: Cursor Settings, MCP section, switch `pilot` off and on. A new chat isn't enough: Cursor keeps one server for all its chats.",
  vscode: "In VS Code, restart Pilot's server: run **MCP: List Servers** from the Command Palette, pick `pilot`, then **Restart Server**.",
  codex: "In Codex, start a new session.",
  other: "Restart Pilot's server in your agent (its MCP settings), or restart the agent.",
};

/** Which client an MCP client name is (`clientInfo.name`), when Pilot knows it. */
export function clientOf(name: string | undefined): AgentId | null {
  const n = name?.toLowerCase() ?? "";
  if (n.startsWith("claude-code") || n === "claude-ai") return "claude-code";
  if (n.startsWith("cursor")) return "cursor";
  if (n === "vscode" || n.includes("visual studio code")) return "vscode";
  if (n.startsWith("codex")) return "codex";
  return null;
}
