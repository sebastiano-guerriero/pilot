import { describe, expect, it } from "vitest";
import { clientOf, RESTART } from "./clients.ts";

describe("clients", () => {
  it("knows each client by its MCP name", () => {
    expect(clientOf("claude-code")).toBe("claude-code");
    expect(clientOf("cursor-vscode")).toBe("cursor");
    expect(clientOf("Visual Studio Code")).toBe("vscode");
    expect(clientOf("codex-mcp-client")).toBe("codex");
    expect(clientOf("something-else")).toBeNull();
    expect(clientOf(undefined)).toBeNull();
  });

  it("says how each loads a new Pilot, naming no model", () => {
    for (const how of Object.values(RESTART)) expect(how).not.toMatch(/opus|sonnet|haiku|gpt|gemini/i);
    expect(RESTART.cursor).toContain("switch `pilot` off and on");
  });
});
