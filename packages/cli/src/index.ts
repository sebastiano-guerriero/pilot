#!/usr/bin/env node
/**
 * `pilot` CLI entry. Commands are placeholders until each piece is built;
 * see the Roadmap in the repo README.
 */

const HELP = `pilot: take the controls from your coding agent

Usage:
  pilot init     Add Pilot to this project (dev-only overlay + agent skill)   [planned]
  pilot bridge   Run the local bridge the overlay sends edits to               [planned]
  pilot mcp      Run the MCP server (stdio) that agents connect to             [planned]
  pilot help     Show this message
`;

const [command = "help"] = process.argv.slice(2);

switch (command) {
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(HELP);
    break;
  case "init":
  case "bridge":
  case "mcp":
    process.stderr.write(`pilot ${command}: not implemented yet.\n`);
    process.exitCode = 1;
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    process.exitCode = 1;
}
