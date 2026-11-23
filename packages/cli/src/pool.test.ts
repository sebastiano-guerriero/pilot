import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { saveSessions, savedSessions } from "./config.ts";
import { MAX_AGE_MS, MAX_JOBS, SessionPool } from "./pool.ts";

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), "pilot-pool-"));
  return { folder: join(dir, "app"), file: join(dir, "projects.json") };
};

describe("the editor's sessions", () => {
  it("a job takes a free session, a job at once a new one; each kept after, and saved", () => {
    const { folder, file } = setup();
    const pool = new SessionPool(folder, "claude", file);
    const first = pool.take();
    expect(first.resume).toBeUndefined();
    first.release("s1");
    const again = pool.take();
    expect(again.resume).toBe("s1");
    // s1 is busy: a job at the same time starts its own.
    const parallel = pool.take();
    expect(parallel.resume).toBeUndefined();
    parallel.release("s2");
    again.release("s1");
    expect(pool.kept.map((s) => [s.id, s.jobs])).toEqual([
      ["s1", 2],
      ["s2", 1],
    ]);
    // Found again when Pilot starts again.
    expect(new SessionPool(folder, "claude", file).take().resume).toBe("s1");
  });

  it("dropped when resuming it fails; retired after its jobs or a day", () => {
    const { folder, file } = setup();
    let now = 1_000;
    const pool = new SessionPool(folder, "claude", file, () => now);
    pool.take().release("old");
    const lease = pool.take();
    expect(lease.resume).toBe("old");
    lease.release("new"); // The run started over, in a new session.
    expect(pool.kept.map((s) => s.id)).toEqual(["new"]);
    for (let i = 1; i < MAX_JOBS; i++) {
      const l = pool.take();
      l.release(l.resume);
    }
    expect(pool.kept).toEqual([]);
    pool.take().release("fresh");
    now += MAX_AGE_MS;
    expect(pool.take().resume).toBeUndefined();
  });

  it("a follow-up waits for its own session when another job has it", async () => {
    const { folder, file } = setup();
    const pool = new SessionPool(folder, "claude", file);
    pool.take().release("s1");
    const other = pool.take();
    let got = false;
    const own = pool.takeOwn("s1").then((l) => {
      got = true;
      return l;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toBe(false);
    other.release("s1");
    const lease = await own;
    expect(lease.resume).toBe("s1");
    lease.release("s1");
  });

  it("another agent's sessions for the project stay", () => {
    const { folder, file } = setup();
    saveSessions(folder, [{ agent: "codex", id: "c1", jobs: 1, since: Date.now() }], file);
    const pool = new SessionPool(folder, "claude", file);
    expect(pool.take().resume).toBeUndefined();
    pool.take().release("s1");
    expect(savedSessions(folder, file).map((s) => s.id).sort()).toEqual(["c1", "s1"]);
  });
});
