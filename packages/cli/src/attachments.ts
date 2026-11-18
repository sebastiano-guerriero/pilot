import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  ATTACHMENT_ID,
  ATTACHMENT_TYPES,
  type AttachmentExtension,
  attachmentKind,
  type CommentAttachment,
  type Job,
} from "@pilot/protocol";

/**
 * Files the designer attaches to comments (images, text files, PDFs), saved
 * by the hub in the OS temp folder: never in the project (nothing to commit
 * or ship), and the system clears it in time. Named by content (a SHA-256),
 * so the same file sent twice is one file. Each is checked to be what its
 * type says before it's saved. Nothing ever serves, opens or runs them: the
 * agent is shown images and text with the job (`attachmentBlocks`) and
 * reads PDFs from their path.
 *
 * Pages send only ids; the hub adds the path when it takes a job
 * (`withAttachmentPaths`), so a page can't point the agent at another file.
 */

/** The folder's name in the temp folder: also how a path is recognized as Pilot's. */
const FOLDER = "pilot-attachments";
/** The largest file the hub takes, in bytes. */
export const MAX_ATTACHMENT_BYTES = 10_000_000;
/** The largest image shown to the agent inline, in bytes (the model's limit, with room for base64); bigger ones are listed by path only. */
const MAX_INLINE_IMAGE = 3_500_000;
/** The largest text file shown to the agent inline, in bytes; bigger ones are read from their path. */
const MAX_INLINE_TEXT = 100_000;
/** Files older than this are cleared when a hub starts. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export function attachmentsDir(base = tmpdir()): string {
  return join(base, FOLDER);
}

/** The extension a type is saved with, or null when Pilot doesn't take it. */
export function extensionOf(type: string): AttachmentExtension | null {
  const given = type.split(";")[0]?.trim().toLowerCase();
  const found = Object.entries(ATTACHMENT_TYPES).find(([, t]) => t === given);
  return found ? (found[0] as AttachmentExtension) : null;
}

/**
 * The bytes are what the type says: an image's or a PDF's signature, or
 * text (UTF-8, no NUL bytes), so a binary can't come in as `text/plain`.
 */
export function looksLike(bytes: Buffer, ext: AttachmentExtension): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (ext) {
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "jpg":
      return starts(0xff, 0xd8, 0xff);
    case "gif":
      return starts(0x47, 0x49, 0x46, 0x38);
    case "webp":
      return starts(0x52, 0x49, 0x46, 0x46) && bytes.subarray(8, 12).toString("latin1") === "WEBP";
    case "pdf":
      return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    default:
      if (bytes.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
      } catch {
        return false;
      }
  }
}

/** Saves a file; its id, or null when it isn't one Pilot takes. */
export async function saveAttachment(bytes: Buffer, type: string, dir = attachmentsDir()): Promise<string | null> {
  const ext = extensionOf(type);
  if (!ext || bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES || !looksLike(bytes, ext)) return null;
  const id = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
  await mkdir(dir, { recursive: true });
  const path = join(dir, id);
  if (!existsSync(path)) await writeFile(path, bytes);
  return id;
}

/**
 * A job as the hub keeps it: each comment attachment with its path, for an
 * id that's an attachment's and whose file is there. Anything else a page
 * put in `attachments` is dropped.
 */
export function withAttachmentPaths<T extends { changeSet: Job["changeSet"] }>(job: T, dir = attachmentsDir()): T {
  const request = job.changeSet.request;
  const kept = (files: CommentAttachment[] | undefined): CommentAttachment[] | undefined => {
    if (!Array.isArray(files)) return undefined;
    const valid = files
      .filter((file) => typeof file?.id === "string" && ATTACHMENT_ID.test(file.id) && existsSync(join(dir, file.id)))
      .slice(0, 20)
      .map((file) => ({
        id: file.id,
        name: typeof file.name === "string" ? file.name.slice(0, 200) : undefined,
        path: join(dir, file.id),
      }));
    return valid.length ? valid : undefined;
  };
  // A task asked from the comment box (Make responsive, Break and fix) carries its own.
  if (request && request.kind !== "comment")
    return { ...job, changeSet: { ...job.changeSet, request: { ...request, attachments: kept(request.attachments) } } };
  if (request?.kind !== "comment") return job;
  const thread = request.thread.map((message) => (message.attachments ? { ...message, attachments: kept(message.attachments) } : message));
  return { ...job, changeSet: { ...job.changeSet, request: { ...request, thread } } };
}

/** An MCP content block shown to the agent with a job. */
export type AttachmentBlock = { type: "image"; data: string; mimeType: string } | { type: "text"; text: string };

/**
 * The attachments of a comment job's new comments (the designer's, since
 * the agent's last reply), to show the agent with the job: images as
 * images, text files as their contents. PDFs aren't sent (the agent opens
 * them from their path), nor files too big to send. Only files in a Pilot
 * attachments folder, named as attachments are.
 */
export async function attachmentBlocks(job: Job): Promise<AttachmentBlock[]> {
  const request = job.changeSet.request;
  let files: CommentAttachment[];
  if (request && request.kind !== "comment") files = request.attachments ?? [];
  else if (request?.kind === "comment") {
    const lastReply = request.thread.map((m) => m.from).lastIndexOf("agent");
    files = request.thread.slice(lastReply + 1).flatMap((m) => m.attachments ?? []);
  } else return [];
  const blocks: AttachmentBlock[] = [];
  for (const file of files) {
    const path = file.path;
    if (!path || basename(dirname(path)) !== FOLDER || !ATTACHMENT_ID.test(basename(path))) continue;
    const kind = attachmentKind(path);
    if (kind === "pdf") continue;
    try {
      const size = (await stat(path)).size;
      if (kind === "image") {
        if (size > MAX_INLINE_IMAGE) continue;
        const ext = basename(path).split(".").pop() as AttachmentExtension;
        blocks.push({ type: "image", data: (await readFile(path)).toString("base64"), mimeType: ATTACHMENT_TYPES[ext] });
      } else {
        if (size > MAX_INLINE_TEXT) continue;
        const name = file.name ?? basename(path);
        blocks.push({
          type: "text",
          text: `Attached file ${name}, as the designer sent it:\n\n${await readFile(path, "utf8")}\n\n(end of ${name})`,
        });
      }
    } catch {
      // Gone (cleared): the prompt still names it.
    }
  }
  return blocks;
}

/** Clears files older than a week. Best effort: run when a hub starts. */
export async function sweepAttachments(dir = attachmentsDir(), now = Date.now()): Promise<void> {
  try {
    for (const name of await readdir(dir)) {
      if (!ATTACHMENT_ID.test(name)) continue;
      const path = join(dir, name);
      if (now - (await stat(path)).mtimeMs > KEEP_MS) await rm(path, { force: true });
    }
  } catch {
    // No folder yet, or not ours to clear.
  }
}
