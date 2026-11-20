#!/usr/bin/env node
/**
 * `pnpm link-experiment <project folder>`: makes a project use this repo's
 * Pilot while you work on it, with no release in between. It prints:
 * - the loader line for the app, which loads the overlay from this repo's
 *   dev server (port 5199) when it runs, the npm package when not;
 * - the command that runs Pilot for the project from this repo's build
 *   (packages/cli/dist, kept current by `pnpm dev:experiments`), in place
 *   of `npx usepilot`.
 * It also removes the project's links to the old chat setup (`.mcp.json`'s
 * `pilot` server, the `.claude/skills/pilot` link), from before agent runs.
 *
 * `--unlink` says how to go back to the published package.
 */
import { existsSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const unlink = args.includes("--unlink");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("Usage: pnpm link-experiment <project folder> [--unlink]");
  process.exit(1);
}
const project = resolve(process.cwd(), target);
if (!existsSync(project)) {
  console.error(`No folder at ${project}`);
  process.exit(1);
}

const cli = join(repo, "packages", "cli", "dist", "index.js");

// The old chat setup this script made: Pilot's server in .mcp.json, the skill link.
const mcpFile = join(project, ".mcp.json");
if (existsSync(mcpFile)) {
  try {
    const config = JSON.parse(readFileSync(mcpFile, "utf8") || "{}");
    if (config.mcpServers?.pilot) {
      delete config.mcpServers.pilot;
      writeFileSync(mcpFile, `${JSON.stringify(config, null, 2)}\n`);
      console.log(`Removed the old pilot server from ${mcpFile}.`);
    }
  } catch {
    // Not JSON: not ours to fix.
  }
}
const skillLink = join(project, ".claude", "skills", "pilot");
if (isLink(skillLink)) {
  unlinkSync(skillLink);
  console.log(`Removed the old /pilot skill link (${skillLink}).`);
}

if (unlink) {
  console.log(`${project}: back to the published Pilot.
In the app's loader, import "usepilot/auto" only (drop the http://localhost:5199 import),
and run Pilot for it with \`npx usepilot\` in ${project}.`);
} else {
  console.log(`${project} can use this repo's Pilot.

In the app, load Pilot in development like this (Vite):

  if (import.meta.env.DEV) {
    import(/* @vite-ignore */ "http://localhost:5199/src/auto.ts").catch(() => import("usepilot/auto"));
  }

Then run \`pnpm dev:experiments\` in ${repo}, and Pilot for the project from this repo's build
(in place of \`npx usepilot\`), in ${project}:

  node ${cli}

Changes to the page side show on save; to Pilot's process (the runner, the hub, the prompts),
after you restart that command.`);
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
