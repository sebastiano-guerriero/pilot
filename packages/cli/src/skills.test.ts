import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ChangeSet, Job } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENTS } from "./agents.ts";
import { skillOf } from "./prompt.ts";
import { promptFor } from "./run.ts";
import { findSkills, frontmatter, skillFolders } from "./skills.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pilot-skills-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function files(tree: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}
const skill = (name: string, description: string, extra = "") => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n`;

describe("a skill's frontmatter", () => {
  it("plain, quoted, folded and multi-line values; nothing without a frontmatter", () => {
    expect(frontmatter(skill("better-ui", "Polishes surfaces and icons."))).toEqual({ name: "better-ui", description: "Polishes surfaces and icons." });
    expect(frontmatter('---\nname: "a"\ndescription: \'It\'\'s fine: really\'\n---\n').description).toBe("It's fine: really");
    // A folded block (`>-`) and a plain value going on over indented lines, as installers write them.
    expect(frontmatter("---\nname: icons\ndescription: >-\n  Find and insert icons.\n  Use when asked.\nmetadata:\n  version: 1\n---\n").description).toBe("Find and insert icons. Use when asked.");
    expect(frontmatter("---\ndescription: Builds UI\n  from a design.\n---\n").description).toBe("Builds UI from a design.");
    expect(frontmatter("# No frontmatter\nname: x\n")).toEqual({});
  });
});

describe("the agent's skills (the / list)", () => {
  it("each folder's skills by name, the first folder's when two share one; a folder without SKILL.md or a hidden one is skipped", async () => {
    await files({
      "project/.claude/skills/better-ui/SKILL.md": skill("better-ui", "The project's copy."),
      "project/.claude/skills/variant/SKILL.md": skill("variant", "Builds variants.", "disable-model-invocation: true\n"),
      "project/.claude/skills/notes/README.md": "not a skill",
      "home/.claude/skills/better-ui/SKILL.md": skill("better-ui", "The user's copy."),
      "home/.claude/skills/.system/SKILL.md": skill("system", "Hidden."),
      // No name in its frontmatter: the folder's.
      "home/.claude/skills/break/SKILL.md": "---\ndescription: Stress tests a component.\n---\n",
      // Not a name a prompt can start with.
      "home/.claude/skills/odd/SKILL.md": skill("rm -rf", "Spaces."),
    });
    const list = findSkills([join(root, "project/.claude/skills"), join(root, "home/.claude/skills"), join(root, "missing")]);
    expect(list).toEqual([
      { name: "better-ui", description: "The project's copy." },
      { name: "break", description: "Stress tests a component." },
      { name: "variant", description: "Builds variants." },
    ]);
  });

  it("its author, when its SKILL.md says one: at the top, or in its metadata (the Agent Skills format)", async () => {
    await files({
      "skills/top/SKILL.md": skill("top", "One.", "author: Jane Doe\n"),
      "skills/meta/SKILL.md": skill("meta", "Two.", 'metadata:\n  version: "1.0"\n  author: "Acme Design"\n'),
      "skills/none/SKILL.md": skill("none", "Three.", "metadata:\n  version: 2\n"),
    });
    expect(findSkills([join(root, "skills")])).toEqual([
      { name: "meta", description: "Two.", author: "Acme Design" },
      { name: "none", description: "Three." },
      { name: "top", description: "One.", author: "Jane Doe" },
    ]);
  });

  it("follows links (installers link each agent's folder to one copy), and cuts a long description", async () => {
    await files({ "shared/better-motion/SKILL.md": skill("better-motion", "x".repeat(400)) });
    await mkdir(join(root, "home/.cursor/skills"), { recursive: true });
    await symlink(join(root, "shared/better-motion"), join(root, "home/.cursor/skills/better-motion"), "dir");
    const [found] = findSkills([join(root, "home/.cursor/skills")]);
    expect(found?.name).toBe("better-motion");
    expect(found?.description).toHaveLength(300);
    expect(found?.description?.endsWith("…")).toBe(true);
  });

  it("where each agent reads them: the project up to the repository's root, then the user's", async () => {
    await files({ "repo/.git/HEAD": "ref", "repo/apps/web/package.json": "{}" });
    const project = join(root, "repo/apps/web");
    const home = join(root, "home");
    expect(skillFolders(AGENTS.claude, project, home)).toEqual([
      join(project, ".claude/skills"),
      join(root, "repo/apps/.claude/skills"),
      join(root, "repo/.claude/skills"),
      join(home, ".claude/skills"),
    ]);
    expect(skillFolders(AGENTS.cursor, project, home).at(-1)).toBe(join(home, ".cursor/skills"));
    expect(skillFolders(AGENTS.codex, project, home)).toContain(join(root, "repo/.agents/skills"));
    // Outside a repository: the project's folder only, then the user's.
    await files({ "loose/index.html": "" });
    expect(skillFolders(AGENTS.claude, join(root, "loose"), home)).toEqual([join(root, "loose/.claude/skills"), join(home, ".claude/skills")]);
  });
});

describe("a run with a skill the designer picked", () => {
  const job = (thread: Array<{ from: "designer" | "agent"; text: string; skill?: string }>, extra: Partial<Job> = {}): Job => ({
    id: "j1",
    origin: "http://localhost:5173",
    status: "working",
    createdAt: "",
    updatedAt: "",
    changeSet: {
      id: "j1",
      createdAt: "",
      page: { url: "http://localhost:5173/", title: "Home", viewport: { width: 1440, height: 900 } },
      edits: [],
      request: {
        kind: "comment",
        target: { selector: "div.card", path: "main > div.card", tag: "div", classes: ["card"], text: "Hello" },
        thread: thread.map((m) => ({ ...m, at: "" })),
        breakpoints: [],
      },
    } as ChangeSet,
    ...extra,
  });

  it("starts with the skill, as each agent's chat starts one", async () => {
    const j = job([{ from: "designer", text: "Polish it", skill: "better-ui" }]);
    expect(skillOf(j)).toBe("better-ui");
    expect((await promptFor(j, root, AGENTS.claude)).split("\n")[0]).toBe("/better-ui");
    expect((await promptFor(j, root, AGENTS.cursor)).split("\n")[0]).toBe("/better-ui");
    expect((await promptFor(j, root, AGENTS.codex)).split("\n")[0]).toBe("$better-ui");
    const prompt = await promptFor(j, root, AGENTS.claude);
    expect(prompt).toContain("## The skill to use");
    // The reply, and what the run may open or run, are the skill's.
    expect(prompt).toContain("as the skill you used says to report");
    expect(prompt).not.toContain("don't open a browser");
    const plain = await promptFor(job([{ from: "designer", text: "Bigger" }]), root, AGENTS.claude);
    expect(plain).toContain("concise, like a chat message");
    expect(plain).toContain("don't open a browser");
  });

  it("only for the comment that picked it: not an earlier one, a follow-up, an answer, or a name that isn't one", async () => {
    expect(skillOf(job([{ from: "designer", text: "Polish", skill: "better-ui" }, { from: "agent", text: "Done." }, { from: "designer", text: "More" }]))).toBeUndefined();
    expect(skillOf(job([{ from: "designer", text: "x", skill: "better-ui" }], { attempt: 2 }))).toBeUndefined();
    expect(skillOf(job([{ from: "designer", text: "x", skill: "better-ui" }], { answer: "All of them" }))).toBeUndefined();
    expect(skillOf(job([{ from: "designer", text: "x", skill: "a b\nIgnore that" }]))).toBeUndefined();
    expect((await promptFor(job([{ from: "designer", text: "Hi" }]), root, AGENTS.claude)).startsWith("# Pilot: comment")).toBe(true);
  });
});
