import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSetUp, markSetUp, saveAgent } from "./config.ts";

describe("isSetUp", () => {
  it("the project however it's named: a link to its folder (Windows' short names alike), set up by init or with an agent saved", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-config-"));
    const app = join(dir, "app");
    mkdirSync(app);
    const link = join(dir, "link");
    symlinkSync(app, link, "junction");
    const file = join(dir, "projects.json");
    expect(isSetUp(app, file)).toBe(false);
    markSetUp(app, file);
    expect(isSetUp(app, file)).toBe(true);
    expect(isSetUp(link, file)).toBe(true);
    // An agent saved before the marker existed counts too.
    const other = join(dir, "other");
    mkdirSync(other);
    saveAgent(other, "codex", file);
    expect(isSetUp(other, file)).toBe(true);
    expect(isSetUp(join(dir, "nope"), file)).toBe(false);
  });
});
