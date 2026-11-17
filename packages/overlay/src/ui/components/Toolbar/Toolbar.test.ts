// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar.tsx";

let container: HTMLElement;
const props = {
  selecting: false,
  onToggleSelect: () => {},
  mode: "send" as "send" | "copy",
  canSend: false,
  onSend: () => true,
  pending: 0,
  jobsOpen: false,
  onToggleJobs: () => {},
  onQuit: () => {},
};
const draw = (patch: Partial<typeof props> = {}) => act(() => render(h(Toolbar, { ...props, ...patch }), container));
const send = () => container.querySelector(".send") as HTMLButtonElement;
const tip = (button: Element | null) => button?.parentElement?.querySelector(".tooltip");
const jobs = () => container.querySelector(".jobs") as HTMLButtonElement | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  vi.useRealTimers();
});

describe("Toolbar", () => {
  it("select, Send, divider, quit; Send is disabled with nothing to send", () => {
    draw();
    expect([...container.querySelectorAll(".toolbar .button, .toolbar .divider")].map((e) => e.className)).toEqual([
      "button",
      "button send",
      "divider",
      "button",
    ]);
    expect(tip(send())?.textContent).toBe("Nothing to send");
    expect(send().disabled).toBe(true);
    expect(send().hasAttribute("data-ready")).toBe(false);
  });

  it("with something to send, Send lights up", () => {
    draw({ canSend: true });
    expect(send().disabled).toBe(false);
    expect(send().hasAttribute("data-ready")).toBe(true);
    expect(tip(send())?.textContent).toBe("Send to agent");
  });

  it("jobs in progress: the jobs button, with their number, after Send; it leaves once they're done", () => {
    vi.useFakeTimers();
    draw({ pending: 2 });
    expect(jobs()?.textContent).toBe("2");
    expect(jobs()?.getAttribute("aria-label")).toBe("2 jobs in progress");
    expect(tip(jobs())?.textContent).toBe("2 jobs running");
    draw({ pending: 0 });
    // Still there for its exit animation, then gone.
    expect(container.querySelector(".jobs-slot")?.hasAttribute("data-leaving")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(jobs()).toBeNull();
  });

  it("without an agent, the same button copies the prompt, its icon turning into a check once copied", async () => {
    draw({ mode: "copy", canSend: true });
    expect(tip(send())?.textContent).toBe("Copy prompt");
    const morph = () => send().querySelector(".copy-morph");
    expect(morph()?.hasAttribute("data-done")).toBe(false);
    await act(async () => {
      send().click();
    });
    expect(morph()?.hasAttribute("data-done")).toBe(true);
    expect(tip(send())?.textContent).toBe("Copied");
  });

  it("after a send, its tooltip shows Sent for a moment, hovered or not", async () => {
    draw({ canSend: true });
    expect(tip(send())?.hasAttribute("data-open")).toBe(false);
    await act(async () => {
      send().click();
    });
    expect(tip(send())?.textContent).toBe("Sent");
    expect(tip(send())?.hasAttribute("data-open")).toBe(true);
  });
});
