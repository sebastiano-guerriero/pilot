// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://nucleoapp.com/icons"}
import { describe, expect, it, vi } from "vitest";
import { mountPilot } from "./mount.tsx";

describe("mountPilot on a server's page", () => {
  it("does nothing: no toolbar, nothing in the page, launching is a no-op", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pilot = mountPilot({ launch: true });
    pilot.launch();
    expect(pilot.running).toBe(false);
    expect(document.querySelector("pilot-root")).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
