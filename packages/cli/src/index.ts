#!/usr/bin/env node
/**
 * `pilot` CLI entry. `mcp` runs the MCP server and the bridge; the other
 * commands are placeholders until each piece is built (see the Roadmap in
 * the repo README).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPilotServer } from "./mcp.ts";
import { setup } from "./setup.ts";

const HELP = `usepilot: take the controls from your coding agent

Usage: npx usepilot <command>

  setup   Install the /pilot skill for Claude Code (every project)
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
    process.stdout.write(await setup());
    break;
  case "init":
    process.stderr.write(`pilot ${command}: not implemented yet.\n`);
    process.exitCode = 1;
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    process.exitCode = 1;
}
