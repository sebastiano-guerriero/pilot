import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangeSet, CommentMessage, Job } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bridge } from "./agent.ts";
import { attachmentBlocks, newAttachments, saveAttachment, sweepAttachments, withAttachmentPaths } from "./attachments.ts";
import { startHub } from "./server.ts";

const APP = "http://localhost:5173";
/** A 1×1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let base: string;
let dir: string;
const cleanup: Array<() => Promise<void> | void> = [];
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "pilot-test-"));
  dir = join(base, "pilot-attachments");
});
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
  await rm(base, { recursive: true, force: true });
});

const commentSet = (id: string, thread: CommentMessage[]): ChangeSet => ({
  id,
  createdAt: new Date().toISOString(),
  page: { url: `${APP}/`, title: "App", viewport: { width: 1200, height: 800 } },
  edits: [],
  request: { kind: "comment", target: { selector: "h1", path: "main > h1", tag: "h1", classes: [] }, thread, breakpoints: [] },
});
const job = (changeSet: ChangeSet): Job => ({ id: changeSet.id, origin: APP, changeSet, status: "queued", createdAt: "", updatedAt: "" });

const PDF = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n", "latin1");
const NOTES = Buffer.from("Use the brand green: #1CF69E\nNot the old one.\n");

describe("comment attachments", () => {
  it("saves an image by its content, once, and refuses what isn't one", async () => {
    const id = await saveAttachment(PNG, "image/png", dir);
    expect(id).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(await saveAttachment(PNG, "image/png", dir)).toBe(id);
    expect(await saveAttachment(PNG, "text/html", dir)).toBeNull();
    expect(await saveAttachment(Buffer.alloc(0), "image/png", dir)).toBeNull();
  });

  it("takes text files and PDFs, each checked to be what its type says", async () => {
    expect(await saveAttachment(NOTES, "text/plain", dir)).toMatch(/^[a-f0-9]{64}\.txt$/);
    expect(await saveAttachment(NOTES, "text/markdown; charset=utf-8", dir)).toMatch(/\.md$/);
    expect(await saveAttachment(PDF, "application/pdf", dir)).toMatch(/\.pdf$/);
    // A binary posing as text, a PNG posing as a PDF, an HTML page: refused.
    expect(await saveAttachment(PNG, "text/plain", dir)).toBeNull();
    expect(await saveAttachment(PNG, "application/pdf", dir)).toBeNull();
    expect(await saveAttachment(NOTES, "image/png", dir)).toBeNull();
    expect(await saveAttachment(Buffer.from("<script>alert(1)</script>"), "text/html", dir)).toBeNull();
  });

  it("shows the agent text files' contents and images, and leaves PDFs to their path", async () => {
    const txt = (await saveAttachment(NOTES, "text/plain", dir)) as string;
    const pdf = (await saveAttachment(PDF, "application/pdf", dir)) as string;
    const set = withAttachmentPaths(
      {
        changeSet: commentSet("t1", [
          {
            from: "designer",
            text: "",
            at: "",
            attachments: [
              { id: txt, name: "notes.txt" },
              { id: pdf, name: "spec.pdf" },
            ],
          },
        ]),
      },
      dir,
    ).changeSet;
    const blocks = await attachmentBlocks(job(set));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "text" });
    expect((blocks[0] as { text: string }).text).toContain("Use the brand green");
  });

  it("the hub adds the paths, and drops ids that aren't attachments it has", async () => {
    const id = (await saveAttachment(PNG, "image/png", dir)) as string;
    const missing = `${"0".repeat(64)}.png`;
    const set = commentSet("j1", [
      {
        from: "designer",
        text: "",
        at: "",
        attachments: [{ id, name: "shot.png", path: "/etc/passwd" }, { id: "../../etc/passwd" }, { id: missing }],
      },
    ]);
    const kept = withAttachmentPaths({ changeSet: set }, dir).changeSet.request;
    expect(kept?.kind === "comment" && kept.thread[0]?.attachments).toEqual([{ id, name: "shot.png", path: join(dir, id) }]);
  });

  it("shows the agent the new comments' images, not those it already answered", async () => {
    const first = (await saveAttachment(PNG, "image/png", dir)) as string;
    const set = withAttachmentPaths(
      {
        changeSet: commentSet("j2", [
          { from: "designer", text: "this", at: "", attachments: [{ id: first }] },
          { from: "agent", text: "Done.", at: "" },
          { from: "designer", text: "and this", at: "", attachments: [{ id: first }] },
        ]),
      },
      dir,
    ).changeSet;
    expect(await attachmentBlocks(job(set))).toEqual([{ type: "image", data: PNG.toString("base64"), mimeType: "image/png" }]);
    // A path outside a Pilot attachments folder is never read.
    const forged = commentSet("j3", [{ from: "designer", text: "", at: "", attachments: [{ id: first, path: "/etc/hosts" }] }]);
    expect(await attachmentBlocks(job(forged))).toEqual([]);
  });

  it("clears images older than a week", async () => {
    const id = (await saveAttachment(PNG, "image/png", dir)) as string;
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(join(dir, id), old, old);
    await sweepAttachments(dir);
    expect(
      withAttachmentPaths({ changeSet: commentSet("j4", [{ from: "designer", text: "", at: "", attachments: [{ id }] }]) }, dir).changeSet
        .request,
    ).toMatchObject({
      thread: [{ attachments: undefined }],
    });
  });

  it("end to end: the page uploads an image, sends it alone, and the run gets it", async () => {
    const hub = await startHub(0, undefined, { attachments: dir });
    cleanup.push(() => hub.close());
    const bridge = new Bridge({ id: "runner", label: "Claude Code · app" }, hub.port);
    cleanup.push(() => bridge.close());
    await bridge.launch(APP);

    const page = (path: string, body: string | Buffer, type: string) =>
      fetch(`http://127.0.0.1:${hub.port}${path}`, { method: "POST", headers: { origin: APP, "content-type": type }, body });
    expect(
      (
        await fetch(`http://127.0.0.1:${hub.port}/attachments`, {
          method: "POST",
          headers: { origin: "https://evil.example", "content-type": "image/png" },
          body: PNG,
        })
      ).status,
    ).toBe(403);
    expect((await page("/attachments", "<svg/>", "image/svg+xml")).status).toBe(415);
    const upload = await page("/attachments", PNG, "image/png");
    expect(upload.status).toBe(201);
    const { id } = (await upload.json()) as { id: string };

    const set = commentSet("c1", [{ from: "designer", text: "", at: new Date().toISOString(), attachments: [{ id, name: "sketch.png" }] }]);
    expect((await page("/jobs", JSON.stringify({ id: "c1", changeSet: set, status: "queued" }), "application/json")).status).toBe(202);

    const { job: taken } = await bridge.wait(APP, 2000);
    // The hub gave it the file's path (never the page): the run reads it from there.
    expect(newAttachments(taken as Job).map((f) => f.path)).toEqual([join(dir, id)]);
    expect(await attachmentBlocks(taken as Job)).toEqual([{ type: "image", data: PNG.toString("base64"), mimeType: "image/png" }]);
  });
});
