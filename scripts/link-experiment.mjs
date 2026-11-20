#!/usr/bin/env node
/**
 * `pnpm link-experiment <project folder>`: makes a project use this repo's
 * Pilot while you work on it, with no release in between.
 * - Its `.mcp.json` starts Pilot's MCP server from this repo's build
 *   (packages/cli/dist, kept current by `pnpm dev:experiments`). Other
 *   servers in the file are kept.
 * - Its `/pilot` skill is a link to skills/pilot here, so edits show up in
 *   the next chat.
 * - It prints the loader line for the app, which loads the overlay from
 *   this repo's dev server (port 5199) when it runs, the npm package when not.
 *
 * `--unlink` puts the project back on the published package: `npx -y
 * usepilot mcp`, and a copy of the skill instead of the link.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
const server = unlink ? { command: "npx", args: ["-y", "usepilot@latest", "mcp"] } : { command: "node", args: [cli, "mcp"] };

// .mcp.json: Pilot's entry, everything else kept.
const mcpFile = join(project, ".mcp.json");
let config = {};
if (existsSync(mcpFile)) {
  try {
    config = JSON.parse(readFileSync(mcpFile, "utf8") || "{}");
  } catch {
    console.error(`${mcpFile} isn't valid JSON: fix it, then run this again.`);
    process.exit(1);
  }
}
config.mcpServers = { ...(config.mcpServers ?? {}), pilot: server };
writeFileSync(mcpFile, `${JSON.stringify(config, null, 2)}\n`);

// The skill: a link to this repo's (or, unlinking, a copy of it).
const skillDir = join(project, ".claude", "skills", "pilot");
const source = join(repo, "skills", "pilot");
if (existsSync(skillDir) || isLink(skillDir)) {
  const ours =
    isLink(skillDir) ||
    readdirSync(skillDir).every((f) => f === "SKILL.md") && /^name: pilot$/m.test(readFileSync(join(skillDir, "SKILL.md"), "utf8"));
  if (!ours) {
    console.error(`${skillDir} has files that aren't Pilot's skill: move them, then run this again.`);
    process.exit(1);
  }
  rmSync(skillDir, { recursive: true, force: true });
}
mkdirSync(dirname(skillDir), { recursive: true });
if (unlink) cpSync(source, skillDir, { recursive: true });
else symlinkSync(source, skillDir, "dir");

const rel = (p) => relative(project, p);
if (unlink) {
  console.log(`${project} uses the published Pilot again:
  ${rel(mcpFile)}: npx -y usepilot@latest mcp
  ${rel(skillDir)}: a copy of the skill

In the app's loader, import "usepilot/auto" only (drop the http://localhost:5199 import).
Start a new chat (or reconnect the pilot MCP server) for it to take effect.`);
} else {
  console.log(`${project} uses this repo's Pilot:
  ${rel(mcpFile)}: node ${cli} mcp
  ${rel(skillDir)} → ${source}

In the app, load Pilot in development like this (Vite):

  if (import.meta.env.DEV) {
    import(/* @vite-ignore */ "http://localhost:5199/src/auto.ts").catch(() => import("usepilot/auto"));
  }

Then run \`pnpm dev:experiments\` in ${repo}, and start a new chat in the project (or
reconnect the pilot MCP server) to pick up the local server. Changes to the
page side show on save; to the server side, after a reconnect.`);
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
