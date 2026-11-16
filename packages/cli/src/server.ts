import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AgentInfo, ChangeResult, PageEvent } from "@pilot/protocol";
import { BRIDGE_VERSION, originKey } from "@pilot/protocol";
import { Hub, type JobPost } from "./hub.ts";

/**
 * The hub's HTTP server, on 127.0.0.1 only.
 *
 * Pages (the overlay, a browser page on another origin):
 * - GET  /events                SSE: agents, launch, job updates for the page's origin
 * - POST /jobs                  a job (JobPost)
 * - POST /jobs/:id/cancel       take a job back
 * - POST /jobs/:id/retry        a done job's changes that didn't come out right: one follow-up
 * The page's origin comes from the `Origin` header the browser always sends,
 * never from the request. Jobs are only taken from an origin an agent works
 * on (it ran /pilot for it), so another website can't hand prompts to the
 * agent.
 *
 * Agents (`pilot mcp` processes that aren't the hub, see agent.ts):
 * - POST /agents/register | /agents/launch | /agents/wait | /agents/done | /agents/leave
 * Refused for any request with an `Origin` (browsers send one; Node doesn't).
 *
 * GET /health tells a `pilot mcp` that the port is Pilot's.
 */

export interface HubServer {
  hub: Hub;
  server: Server;
  port: number;
  close(): Promise<void>;
}

/** Starts the hub on `port`; rejects with EADDRINUSE when another process has it. */
export function startHub(port: number, hub = new Hub()): Promise<HubServer> {
  const server = createServer((req, res) => {
    handle(hub, req, res).catch((error) => {
      if (!res.headersSent) json(res, 500, { error: String(error) });
    });
  });
  const sweep = setInterval(() => hub.sweep(localAgents), 5_000);
  sweep.unref();
  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      clearInterval(sweep);
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        hub,
        server,
        port: typeof address === "object" && address ? address.port : port,
        close: () =>
          new Promise((done) => {
            clearInterval(sweep);
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Agents in the hub's own process: never swept (see Hub.sweep). */
export const localAgents = new Set<string>();

async function handle(hub: Hub, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const origin = req.headers.origin;
  const path = url.pathname;

  if (path === "/health") return json(res, 200, { pilot: true, version: BRIDGE_VERSION });

  if (path.startsWith("/agents/")) {
    if (origin) return json(res, 403, { error: "agents only" });
    if (req.method !== "POST") return json(res, 405, { error: "POST only" });
    return handleAgent(hub, path.slice("/agents/".length), await body(req), req, res);
  }

  // Page routes: CORS for the page's origin.
  if (!origin || originKey(origin) === "null") return json(res, 400, { error: "no origin" });
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, GET");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.writeHead(204).end();
    return;
  }

  if (path === "/events" && req.method === "GET") return events(hub, origin, req, res);

  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!hub.hasAgents(origin)) return json(res, 403, { error: "no agent works on this page: run /pilot in your agent" });

  const data = (await body(req)) as Record<string, unknown>;
  if (path === "/jobs") {
    const post = data as unknown as JobPost;
    if (typeof post?.id !== "string" || !post.changeSet) return json(res, 400, { error: "job needs id and changeSet" });
    return json(res, 202, { job: hub.postJob(origin, post) });
  }
  const jobRoute = path.match(/^\/jobs\/([^/]+)\/(cancel|retry)$/);
  if (jobRoute) {
    const [, id, action] = jobRoute as unknown as [string, string, string];
    const job =
      action === "cancel"
        ? hub.cancel(origin, decodeURIComponent(id))
        : hub.retry(origin, decodeURIComponent(id), ((data as { differences?: ChangeResult[] }).differences ?? []).slice(0, 200));
    return job ? json(res, 200, { job }) : json(res, 409, { error: `can't ${action} this job` });
  }
  return json(res, 404, { error: "not found" });
}

function events(hub: Hub, origin: string, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  // EventSource reconnects by itself after a drop: every 2s, quickly enough
  // for a takeover by another `pilot mcp`.
  res.write("retry: 2000\n\n");
  const send = (event: PageEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const remove = hub.addPage({ origin, send });
  const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(ping);
    remove();
  });
}

async function handleAgent(hub: Hub, action: string, data: unknown, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const d = data as { agent: AgentInfo; origin?: string; jobId?: string; notes?: string; timeoutMs?: number };
  if (!d?.agent?.id) return json(res, 400, { error: "agent needed" });
  switch (action) {
    case "register":
      if (!d.origin) return json(res, 400, { error: "origin needed" });
      hub.register(d.agent, d.origin);
      return json(res, 200, { ok: true });
    case "launch":
      if (!d.origin) return json(res, 400, { error: "origin needed" });
      return json(res, 200, { pages: hub.launch(d.agent, d.origin) });
    case "wait": {
      if (!d.origin) return json(res, 400, { error: "origin needed" });
      const aborted = new AbortController();
      // The agent's request closed early (it was cancelled, or its process ended).
      res.on("close", () => aborted.abort());
      const result = await hub.wait(d.agent, d.origin, Math.min(d.timeoutMs ?? 60_000, 15 * 60_000), aborted.signal);
      if (!res.writableEnded && !res.destroyed) json(res, 200, result);
      return;
    }
    case "done":
      if (!d.jobId) return json(res, 400, { error: "jobId needed" });
      return json(res, 200, { job: hub.done(d.agent.id, d.jobId, d.notes) });
    case "leave":
      hub.unregister(d.agent.id);
      return json(res, 200, { ok: true });
    default:
      return json(res, 404, { error: "not found" });
  }
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      text += chunk;
      if (text.length > 5_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}
