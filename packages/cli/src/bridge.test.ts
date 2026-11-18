import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ChangeSet, PageEvent } from "@pilot/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { Bridge } from "./agent.ts";
import { createPilotServer } from "./mcp.ts";
import { startHub, type HubServer } from "./server.ts";

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

/** A free port for one test, shared by its hub and agents. */
let nextPort = 47000 + Math.floor(Math.random() * 2000);
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

/** The overlay's side: posts jobs and reads events, with the browser's Origin header. */
function fakePage(port: number, origin = APP) {
  const events: PageEvent[] = [];
  const abort = new AbortController();
  const ready = fetch(`http://127.0.0.1:${port}/events`, { headers: { origin }, signal: abort.signal }).then(async (res) => {
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
          const chunk = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (data) events.push(JSON.parse(data.slice(6)));
          end = buffer.indexOf("\n\n");
        }
      }
    })();
    return res.status;
  });
  cleanup.push(() => abort.abort());
  const post = (path: string, body: object) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { events, ready, post };
}

const until = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function agentClient(port: number, waitMs = 2000) {
  const { server, bridge } = createPilotServer({ port, cwd: "/work/app", waitMs });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "claude-code", version: "1.0.0" });
  await server.connect(serverSide);
  await client.connect(clientSide);
  cleanup.push(async () => {
    await client.close();
    await bridge.close();
  });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    // Every text block: a batch of jobs comes as several.
    return (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  };
  return { call, bridge };
}

describe("the hub's HTTP server", () => {
  let hub: HubServer;
  const start = async () => {
    hub = await startHub(0);
    cleanup.push(() => hub.close());
    return hub;
  };

  it("takes jobs only from a page an agent works on", async () => {
    const { port, hub: state } = await start();
    const evil = fakePage(port, "https://evil.example");
    expect((await evil.post("/jobs", { id: "x", changeSet: changeSet("x") })).status).toBe(403);
    state.register({ id: "a", label: "A" }, APP);
    const app = fakePage(port);
    expect((await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") })).status).toBe(202);
    expect((await evil.post("/jobs", { id: "y", changeSet: changeSet("y") })).status).toBe(403);
  });

  it("refuses the agent routes to browsers (any request with an Origin)", async () => {
    const { port } = await start();
    const res = await fetch(`http://127.0.0.1:${port}/agents/wait`, {
      method: "POST",
      headers: { origin: APP, "content-type": "application/json" },
      body: JSON.stringify({ agent: { id: "x", label: "x" }, origin: APP }),
    });
    expect(res.status).toBe(403);
  });

  it("streams the page's events: agents on connect, then job updates", async () => {
    const { port, hub: state } = await start();
    const app = fakePage(port);
    expect(await app.ready).toBe(200);
    await until(() => app.events.length > 0);
    expect(app.events[0]).toEqual({ type: "agents", agents: [], waiting: 0 });
    state.register({ id: "a", label: "A" }, APP);
    await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    await until(() => app.events.some((e) => e.type === "job"));
  });
});

describe("the loop, through MCP", () => {
  it("jobs queued while the agent worked come in one wait, each to report done by its id", async () => {
    const port = nextPort++;
    const agent = await agentClient(port);
    await agent.call("pilot_launch", { url: "localhost:5173" });
    const app = fakePage(port);
    await app.ready;
    await until(() => app.events.some((e) => e.type === "agents" && e.agents.length === 1));
    // Three Sends while the agent was busy (not waiting).
    for (const id of ["q1", "q2", "q3"]) await app.post("/jobs", { id, changeSet: changeSet(id) });
    const prompt = await agent.call("pilot_wait_for_edits");
    expect(prompt).toContain("# Pilot: 3 jobs");
    expect(prompt).toContain("call `pilot_done` once per job");
    for (const id of ["q1", "q2", "q3"]) expect(prompt).toContain(`pilot_done\` with \`jobId: "${id}"\``);
    expect(prompt).toContain("## Job 3 of 3");
    for (const id of ["q1", "q2", "q3"]) expect(await agent.call("pilot_done", { jobId: id })).toMatch(/^Done/);
  });

  it("launch → wait → Send → the job → done → the page hears it", async () => {
    const port = nextPort++;
    const agent = await agentClient(port);
    expect(await agent.call("pilot_wait_for_edits")).toMatch(/pilot_launch/);
    expect(await agent.call("pilot_launch", { url: "localhost:5173" })).toMatch(/No page at http:\/\/localhost:5173/);

    const app = fakePage(port);
    await app.ready;
    await until(() => app.events.some((e) => e.type === "agents" && e.agents.length === 1));
    const agents = app.events.find((e) => e.type === "agents" && e.agents.length === 1);
    expect(agents?.type === "agents" && agents.agents[0]?.label).toBe("Claude Code · app");

    const waiting = agent.call("pilot_wait_for_edits");
    await until(() => app.events.some((e) => e.type === "agents" && e.waiting === 1));
    await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    const prompt = await waiting;
    expect(prompt).toContain("# Pilot design edits");
    expect(prompt).toContain("| `padding-top` | `10px` | `22px` | every width |");
    expect(prompt).toContain('pilot_done` with `jobId: "j1"`');

    expect(await agent.call("pilot_done", { jobId: "j1", notes: "used pt-6" })).toMatch(/^Done/);
    await until(() => app.events.some((e) => e.type === "job" && e.job.status === "done"));
    const done = [...app.events].reverse().find((e) => e.type === "job");
    expect(done?.type === "job" && done.job.notes).toBe("used pt-6");

    // A change didn't land: the page asks for one follow-up, with what it gives instead.
    expect(
      (
        await app.post("/jobs/j1/retry", {
          differences: [{ selector: ".btn", property: "padding-top", expected: "22px", outcome: "differs", actual: "24px" }],
        })
      ).status,
    ).toBe(200);
    const followUp = await agent.call("pilot_wait_for_edits");
    expect(followUp).toContain("follow-up");
    expect(followUp).toContain("`main > a.btn` (selector `.btn`, text \"Get started\"): `padding-top` should be `22px`, the page gives `24px`.");
    expect(followUp).toContain('jobId: "j1"');
    await agent.call("pilot_done", { jobId: "j1", notes: "kept pt-6 (24px): the scale's step" });
    // A second retry is refused: the page takes what the code gives.
    expect((await app.post("/jobs/j1/retry", { differences: [] })).status).toBe(409);
  });

  it("launch opens Pilot in the pages already open", async () => {
    const port = nextPort++;
    const agent = await agentClient(port);
    await agent.call("pilot_launch", { url: APP });
    const app = fakePage(port);
    await app.ready;
    await agent.call("pilot_launch", { url: APP });
    await until(() => app.events.some((e) => e.type === "launch"));
  });

  it("two agents share one hub; when the hub's process ends, the other takes over", async () => {
    const port = nextPort++;
    const first = await agentClient(port, 3000);
    const second = await agentClient(port, 3000);
    await first.call("pilot_launch", { url: APP });
    await second.call("pilot_launch", { url: APP });
    expect(first.bridge.isHub).toBe(true);
    expect(second.bridge.isHub).toBe(false);

    const waiting = second.call("pilot_wait_for_edits");
    await new Promise((r) => setTimeout(r, 100));
    await first.bridge.close(); // the hub's chat was closed
    await until(() => second.bridge.isHub, 3000);

    // The page reconnects to the new hub and posts its job (again).
    const app = fakePage(port);
    await app.ready;
    await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    expect(await waiting).toContain('jobId: "j1"');
  });
});

describe("Bridge", () => {
  it("names a port taken by something else", async () => {
    const port = nextPort++;
    const { createServer } = await import("node:http");
    const other = createServer((_, res) => res.end("hello"));
    await new Promise<void>((r) => other.listen(port, "127.0.0.1", () => r()));
    cleanup.push(() => new Promise<void>((r) => other.close(() => r())));
    const bridge = new Bridge({ id: "a", label: "A" }, port);
    await expect(bridge.launch(APP)).rejects.toThrow(/PILOT_PORT/);
  });
});
