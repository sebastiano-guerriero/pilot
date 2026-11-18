import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { olderThan, VERSION } from "./version.ts";

describe("VERSION", () => {
  it("is the usepilot package's: bump both when releasing", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../../usepilot/package.json"), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it("olderThan compares x.y.z", () => {
    expect(olderThan("0.6.0", "0.7.1")).toBe(true);
    expect(olderThan("0.7.1", "0.7.1")).toBe(false);
    expect(olderThan("0.10.0", "0.9.9")).toBe(false);
    expect(olderThan("^0.6.0", "0.7.0")).toBe(true);
  });
});
