import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MCP_SERVER, setup } from "./setup.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pilot-setup-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const read = async (...path: string[]) => readFile(join(dir, ...path), "utf8");

describe("usepilot setup", () => {
  it("for this machine: the skill in the home folder, and the command to register the server", async () => {
    const out = await setup({ home: dir });
    expect(await read(".claude", "skills", "pilot", "SKILL.md")).toContain("name: pilot");
    expect(out).toContain("claude mcp add --scope user pilot -- npx -y usepilot mcp");
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
  });

  it("--project: the skill and .mcp.json in the repo, to commit", async () => {
    await writeFile(join(dir, "package.json"), "{}");
    const out = await setup({ project: true, cwd: dir });
    expect(await read(".claude", "skills", "pilot", "SKILL.md")).toContain("name: pilot");
    expect(JSON.parse(await read(".mcp.json"))).toEqual({ mcpServers: { pilot: MCP_SERVER } });
    expect(out).toContain(".claude/skills/pilot/SKILL.md");
    expect(out).toContain("Commit both");
    expect(out).not.toContain("No package.json");
  });

  it("--project keeps the servers and settings already in .mcp.json", async () => {
    const existing = { mcpServers: { other: { command: "other-server" } }, note: "keep me" };
    await writeFile(join(dir, ".mcp.json"), JSON.stringify(existing));
    await setup({ project: true, cwd: dir });
    expect(JSON.parse(await read(".mcp.json"))).toEqual({ ...existing, mcpServers: { other: { command: "other-server" }, pilot: MCP_SERVER } });
    // Again: nothing doubled, and it says so.
    expect(await setup({ project: true, cwd: dir })).toContain("it was there: updated");
  });

  it("--project stops on an .mcp.json it can't read, without touching it", async () => {
    await writeFile(join(dir, ".mcp.json"), "{ not json");
    await expect(setup({ project: true, cwd: dir })).rejects.toThrow(/isn't valid JSON/);
    expect(await read(".mcp.json")).toBe("{ not json");
  });

  it("--project outside the app's folder says so", async () => {
    expect(await setup({ project: true, cwd: dir })).toContain("No package.json here");
  });
});
