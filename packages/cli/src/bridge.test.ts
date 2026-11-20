import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
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

async function agentClient(port: number, waitMs = 2000, options: { cwd?: string; roots?: string[] } = {}) {
  const { server, bridge } = createPilotServer({ port, cwd: options.cwd ?? "/work/app", waitMs });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "claude-code", version: "1.0.0" }, options.roots ? { capabilities: { roots: {} } } : {});
  // A client that shares its workspace folders (MCP roots).
  if (options.roots) client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: (options.roots ?? []).map((p) => ({ uri: pathToFileURL(p).href })) }));
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
  it("closing Pilot closes it on the site's other tabs, and nothing else: the agent keeps taking jobs", async () => {
    const port = nextPort++;
    const agent = await agentClient(port);
    await agent.call("pilot_launch", { url: APP, folder: "/work/app" }); // starts the hub
    const app = fakePage(port);
    await app.ready;
    const waiting = agent.call("pilot_wait_for_edits");
    await until(() => app.events.some((e) => e.type === "agents" && e.waiting === 1));
    const other = fakePage(port); // another tab of the site
    await other.ready;
    await app.post("/quit", {});
    await until(() => other.events.some((e) => e.type === "quit"));
    await app.post("/jobs", { id: "q1", changeSet: changeSet("q1") });
    expect(await waiting).toContain("q1");
  });

  it("launches on the whole site where Pilot is open, without a URL; a public page never gets an agent by itself", async () => {
    const port = nextPort++;
    const agent = await agentClient(port);
    // Nothing open yet: ask the designer to open the app, any page.
    expect(await agent.call("pilot_launch", { folder: "/work/app" })).toContain("No page has Pilot open yet");
    // A public site loading Pilot is ignored; the local one is the one.
    const outside = fakePage(port, "https://example.com");
    await outside.ready;
    const app = fakePage(port);
    await app.ready;
    const launched = await agent.call("pilot_launch", { folder: "/work/app" });
    expect(launched).toContain(`Pilot is open on ${APP}, on every page`);
    await until(() => app.events.some((e) => e.type === "launch"));
    expect(outside.events.some((e) => e.type === "launch")).toBe(false);
    // Another port of the same machine (a proxy's): another site, and the one that's open is named.
    expect(await agent.call("pilot_launch", { url: "http://localhost:3003/icons", folder: "/work/app" })).toContain(
      `No page at http://localhost:3003 has Pilot open, but ${APP} does`,
    );
    // Two local sites open: the agent is asked to pick.
    const other = fakePage(port, "http://localhost:8888");
    await other.ready;
    expect(await agent.call("pilot_launch", { folder: "/work/app" })).toContain("Pilot is open on several sites");
  });

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

  it("started outside the project (Cursor starts it in the home folder): the agent's folder, or the client's roots, is where Pilot searches", async () => {
    const home = await mkdtemp(join(tmpdir(), "pilot-home-"));
    const project = await mkdtemp(join(tmpdir(), "pilot-app-"));
    cleanup.push(() => rm(home, { recursive: true, force: true }), () => rm(project, { recursive: true, force: true }));
    await writeFile(join(project, "package.json"), "{}");
    await mkdir(join(project, "src"));
    await writeFile(join(project, "src/Hero.tsx"), 'export function Hero() {\n  return <a className="btn" href="#">Get started</a>;\n}\n');

    // No folder: the agent is told to pass it.
    const port = nextPort++;
    const agent = await agentClient(port, 2000, { cwd: home });
    expect(await agent.call("pilot_launch", { url: APP })).toContain("call pilot_launch again with `folder`");
    // With it: labeled by the project, and jobs say where the code is.
    expect(await agent.call("pilot_launch", { url: APP, folder: project })).not.toContain("folder");
    const app = fakePage(port);
    await app.ready;
    await until(() => app.events.some((e) => e.type === "agents" && e.agents[0]?.label === `Claude Code · ${basename(project)}`));
    const waiting = agent.call("pilot_wait_for_edits");
    await until(() => app.events.some((e) => e.type === "agents" && e.waiting === 1));
    await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    expect(await waiting).toContain("→ `src/Hero.tsx:2`");

    // The project has a newer Pilot than this server (a client that kept its server running after an update): how to restart it.
    await mkdir(join(project, "node_modules/usepilot"), { recursive: true });
    await writeFile(join(project, "node_modules/usepilot/package.json"), JSON.stringify({ version: "99.0.0" }));
    const stale = await agent.call("pilot_launch", { url: APP, folder: project });
    expect(stale).toContain("older than the project's 99.0.0");
    expect(stale).toContain("In Claude Code, open a new chat");
    // Restarting alone wouldn't do with an old `npx usepilot` registration: update moves it to @latest first.
    expect(stale).toContain("run `npx usepilot@latest update` in the app's folder");

    // A client sharing its workspace (MCP roots): no folder needed.
    const port2 = nextPort++;
    const rooted = await agentClient(port2, 2000, { cwd: home, roots: [home, project] });
    await new Promise((r) => setTimeout(r, 50));
    expect(await rooted.call("pilot_launch", { url: APP })).not.toContain("call pilot_launch again with `folder`");
    // The project's Pilot older than this server, and no page connected: the project needs updating.
    await writeFile(join(project, "node_modules/usepilot/package.json"), JSON.stringify({ version: "0.0.1" }));
    const behind = await rooted.call("pilot_launch", { url: APP, folder: project });
    expect(behind).toContain("The project's Pilot is 0.0.1, older than this server's");
    expect(behind).toContain("then restart the app's dev server");
  });

  it("the page asks for the project's components (the `@` list): read from the agent's folder, which pages never see", async () => {
    const project = await mkdtemp(join(tmpdir(), "pilot-app-"));
    cleanup.push(() => rm(project, { recursive: true, force: true }));
    await writeFile(join(project, "package.json"), "{}");
    await mkdir(join(project, "src"));
    await writeFile(join(project, "src/Pricing.tsx"), "export function PricingTable() {\n  return <table />;\n}\n");
    const port = nextPort++;
    const agent = await agentClient(port, 2000, { cwd: project });
    await agent.call("pilot_launch", { url: APP });
    const app = fakePage(port);
    await app.ready;
    const res = await app.post("/components", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ components: [{ name: "PricingTable", file: "src/Pricing.tsx", line: 1 }] });
    // Another site gets nothing.
    expect((await fakePage(port, "https://evil.example").post("/components", {})).status).toBe(403);
    // The tokens in its files too (tokenFiles.ts).
    await mkdir(join(project, "tokens"));
    await writeFile(join(project, "tokens/colors.json"), JSON.stringify({ brand: { $value: "#1cf69e" } }));
    const tokens = await (await app.post("/tokens", {})).json();
    expect(tokens).toEqual({ tokens: [{ name: "brand", value: "#1cf69e", file: "tokens/colors.json", line: 1 }] });
    // The folder stays in the hub: the page's events (agents, launch) never carry it.
    await until(() => app.events.some((e) => e.type === "agents" && e.agents.length > 0));
    expect(JSON.stringify(app.events)).not.toContain(project);
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
