import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AgentInfo, ChangeResult, PageEvent, WidthCheck } from "@pilot/protocol";
import { BRIDGE_VERSION, allowOf, jobErrorOf, originKey, projectNameOf, propsOf, questionOf, sessionOf } from "@pilot/protocol";
import { attachmentsDir, extensionOf, MAX_ATTACHMENT_BYTES, saveAttachment, sweepAttachments, withAttachmentPaths } from "./attachments.ts";
import { projectComponents } from "./components.ts";
import { findSkills } from "./skills.ts";
import { fileTokens } from "./tokenFiles.ts";
import { Hub, type JobPost } from "./hub.ts";

/**
 * The hub's HTTP server, on 127.0.0.1 only.
 *
 * Pages (the overlay, a browser page on another origin):
 * - GET  /events                SSE: agents, launch, job updates for the page's origin (`?project=`: the project its loader names)
 * - POST /jobs                  a job (JobPost)
 * - POST /jobs/:id/cancel       take a job back
 * - POST /jobs/:id/retry        a done job's changes that didn't come out right (or a task's problems): one follow-up
 * - POST /jobs/:id/answer       the designer's answer to the agent's question about a done job: back to the agent with it
 * - POST /checks/:requestId     the answer to a width check an agent asked for (`check` event)
 * - POST /quit                  the designer closed Pilot on the page's site: its other pages close it too
 * - POST /attachments           a file for a comment: an image, text file or PDF (the raw bytes, its type as Content-Type): saved in
 *                               the OS temp folder (attachments.ts), answers its id. Jobs name files by id only.
 * The page's origin comes from the `Origin` header the browser always sends,
 * never from the request. Jobs are only taken from an origin Pilot runs an
 * agent for (`npx usepilot` in its project, which registers it), so another
 * website can't hand prompts to the agent.
 *
 * Pilot's processes (`npx usepilot` ones that aren't the hub, see agent.ts):
 * - POST /agents/register | /agents/launch | /agents/wait | /agents/done | /agents/activity | /agents/check | /agents/leave
 * - POST /agents/job            a job as the hub has it (a run polls it, to stop when it's cancelled)
 * - POST /agents/pages          the pages with Pilot open: each site and the project its loader names, but sites Pilot runs for
 * Refused for any request with an `Origin` (browsers send one; Node doesn't).
 *
 * GET /health tells an `npx usepilot` that the port is Pilot's.
 */

export interface HubServer {
  hub: Hub;
  server: Server;
  port: number;
  close(): Promise<void>;
}

/** Starts the hub on `port`; rejects with EADDRINUSE when another process has it. */
export function startHub(port: number, hub = new Hub(), options: { attachments?: string } = {}): Promise<HubServer> {
  const attachments = options.attachments ?? attachmentsDir();
  void sweepAttachments(attachments);
  const server = createServer((req, res) => {
    handle(hub, req, res, attachments).catch((error) => {
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

async function handle(hub: Hub, req: IncomingMessage, res: ServerResponse, attachments: string): Promise<void> {
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

  if (path === "/events" && req.method === "GET") return events(hub, origin, req, res, projectNameOf(url.searchParams.get("project")));
  // Quitting reaches only the page's own site (its Origin): no agent needed, nothing taken from it.
  if (path === "/quit" && req.method === "POST") {
    hub.quit(origin);
    return json(res, 200, { ok: true });
  }

  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!hub.hasAgents(origin)) return json(res, 403, { error: "Pilot isn't running for this site: run npx usepilot in your project" });

  // The project's components, for the comment box's `@` list (components.ts).
  if (path === "/components") return json(res, 200, { components: projectComponents(hub.folders(origin)) });
  // The project's tokens that only live in files, for the page's variables (tokenFiles.ts).
  if (path === "/tokens") return json(res, 200, { tokens: fileTokens(hub.folders(origin)) });
  // The skills of the agent Pilot runs for the page, for the comment box's `/` list (skills.ts): names and descriptions, never where they are.
  if (path === "/skills") return json(res, 200, { skills: findSkills(hub.skillFolders(origin)) });

  if (path === "/attachments") {
    const type = req.headers["content-type"] ?? "";
    if (!extensionOf(type)) return json(res, 415, { error: "images (png, jpeg, gif, webp), text files (txt, md, csv, json) and PDFs only" });
    const bytes = await rawBody(req, MAX_ATTACHMENT_BYTES);
    if (!bytes) return json(res, 413, { error: `files up to ${MAX_ATTACHMENT_BYTES / 1_000_000} MB` });
    const id = await saveAttachment(bytes, type, attachments);
    return id ? json(res, 201, { id }) : json(res, 400, { error: "not a file of that type" });
  }

  const data = (await body(req)) as Record<string, unknown>;
  if (path === "/jobs") {
    const post = data as unknown as JobPost;
    if (typeof post?.id !== "string" || !post.changeSet) return json(res, 400, { error: "job needs id and changeSet" });
    return json(res, 202, { job: hub.postJob(origin, withAttachmentPaths({ ...post, session: sessionOf(post.session) }, attachments)) });
  }
  const jobRoute = path.match(/^\/jobs\/([^/]+)\/(cancel|retry|answer)$/);
  if (jobRoute) {
    const [, id, action] = jobRoute as unknown as [string, string, string];
    const answer = (data as { answer?: unknown }).answer;
    if (action === "answer" && (typeof answer !== "string" || !answer.trim())) return json(res, 400, { error: "answer needed" });
    const job =
      action === "cancel"
        ? hub.cancel(origin, decodeURIComponent(id))
        : action === "answer"
          ? hub.answer(origin, decodeURIComponent(id), (answer as string).trim().slice(0, 2000))
          : hub.retry(
            origin,
            decodeURIComponent(id),
            ((data as { differences?: ChangeResult[] }).differences ?? []).slice(0, 200),
            stringsOf((data as { issues?: unknown }).issues),
          );
    return job ? json(res, 200, { job }) : json(res, 409, { error: `can't ${action} this job` });
  }
  const checkRoute = path.match(/^\/checks\/([^/]+)$/);
  if (checkRoute) {
    const check = (data as { check?: WidthCheck }).check;
    if (!check || !Array.isArray(check.widths)) return json(res, 400, { error: "check needed" });
    return hub.checkResult(origin, decodeURIComponent(checkRoute[1] as string), check)
      ? json(res, 200, { ok: true })
      : json(res, 409, { error: "no check waits for this" });
  }
  return json(res, 404, { error: "not found" });
}

function events(hub: Hub, origin: string, req: IncomingMessage, res: ServerResponse, project?: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  // EventSource reconnects by itself after a drop: every 2s, quickly enough
  // for a takeover by another `npx usepilot`.
  res.write("retry: 2000\n\n");
  const send = (event: PageEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const remove = hub.addPage({ origin, project, send });
  const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(ping);
    remove();
  });
}

async function handleAgent(hub: Hub, action: string, data: unknown, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const d = data as { agent: AgentInfo; origin?: string; jobId?: string; notes?: string; question?: unknown; props?: unknown; session?: unknown; error?: unknown; allow?: unknown; timeoutMs?: number };
  if (!d?.agent?.id) return json(res, 400, { error: "agent needed" });
  switch (action) {
    case "register":
      if (!d.origin) return json(res, 400, { error: "origin needed" });
      hub.register(d.agent, d.origin);
      return json(res, 200, { ok: true });
    case "pages":
      return json(res, 200, { pages: hub.openPages() });
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
      return json(res, 200, {
        job: hub.done(d.agent.id, d.jobId, d.notes, questionOf(d.question), propsOf(d.props), { session: sessionOf(d.session), error: jobErrorOf(d.error), allow: allowOf(d.allow) }),
      });
    case "activity":
      if (!d.jobId) return json(res, 400, { error: "jobId needed" });
      hub.activity(d.agent.id, d.jobId);
      return json(res, 200, {});
    case "job":
      if (!d.jobId) return json(res, 400, { error: "jobId needed" });
      return json(res, 200, { job: hub.job(d.jobId) ?? null });
    case "check": {
      if (!d.jobId) return json(res, 400, { error: "jobId needed" });
      const check = await hub.check(d.jobId, Math.min(d.timeoutMs ?? CHECK_TIMEOUT, 2 * 60_000));
      return json(res, 200, { check });
    }
    case "leave":
      hub.unregister(d.agent.id);
      return json(res, 200, { ok: true });
    default:
      return json(res, 404, { error: "not found" });
  }
}

/** How long a width check may take: frames loading the page at each width. */
export const CHECK_TIMEOUT = 60_000;

/** Up to 100 strings of at most 2000 characters, from a page's post; undefined for anything else. */
function stringsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string").slice(0, 100).map((v) => v.slice(0, 2000));
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/** A request's raw bytes, or null past `max` (the rest isn't read). */
function rawBody(req: IncomingMessage, max: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > max) {
        over = true;
        resolve(null);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!over) resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
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
