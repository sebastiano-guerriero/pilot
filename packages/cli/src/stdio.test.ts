import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChangeSet, PageEvent } from "@pilot/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The whole loop the way an agent runs it: the built CLI (`node
 * dist/index.js mcp`, what `npx usepilot mcp` starts), spoken to over stdio
 * by the official MCP client, against a page on the hub. It catches what
 * breaks on Pilot's side between the code and the bundle a client starts
 * (the tools, their arguments, the hub, a batch, a wait that runs out);
 * what each client does around it is the checklist in docs/development.md.
 */

const CLI = join(import.meta.dirname, "..");
const BUNDLE = join(CLI, "dist", "index.js");
const PORT = 49000 + Math.floor(Math.random() * 900);
const APP = "http://localhost:5173";

const changeSet = (id: string): ChangeSet => ({
  id,
  createdAt: new Date().toISOString(),
  page: { url: `${APP}/`, title: "App", viewport: { width: 1200, height: 800 } },
  edits: [
    {
      target: { selector: ".btn", path: "main > a.btn", tag: "a", classes: ["btn"], text: "Get started" },
      changes: [{ property: "padding-top", from: "10px", to: "22px" }],
    },
  ],
});

let project: string;
let client: Client;
const abort = new AbortController();
const events: PageEvent[] = [];

/** Every text block of a tool's result, joined. */
async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 20_000 });
  return (result.content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** The page's side: its events (SSE), and posting jobs, with the browser's Origin. */
function openPage(): Promise<void> {
  return fetch(`http://127.0.0.1:${PORT}/events`, { headers: { origin: APP }, signal: abort.signal }).then((res) => {
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    void (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
          const data = buffer
            .slice(0, end)
            .split("\n")
            .find((l) => l.startsWith("data: "));
          buffer = buffer.slice(end + 2);
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      }
    })();
  });
}
const post = (path: string, body: object) =>
  fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: "POST",
    headers: { origin: APP, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const until = async (check: () => boolean, ms = 5000) => {
  for (const start = Date.now(); !check(); await new Promise((r) => setTimeout(r, 20))) {
    if (Date.now() - start > ms) throw new Error("timed out");
  }
};

beforeAll(async () => {
  // The bundle a client starts, built from this source: never a stale one.
  const build = spawnSync(join(CLI, "node_modules", ".bin", "tsup"), [], { cwd: CLI, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`Building the CLI failed:\n${build.stdout}${build.stderr}`);
  project = await mkdtemp(join(tmpdir(), "pilot-stdio-"));
  await writeFile(join(project, "package.json"), "{}");
  await writeFile(join(project, "index.html"), '<main>\n  <a class="btn" href="#">Get started</a>\n</main>\n');
  client = new Client({ name: "cursor", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [BUNDLE, "mcp"],
      cwd: project,
      env: { ...process.env, PILOT_PORT: String(PORT), PILOT_WAIT_MS: "1500" } as Record<string, string>,
      stderr: "pipe",
    }),
  );
}, 60_000);

afterAll(async () => {
  abort.abort();
  await client?.close();
  if (project) await rm(project, { recursive: true, force: true });
});

describe("the built CLI over stdio, as an agent starts it", () => {
  it("offers the loop's tools, with the instructions", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["pilot_launch", "pilot_wait_for_edits", "pilot_done", "pilot_check_widths"]));
    expect(client.getInstructions()).toContain("pilot_launch");
  });

  it("launch → a batch of two jobs in one wait → done for each → the page hears it; a wait with nothing runs out", async () => {
    expect(await call("pilot_launch", { url: APP, folder: project })).toContain("pilot_wait_for_edits");
    await openPage();
    await until(() => events.some((e) => e.type === "agents" && e.agents[0]?.label === `Cursor · ${project.split("/").pop()}`));

    // Two Sends while the agent isn't waiting: one wait returns both, each with where its code is.
    expect((await post("/jobs", { id: "j1", changeSet: changeSet("j1") })).status).toBe(202);
    expect((await post("/jobs", { id: "j2", changeSet: changeSet("j2") })).status).toBe(202);
    const batch = await call("pilot_wait_for_edits");
    expect(batch).toContain('jobId: "j1"');
    expect(batch).toContain('jobId: "j2"');
    expect(batch).toContain("→ `index.html:2`");

    for (const id of ["j1", "j2"]) expect(await call("pilot_done", { jobId: id, notes: "pt-6" })).toMatch(/^Done/);
    await until(() => ["j1", "j2"].every((id) => events.some((e) => e.type === "job" && e.job.id === id && e.job.status === "done")));

    // Nothing sent: the wait runs out (PILOT_WAIT_MS), and says to wait again.
    expect(await call("pilot_wait_for_edits")).toMatch(/^No edits yet/);
  }, 30_000);
});
