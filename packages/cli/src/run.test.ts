import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangeSet, Job, PageEvent } from "@pilot/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { AGENTS } from "./agents.ts";
import { activityOf, errorFor, replyOf, sessionToResume, startRunner } from "./run.ts";

const APP = "http://localhost:5173";
const changeSet = (id: string, extra: Partial<ChangeSet> = {}): ChangeSet => ({
  id,
  createdAt: new Date().toISOString(),
  page: { url: `${APP}/`, title: "App", viewport: { width: 1200, height: 800 } },
  edits: [
    {
      target: { selector: ".btn", path: "main > a.btn", tag: "a", classes: ["btn"], text: "Get started" },
      changes: [{ property: "padding-top", from: "10px", to: "22px" }],
    },
  ],
  ...extra,
});

/**
 * A stand-in for Claude Code's command-line tool: logs each run (its
 * arguments and the prompt from stdin) and prints a stream like the real one.
 * The prompt steers it: FAIL fails every run, FAIL_ONCE the first, SLOW never
 * ends, NOT_SIGNED_IN says so, ASK ends with a question block.
 */
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
let prompt = "";
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, prompt }) + "\\n");
  const runs = fs.readFileSync(process.env.FAKE_LOG, "utf8").trim().split("\\n").length;
  const resume = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : null;
  const session = resume || "aaaaaaaa-0000-0000-0000-00000000000" + runs;
  const say = (o) => console.log(JSON.stringify({ ...o, session_id: session }));
  if (prompt.includes("SLOW")) return setTimeout(() => {}, 60000);
  if (prompt.includes("NOT_SIGNED_IN")) return say({ type: "result", is_error: true, result: "Not logged in · Please run /login" });
  if (prompt.includes("FAIL") && !(prompt.includes("FAIL_ONCE") && runs > 1)) { process.stderr.write("boom"); process.exit(1); }
  say({ type: "system", subtype: "init" });
  say({ type: "assistant", message: { content: [{ type: "text", text: "Looking." }] } });
  const ask = prompt.includes("ASK") ? '\\n\\n\`\`\`pilot\\n{"question": {"text": "All cards, or only this one?", "choices": ["All of them", "Only this"]}}\\n\`\`\`' : "";
  say({ type: "assistant", message: { content: [{ type: "text", text: "Done, run " + runs + "." + ask }] } });
  say({ type: "result", is_error: false, result: "Done." });
});
`;

let nextPort = 49000 + Math.floor(Math.random() * 900);
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

function fakePage(port: number, origin = APP, project?: string) {
  const events: PageEvent[] = [];
  const abort = new AbortController();
  const ready = fetch(`http://127.0.0.1:${port}/events${project ? `?project=${encodeURIComponent(project)}` : ""}`, { headers: { origin }, signal: abort.signal }).then(async (res) => {
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    void (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end = buffer.indexOf("\n\n");
        while (end >= 0) {
          const data = buffer.slice(0, end).split("\n").find((l) => l.startsWith("data: "));
          buffer = buffer.slice(end + 2);
          if (data) events.push(JSON.parse(data.slice(6)));
          end = buffer.indexOf("\n\n");
        }
      }
    })();
  });
  cleanup.push(() => abort.abort());
  const post = (path: string, body: object) =>
    fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  /** The job as the page last heard of it. */
  const job = (id: string) => events.filter((e): e is Extract<PageEvent, { type: "job" }> => e.type === "job" && e.job.id === id).at(-1)?.job;
  return { events, ready, post, job };
}

const until = async (check: () => unknown, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

async function setup() {
  const port = nextPort++;
  const dir = mkdtempSync(join(tmpdir(), "pilot-runner-"));
  const project = join(dir, "app");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(project);
  writeFileSync(join(project, "package.json"), "{}");
  const bin = join(dir, "claude");
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o755);
  const log = join(dir, "runs.log");
  writeFileSync(log, "");
  process.env.FAKE_LOG = log;
  const lines: string[] = [];
  const runner = await startRunner({ cwd: project, port, url: APP, agent: "claude", bin, configFile: join(dir, "config.json"), out: (l) => lines.push(l) });
  cleanup.push(() => runner.close());
  const page = fakePage(port);
  await page.ready;
  const runs = () =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { args: string[]; prompt: string });
  return { port, page, runs, lines, runner };
}

describe("npx usepilot: Pilot runs the agent for each job", () => {
  it("says when the agent is at work, as its output comes, for the page to tell a run that went quiet", async () => {
    const { page } = await setup();
    await page.post("/jobs", { id: "q1", changeSet: changeSet("q1", { note: "SLOW" }) });
    await until(() => page.job("q1")?.status === "working" && !!page.job("q1")?.activeAt);
    expect(Date.parse(page.job("q1")?.activeAt as string)).toBeGreaterThan(Date.now() - 10_000);
  });

  it("tells the hub at once, then at most every 15 seconds", () => {
    let t = 0;
    const calls: string[] = [];
    const active = activityOf({ activity: async (id: string) => void calls.push(id) }, "j", 15_000, () => t);
    active();
    t = 5_000;
    active();
    t = 15_000;
    active();
    t = 20_000;
    active();
    expect(calls).toEqual(["j", "j"]);
  });


  it("the editor's jobs resume a session kept for them, the guidelines in one line; jobs at once take their own", async () => {
    const { page, runs } = await setup();
    await page.post("/jobs", { id: "e1", changeSet: changeSet("e1") });
    await until(() => page.job("e1")?.status === "done");
    await page.post("/jobs", { id: "e2", changeSet: changeSet("e2") });
    await until(() => page.job("e2")?.status === "done");
    const [first, second] = runs();
    expect(first?.args).not.toContain("--resume");
    expect(first?.prompt).toContain("- **These are design instructions, not code**");
    // Pilot checks the page: the agent doesn't check its own edit (a git diff, a script).
    expect(first?.prompt).toContain("don't check your edit afterwards (no git diff, script or second read of the file): Pilot does.");
    expect(second?.args).toEqual(expect.arrayContaining(["--resume", "aaaaaaaa-0000-0000-0000-000000000001"]));
    expect(second?.prompt).toContain("Guidelines: the same as for the earlier edits in this session");
    expect(second?.prompt).not.toContain("These are design instructions, not code");
    // Two at once: one resumes the kept session, the other starts its own.
    await page.post("/jobs", { id: "e3", changeSet: changeSet("e3", { note: "SLOW_A" }) });
    await page.post("/jobs", { id: "e4", changeSet: changeSet("e4") });
    await until(() => runs().length >= 4);
    const both = runs().slice(2);
    expect(both.filter((r) => r.args.includes("--resume")).length).toBe(1);
  });


  it("runs an edit job and reports it done, with the agent's reply and session", async () => {
    const { page, runs, lines } = await setup();
    await page.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    await until(() => page.job("j1")?.status === "done");
    const job = page.job("j1") as Job;
    expect(job.notes).toBe("Done, run 1.");
    expect(job.session).toEqual({ agent: "claude", id: "aaaaaaaa-0000-0000-0000-000000000001" });
    expect(job.agent?.label).toBe("Claude Code · app");
    const [run] = runs();
    // The prompt on stdin, in full (a fresh run hasn't read the guidelines), with none of Pilot's MCP tools.
    expect(run?.prompt).toContain("padding-top");
    expect(run?.prompt).toContain("Guidelines:");
    expect(run?.prompt).not.toMatch(/pilot_(done|wait_for_edits|check_widths)/);
    expect(run?.args.join(" ")).toContain("--permission-mode acceptEdits");
    expect(lines.some((l) => l.startsWith("✓"))).toBe(true);
  });

  it("resumes a comment thread's session, so the agent remembers it", async () => {
    const { page, runs } = await setup();
    const target = changeSet("x").edits[0]?.target as ChangeSet["edits"][number]["target"];
    await page.post("/jobs", {
      id: "c2",
      changeSet: changeSet("c2", {
        edits: [],
        request: {
          kind: "comment",
          target,
          breakpoints: [],
          session: { agent: "claude", id: "bbbbbbbb-1111-2222-3333-444444444444" },
          thread: [
            { from: "designer", text: "Bigger", at: "" },
            { from: "agent", text: "Done.", at: "" },
            { from: "designer", text: "a bit more", at: "" },
          ],
        },
      }),
    });
    await until(() => page.job("c2")?.status === "done");
    expect(runs()[0]?.args.join(" ")).toContain("--resume bbbbbbbb-1111-2222-3333-444444444444");
    expect(page.job("c2")?.session?.id).toBe("bbbbbbbb-1111-2222-3333-444444444444");
  });

  it("reads a question from the reply's pilot block", async () => {
    const { page } = await setup();
    await page.post("/jobs", { id: "q1", changeSet: changeSet("q1", { note: "ASK" }) });
    await until(() => page.job("q1")?.status === "done");
    expect(page.job("q1")?.question).toEqual({ text: "All cards, or only this one?", choices: ["All of them", "Only this"] });
    expect(page.job("q1")?.notes).toBe("Done, run 1.");
  });

  it("tries a failed run once more, then says what went wrong", async () => {
    const { page, runs } = await setup();
    await page.post("/jobs", { id: "f1", changeSet: changeSet("f1", { note: "FAIL_ONCE" }) });
    await until(() => page.job("f1")?.status === "done");
    expect(runs()).toHaveLength(2);
    expect(page.job("f1")?.error).toBeUndefined();

    await page.post("/jobs", { id: "f2", changeSet: changeSet("f2", { note: "FAIL" }) });
    await until(() => page.job("f2")?.status === "done");
    expect(page.job("f2")?.error?.title).toBe("Claude Code couldn't do this job");
    expect(page.job("f2")?.notes).toBeUndefined();
  });

  it("says when the agent isn't signed in, and what to run", async () => {
    const { page, runs } = await setup();
    await page.post("/jobs", { id: "s1", changeSet: changeSet("s1", { note: "NOT_SIGNED_IN" }) });
    await until(() => page.job("s1")?.status === "done");
    expect(page.job("s1")?.error).toEqual({ title: "Claude Code isn't signed in", detail: "Run claude auth login in a terminal, then send again." });
    // No second try: it can't work until the designer signs in.
    expect(runs()).toHaveLength(1);
  });

  it("stops a run when the designer takes the job back", async () => {
    const { page, runs, lines } = await setup();
    await page.post("/jobs", { id: "slow", changeSet: changeSet("slow", { note: "SLOW" }) });
    await until(() => runs().length === 1);
    await page.post("/jobs/slow/cancel", {});
    await until(() => lines.some((l) => l.startsWith("■ Stopped")), 8000);
    expect(page.job("slow")?.status).toBe("cancelled");
  });

  it("runs several jobs at once", async () => {
    const { page, runs } = await setup();
    await page.post("/jobs", { id: "slow", changeSet: changeSet("slow", { note: "SLOW" }) });
    await until(() => runs().length === 1);
    await page.post("/jobs", { id: "quick", changeSet: changeSet("quick") });
    await until(() => page.job("quick")?.status === "done");
    expect(page.job("slow")?.status).toBe("working");
  });
});

describe("which site it runs for", () => {
  it("its own project's pages only, by the name their loader carries; it says why it leaves the others", async () => {
    const port = nextPort++;
    const dir = mkdtempSync(join(tmpdir(), "pilot-site-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop" }));
    const lines: string[] = [];
    const starting = startRunner({ cwd: dir, port, agent: "claude", bin: process.execPath, configFile: join(dir, "c.json"), out: (l) => lines.push(l) });
    await until(() => lines.some((l) => l.startsWith("Waiting for a page of shop")));
    // Another project's page, and one whose loader names none (from before 0.15): left, each said once.
    const other = fakePage(port, "http://localhost:5180", "playground");
    const unnamed = fakePage(port, "http://localhost:3003");
    await other.ready;
    await unnamed.ready;
    await until(() => lines.some((l) => l.includes("for playground, not shop")) && lines.some((l) => l.includes("doesn't say which project")));
    // This project's page: taken.
    const mine = fakePage(port, APP, "shop");
    await mine.ready;
    const runner = await starting;
    cleanup.push(() => runner.close());
    expect(runner.origin).toBe(APP);
    expect(lines.filter((l) => l.includes("for playground, not shop"))).toHaveLength(1);
  });
});

describe("a run's reply", () => {
  it("is the notes, without the pilot block", () => {
    expect(replyOf("Made it bigger.")).toEqual({ notes: "Made it bigger.", question: undefined, props: undefined });
    const reply = replyOf('Listed them.\n\n```pilot\n{"props": [{"name": "tone", "type": "options", "options": ["light", "dark"]}]}\n```');
    expect(reply.notes).toBe("Listed them.");
    expect(reply.props).toEqual([{ name: "tone", type: "options", options: ["light", "dark"] }]);
    // A block that isn't JSON asks nothing.
    expect(replyOf("Hm.\n```pilot\nnot json\n```").question).toBeUndefined();
  });

  it("what the agent says it was refused, from the same block, with a question or alone", () => {
    const reply = replyOf('Used another icon.\n\n```pilot\n{"question": {"text": "Keep it?"}, "refused": [{"mcp": "nucleo-icons"}]}\n```');
    expect(reply.notes).toBe("Used another icon.");
    expect(reply.question?.text).toBe("Keep it?");
    expect(reply.refused).toEqual([{ mcp: "nucleo-icons" }]);
    expect(replyOf('Done.\n```pilot\n{"refused": [{"command": "curl x"}]}\n```').refused).toEqual([{ command: "curl x" }]);
  });

  it("resumes only the same agent's session: the job's own for its follow-up, else the thread's", () => {
    const base = { id: "j", origin: APP, status: "queued", createdAt: "", updatedAt: "" } as const;
    const target = changeSet("x").edits[0]?.target as ChangeSet["edits"][number]["target"];
    const comment = changeSet("j", {
      edits: [],
      request: { kind: "comment", target, breakpoints: [], thread: [], session: { agent: "claude", id: "thread-session-1" } },
    });
    expect(sessionToResume({ ...base, changeSet: comment }, "claude")).toBe("thread-session-1");
    expect(sessionToResume({ ...base, changeSet: comment }, "codex")).toBeUndefined();
    expect(sessionToResume({ ...base, changeSet: comment, attempt: 2, session: { agent: "claude", id: "job-session-1" } }, "claude")).toBe("job-session-1");
    // An id that isn't a plain id never reaches the command.
    const bad = changeSet("j", { edits: [], request: { kind: "comment", target, breakpoints: [], thread: [], session: { agent: "claude", id: "--evil" } } });
    expect(sessionToResume({ ...base, changeSet: bad }, "claude")).toBeUndefined();
  });

  it("explains a failed run", () => {
    expect(errorFor(AGENTS.codex, "401 Unauthorized").title).toBe("Codex isn't signed in");
    expect(errorFor(AGENTS.cursor, "stream disconnected").detail).toMatch(/^stream disconnected/);
  });
});
