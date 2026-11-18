#!/usr/bin/env node
/**
 * `usepilot` CLI entry: `init` sets Pilot up in a project for any agent,
 * `mcp` runs the MCP server and the bridge, `setup` installs /pilot for
 * Claude Code.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPilotServer } from "./mcp.ts";
import { AGENT_IDS, type AgentId, init } from "./init.ts";
import { setup } from "./setup.ts";

const HELP = `usepilot: take the controls from your coding agent

Usage: npx usepilot <command>

  init    Set Pilot up in this project for your agent: installs it, connects
          the agent (its MCP server and the pilot skill, nothing for other
          agents), and prints what's left for it (loading Pilot in the app).
          Ask your agent to run it.
          --agent <claude-code|cursor|codex|vscode|other>: the agent running it
          --project: connect the agent in this repo (files to commit, for a
                     team) instead of once for every project on this machine
          --no-install: print the install command instead of running it
  setup   Set up /pilot in Claude Code, for every project on this machine
          (--project: for this repo, to commit, so everyone gets it)
  mcp     Run the MCP server (stdio) agents connect to, and the bridge the
          page talks to. Agents start it: register it with your agent.
  help    Show this message
`;

/** `pilot mcp`: the MCP server on stdio, until the agent closes it. */
async function runMcp(): Promise<void> {
  const { server, bridge } = createPilotServer();
  const close = async () => {
    await bridge.close();
    process.exit(0);
  };
  process.stdin.on("close", close);
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  await server.connect(new StdioServerTransport());
}

const [command = "help"] = process.argv.slice(2);

/** `--agent <id>` or `--agent=<id>`; an unknown one fails, listing the known ones. */
function agentArg(): AgentId | undefined {
  const args = process.argv.slice(3);
  const i = args.findIndex((a) => a === "--agent" || a.startsWith("--agent="));
  if (i < 0) return undefined;
  const value = (args[i]?.includes("=") ? args[i].split("=")[1] : args[i + 1])?.toLowerCase();
  if (value && (AGENT_IDS as readonly string[]).includes(value)) return value as AgentId;
  throw new Error(`--agent takes one of: ${AGENT_IDS.join(", ")}.`);
}

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(HELP);
    break;
  case "mcp":
    await runMcp();
    break;
  case "setup":
    try {
      process.stdout.write(await setup({ project: process.argv.includes("--project") }));
    } catch (error) {
      process.stderr.write(`usepilot setup: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    break;
  case "init":
    try {
      process.stdout.write(
        await init({
          install: !process.argv.includes("--no-install"),
          agent: agentArg(),
          scope: process.argv.includes("--project") ? "project" : "machine",
        }),
      );
    } catch (error) {
      process.stderr.write(`usepilot init: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    process.exitCode = 1;
}
