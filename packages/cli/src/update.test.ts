import { existsSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BRIDGE_VERSION } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { init } from "./init.ts";
import { update } from "./update.ts";
import { VERSION } from "./version.ts";

let dir: string;
/** The user's home folder, for each test its own: update never touches the real one. */
let home: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pilot-update-"));
  home = await mkdtemp(join(tmpdir(), "pilot-home-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function files(tree: Record<string, string | object>, base = dir): Promise<void> {
  for (const [path, content] of Object.entries(tree)) {
    const file = join(base, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
}

/** An app with Pilot `version` installed (its bundle on bridge `bridge`). */
const app = (version: string, bridge = BRIDGE_VERSION) => ({
  ".git/HEAD": "ref: refs/heads/main",
  "package.json": { devDependencies: { usepilot: `^${version}`, vite: "^7" } },
  "package-lock.json": "{}",
  "node_modules/usepilot/package.json": { name: "usepilot", version },
  "node_modules/usepilot/cli/index.js": `const BRIDGE_VERSION = ${bridge};`,
});

/** Records the commands; installing "updates" the package to VERSION, like npm would. */
function installer(ok = true) {
  const calls: string[] = [];
  const run = (command: string, args: string[]) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (ok) writeFileSync(join(dir, "node_modules/usepilot/package.json"), JSON.stringify({ name: "usepilot", version: VERSION }));
    return ok;
  };
  return { calls, run };
}

describe("usepilot update", () => {
  it("installs the latest with the project's package manager, updates the skill where init put it, and says what's next", async () => {
    await files(app("0.6.0"));
    await files({ ".claude/skills/pilot/SKILL.md": "old skill" }, home);
    await files({ ".agents/skills/pilot/SKILL.md": "old project skill" });
    const { calls, run } = installer();
    const out = await update({ cwd: dir, run, home });
    expect(calls).toEqual(["npm install -D usepilot@latest"]);
    expect(await readFile(join(home, ".claude/skills/pilot/SKILL.md"), "utf8")).not.toBe("old skill");
    expect(await readFile(join(dir, ".agents/skills/pilot/SKILL.md"), "utf8")).not.toBe("old project skill");
    // No skill where there was none: update doesn't set up new agents.
    expect(existsSync(join(home, ".cursor/skills/pilot"))).toBe(false);
    expect(out).toContain(`# Pilot updated: 0.6.0 → ${VERSION}`);
    expect(out).toContain("~/.claude/skills/pilot");
    expect(out).toContain("1. Restart your app's dev server");
    expect(out).toContain("2. Open a new chat");
    expect(out).not.toContain("other projects");
  });

  it("a new bridge: says to update the other projects too", async () => {
    await files(app("0.6.0", BRIDGE_VERSION - 1));
    const out = await update({ cwd: dir, run: installer().run, home });
    expect(out).toContain("Update Pilot in your other projects too");
  });

  it("already the latest: nothing else to do", async () => {
    await files(app(VERSION));
    const out = await update({ cwd: dir, run: installer().run, home });
    expect(out).toContain(`# Pilot is up to date (${VERSION})`);
    expect(out).toContain("Nothing else to do.");
  });

  it("a skill that's a link (a Pilot checkout, while developing it) is left as it is", async () => {
    await files(app("0.6.0"));
    await files({ "checkout/SKILL.md": "dev skill" }, home);
    await mkdir(join(home, ".claude/skills"), { recursive: true });
    await symlink(join(home, "checkout"), join(home, ".claude/skills/pilot"));
    await update({ cwd: dir, run: installer().run, home });
    expect(await readFile(join(home, "checkout/SKILL.md"), "utf8")).toBe("dev skill");
  });

  it("the install fails: says what to run", async () => {
    await files({ ...app("0.6.0"), "pnpm-lock.yaml": "" });
    const out = await update({ cwd: dir, run: installer(false).run, home });
    expect(out).toContain("# Pilot: not updated");
    expect(out).toContain("pnpm add -D usepilot@latest");
  });

  it("no Pilot here: points to init", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    expect(await update({ cwd: dir, run: installer().run, home })).toContain("npx usepilot@latest init");
  });

  it("init on a project with an older Pilot leaves its version alone, and says update updates it", async () => {
    await files(app("0.6.0"));
    const { calls, run } = installer();
    const out = await init({ env: {}, home, cwd: dir, run, agent: "other" });
    expect(calls).toEqual([]);
    expect(out).toContain(`Pilot 0.6.0 is installed here, and ${VERSION} is out: \`npx usepilot@latest update\``);
  });
});
