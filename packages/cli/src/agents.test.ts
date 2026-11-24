import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTS, agentFromEnv, childEnv, exec, findBin, refusedNote, refusedOf } from "./agents.ts";

// What each tool printed in real runs (2026-11), trimmed.
const CLAUDE_STREAM = [
  '{"type":"system","subtype":"init","session_id":"ac89dfbf-1319-4edb-a541-239d8d03205e"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Looking at styles.css."}]},"session_id":"ac89dfbf-1319-4edb-a541-239d8d03205e"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit"}]},"session_id":"ac89dfbf-1319-4edb-a541-239d8d03205e"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"The buttons now have 8px 16px padding."}]},"session_id":"ac89dfbf-1319-4edb-a541-239d8d03205e"}',
  '{"type":"result","subtype":"success","is_error":false,"result":"The buttons now have 8px 16px padding.","session_id":"ac89dfbf-1319-4edb-a541-239d8d03205e"}',
].join("\n");

const CURSOR_STREAM = [
  '{"type":"system","subtype":"init","session_id":"0379ed69-ed3d-4990-9bed-811fcdb0d6b0"}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"one\\n\\nReading `styles.css` next.\\n"}]},"session_id":"0379ed69-ed3d-4990-9bed-811fcdb0d6b0"}',
  '{"type":"tool_call","subtype":"completed","session_id":"0379ed69-ed3d-4990-9bed-811fcdb0d6b0"}',
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"two"}]},"session_id":"0379ed69-ed3d-4990-9bed-811fcdb0d6b0"}',
  '{"type":"result","subtype":"success","is_error":false,"result":"one\\n\\nReading `styles.css` next.\\ntwo","session_id":"0379ed69-ed3d-4990-9bed-811fcdb0d6b0"}',
].join("\n");

const CODEX_JSONL = [
  '{"type":"thread.started","thread_id":"01a1f94e-7c9b-7963-bfce-f7d643858f8e"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"I’ll update the rule."}}',
  '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"rg .button","exit_code":0}}',
  '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Refill and Assign now use the spacing tokens."}}',
  '{"type":"turn.completed","usage":{"input_tokens":100}}',
].join("\n");

describe("reading a run's output", () => {
  it("takes Claude Code's session and its last message", () => {
    expect(AGENTS.claude.parse(CLAUDE_STREAM)).toEqual({
      session: "ac89dfbf-1319-4edb-a541-239d8d03205e",
      reply: "The buttons now have 8px 16px padding.",
      error: undefined,
    });
  });

  it("takes Cursor's last message, not its joined result", () => {
    expect(AGENTS.cursor.parse(CURSOR_STREAM).reply).toBe("two");
    expect(AGENTS.cursor.parse(CURSOR_STREAM).session).toBe("0379ed69-ed3d-4990-9bed-811fcdb0d6b0");
  });

  it("takes Codex's thread and its last message", () => {
    expect(AGENTS.codex.parse(CODEX_JSONL)).toEqual({
      session: "01a1f94e-7c9b-7963-bfce-f7d643858f8e",
      reply: "Refill and Assign now use the spacing tokens.",
      error: undefined,
    });
  });

  it("says what went wrong", () => {
    expect(AGENTS.claude.parse('{"type":"result","is_error":true,"result":"Not logged in · Please run /login","session_id":"x"}').error).toMatch(/Not logged in/);
    expect(AGENTS.codex.parse('{"type":"turn.failed","error":{"message":"stream disconnected"}}').error).toBe("stream disconnected");
    expect(AGENTS.cursor.parse("Error: Authentication required").error).toBe("Error: Authentication required");
    expect(AGENTS.cursor.parse("").error).toMatch(/nothing/);
  });
});

describe("a run's arguments", () => {
  it("runs every agent with the designer's own permissions, never skipping them", () => {
    const claude = AGENTS.claude.args({}).join(" ");
    expect(claude).toContain("--permission-mode acceptEdits");
    // Their own settings: nothing that drops them, or narrows the tools to Pilot's pick.
    expect(claude).not.toMatch(/--restricted|--tools |--strict-mcp-config|--safe-mode|--bare/);
    const codex = AGENTS.codex.args({}).join(" ");
    expect(codex).toContain("-s workspace-write");
    expect(codex).not.toContain("web_search");
    // Allowlist mode (its sandbox isn't on Windows): what the allowlist doesn't allow is refused.
    expect(AGENTS.cursor.args({}).join(" ")).toContain("--sandbox disabled");
    for (const cli of Object.values(AGENTS))
      expect(cli.args({}).join(" ")).not.toMatch(/--force|--yolo|bypass|dangerously|danger-full-access/i);
  });

  it("lets Claude Code read the user's skills, read-only (its chat would ask, a run can't answer)", () => {
    const claude = AGENTS.claude.args({});
    expect(claude[claude.indexOf("--allowedTools") + 1]).toBe("Read(~/.claude/skills/**)");
  });

  it("starts a skill the designer picked as each agent's chat does", () => {
    expect(AGENTS.claude.invokeSkill("variant")).toBe("/variant");
    expect(AGENTS.cursor.invokeSkill("variant")).toBe("/variant");
    expect(AGENTS.codex.invokeSkill("variant")).toBe("$variant");
  });

  it("never takes the prompt as an argument (it goes on stdin)", () => {
    for (const cli of Object.values(AGENTS)) expect(cli.args({ resume: "abc" }).join(" ")).not.toMatch(/\n/);
    expect(AGENTS.codex.args({}).at(-1)).toBe("-");
  });

  it("resumes a session", () => {
    expect(AGENTS.claude.args({ resume: "s1" }).join(" ")).toContain("--resume s1");
    expect(AGENTS.cursor.args({ resume: "s1" }).join(" ")).toContain("--resume s1");
    expect(AGENTS.codex.args({ resume: "s1" }).slice(-3)).toEqual(["resume", "s1", "-"]);
  });

  it("gives Codex its sandbox mode on Windows only", () => {
    expect(AGENTS.codex.args({ platform: "win32" })).toContain('windows.sandbox="unelevated"');
    expect(AGENTS.codex.args({ platform: "darwin" })).not.toContain('windows.sandbox="unelevated"');
  });

  it("lets Claude Code read the attachments' folder", () => {
    expect(AGENTS.claude.args({ readDirs: ["/tmp/pilot-attachments"] }).join(" ")).toContain("--add-dir /tmp/pilot-attachments");
  });
});

describe("finding an agent", () => {
  it("looks on PATH, then in ~/.local/bin", () => {
    const root = mkdtempSync(join(tmpdir(), "pilot-bin-"));
    const onPath = join(root, "path");
    const home = join(root, "home");
    mkdirSync(onPath);
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    writeFileSync(join(home, ".local", "bin", "claude"), "");
    writeFileSync(join(onPath, "agent"), "");
    expect(findBin(["claude"], { PATH: onPath }, "darwin", home)).toBe(join(home, ".local", "bin", "claude"));
    expect(findBin(["cursor-agent", "agent"], { PATH: onPath }, "darwin", home)).toBe(join(onPath, "agent"));
    expect(findBin(["codex"], { PATH: onPath }, "darwin", home)).toBeNull();
  });

  it("finds Windows' .cmd and .exe", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-bin-"));
    writeFileSync(join(dir, "codex.cmd"), "");
    expect(findBin(["codex"], { PATH: dir, PATHEXT: ".EXE;.CMD" }, "win32", dir)).toBe(join(dir, "codex.cmd"));
  });
});

describe("running an agent", () => {
  it("sends the prompt on stdin and reads stdout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-run-"));
    const fake = join(dir, "fake.mjs");
    writeFileSync(fake, "#!/usr/bin/env node\nlet s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.stringify({args:process.argv.slice(2),prompt:s})));\n");
    chmodSync(fake, 0o755);
    const prompt = 'A "quoted" prompt\nover two lines';
    const { stdout, code } = await exec(process.execPath, [fake, "--flag", "a b"], { input: prompt });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ args: ["--flag", "a b"], prompt });
  });

  it("stops a run when asked", async () => {
    const controller = new AbortController();
    const run = exec(process.execPath, ["-e", "setTimeout(()=>{},60000)"], { signal: controller.signal });
    controller.abort();
    expect((await run).killed).toBe(true);
  });

  it("doesn't pass on what marks a process as inside Claude Code", () => {
    expect(childEnv({ CLAUDECODE: "1", PATH: "/bin" })).toEqual({ PATH: "/bin" });
  });
});

describe("the agent running Pilot's setup", () => {
  it("is told from its environment", () => {
    expect(agentFromEnv({ CLAUDECODE: "1" })).toBe("claude");
    expect(agentFromEnv({ CURSOR_TRACE_ID: "x" })).toBe("cursor");
    expect(agentFromEnv({ CODEX_SANDBOX: "seatbelt" })).toBe("codex");
    expect(agentFromEnv({ PATH: "/bin" })).toBeNull();
  });
});

describe("what a run was refused", () => {
  // A real Claude Code run (2026-11-24) refused an MCP tool: its result event, trimmed.
  const REFUSED =
    '{"type":"result","subtype":"success","is_error":false,"result":"Not done: the call was blocked.","session_id":"s1","permission_denials":[{"tool_name":"mcp__nucleo-icons__nucleo_list_families","tool_use_id":"toolu_1","tool_input":{}},{"tool_name":"mcp__nucleo-icons__nucleo_search_icons","tool_use_id":"toolu_2","tool_input":{"query":"book"}},{"tool_name":"Bash","tool_use_id":"toolu_3","tool_input":{"command":"curl -sI https://example.com"}},{"tool_name":"WebFetch","tool_use_id":"toolu_4","tool_input":{"url":"https://linear.app/features"}}]}';

  it("Claude Code reports it in its result, as the kinds every agent uses", () => {
    expect(AGENTS.claude.parse(REFUSED).refused).toEqual([
      { mcp: "nucleo-icons" },
      { mcp: "nucleo-icons" },
      { command: "curl -sI https://example.com" },
      { web: "linear.app" },
    ]);
    expect(AGENTS.claude.parse(CLAUDE_STREAM).refused).toBeUndefined();
  });

  it("what an agent says it was refused, checked: the known kinds, plain strings", () => {
    expect(refusedOf([{ mcp: "nucleo-icons" }, { command: " curl x " }, { web: 3 }, { other: "x" }, "Bash"])).toEqual([{ mcp: "nucleo-icons" }, { command: "curl x" }]);
    expect(refusedOf(undefined)).toEqual([]);
  });

  it("each agent says how to allow it in its own settings, briefly, each thing once", () => {
    const refused = AGENTS.claude.parse(REFUSED).refused;
    expect(refusedNote(AGENTS.claude, refused)).toBe(
      [
        "**Not allowed in this run** (Claude Code can't ask you here, as in its chat).",
        '- To allow `nucleo-icons` (MCP), add `"mcp__nucleo-icons"` to `permissions.allow` in `~/.claude/settings.json`.',
        '- To allow `curl -sI https://example.com`, add `"Bash(curl -sI https://example.com)"` to `permissions.allow` in `~/.claude/settings.json`.',
        '- To allow `linear.app`, add `"WebFetch(domain:linear.app)"` to `permissions.allow` in `~/.claude/settings.json`.',
      ].join("\n"),
    );
    expect(refusedNote(AGENTS.cursor, [{ mcp: "nucleo-icons" }])).toBe(
      '**Not allowed in this run** (Cursor can\'t ask you here, as in its chat). To allow `nucleo-icons` (MCP), add `"Mcp(nucleo-icons:*)"` to `permissions.allow` in `~/.cursor/cli-config.json`.',
    );
    expect(refusedNote(AGENTS.cursor, [{ command: "curl -sI https://example.com" }])).toContain('`"Shell(curl)"`');
    expect(refusedNote(AGENTS.codex, [{ mcp: "nucleo-icons" }])).toContain('`default_tools_approval_mode = "approve"` under `[mcp_servers.nucleo-icons]` in `~/.codex/config.toml`');
    expect(refusedNote(AGENTS.codex, [{ command: "curl -sI https://example.com" }])).toContain('`prefix_rule(pattern = ["curl"], decision = "allow")` to `~/.codex/rules/default.rules`');
    expect(refusedNote(AGENTS.codex, [{ web: "linear.app" }])).toContain("`network_access = true` under `[sandbox_workspace_write]`");
  });

  it("nothing refused, or nothing of it that can be allowed: no note", () => {
    expect(refusedNote(AGENTS.claude, undefined)).toBeNull();
    expect(refusedNote(AGENTS.cursor, [{ tool: "Something" }])).toBeNull();
  });
});
