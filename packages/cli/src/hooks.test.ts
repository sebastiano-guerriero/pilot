import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The hooks only decide when Pilot starts and stops: the starter itself (dev.ts) has its own tests. Mocked, so no test
// here looks for the machine's real agents.
const calls: Array<{ cwd?: string; url?: string; out?: (line: string) => void }> = [];
const closed: number[] = [];
vi.mock("./dev.ts", () => ({
  startWithDevServer: (options: { cwd?: string; url?: string; out?: (line: string) => void }) => {
    calls.push(options);
    const n = calls.length;
    return { started: Promise.resolve(null), close: async () => void closed.push(n) };
  },
}));
const { pilot } = await import("./vite.ts");
const { DEV_PHASE, withPilot } = await import("./next.ts");

beforeEach(() => {
  calls.length = 0;
  closed.length = 0;
});

describe("usepilot/vite", () => {
  it("only while Vite serves; starts once it listens, with Vite's address and log; stops when the server closes", async () => {
    const plugin = pilot();
    expect(plugin).toMatchObject({ name: "usepilot", apply: "serve" });
    const httpServer = new EventEmitter();
    const logged: string[] = [];
    plugin.configureServer({
      config: { root: "/app/src", logger: { info: (m: string) => logged.push(m) } },
      httpServer,
      resolvedUrls: { local: ["http://localhost:5173/"] },
    });
    expect(calls).toHaveLength(0);
    httpServer.emit("listening");
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ cwd: "/app/src", url: "http://localhost:5173/" });
    calls[0]?.out?.("Pilot is on http://localhost:5173, every page.");
    expect(logged).toEqual(["[pilot] Pilot is on http://localhost:5173, every page."]);
    httpServer.emit("close");
    await new Promise((r) => setTimeout(r, 10));
    expect(closed).toEqual([1]);
  });

  it("in middleware mode (no server of its own): at once, without an address", () => {
    pilot().configureServer({ config: { root: "/app", logger: { info: () => {} } }, httpServer: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBeUndefined();
  });
});

describe("usepilot/next", () => {
  it("starts Pilot in next dev only, and returns the config, a function's too", async () => {
    const config = { reactStrictMode: true };
    const wrapped = withPilot(config);
    expect(wrapped("phase-production-build", {})).toBe(config);
    expect(wrapped("phase-production-server", {})).toBe(config);
    expect(calls).toHaveLength(0);
    expect(wrapped(DEV_PHASE, {})).toBe(config);
    expect(calls).toHaveLength(1);
    const fn = withPilot(async (phase: string) => ({ phase }));
    expect(await fn(DEV_PHASE, {})).toEqual({ phase: DEV_PHASE });
    expect(DEV_PHASE).toBe("phase-development-server");
  });
});
