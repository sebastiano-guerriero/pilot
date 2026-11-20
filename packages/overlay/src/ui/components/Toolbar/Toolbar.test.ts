// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyLabel } from "../../keys.ts";
import { quitDetail } from "../../App.tsx";
import { Toolbar } from "./Toolbar.tsx";

let container: HTMLElement;
const props = {
  tool: null as "select" | "comment" | null,
  onTool: () => {},
  mode: "send" as "send" | "copy",
  canSend: false,
  onSend: () => true,
  pending: 0,
  onNextJob: () => {},
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
  it("comment, a divider, select, Send, a divider, quit; Send is disabled with nothing to send", () => {
    draw();
    expect([...container.querySelectorAll(".toolbar .button, .toolbar .divider")].map((e) => e.className)).toEqual([
      "button",
      "divider",
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

  it("Send shows how many changes it would send in a pill, not as an accent button", () => {
    draw({ canSend: true, sendCount: 3 } as Partial<typeof props>);
    expect(send().querySelector(".pill")?.textContent).toBe("3");
    expect(send().getAttribute("aria-label")).toBe("Send to agent (3 changes)");
    draw({ canSend: false, sendCount: 0 } as Partial<typeof props>);
    expect(send().querySelector(".pill")).toBeNull();
  });

  it("comments to review: a pill on the Comment button, with how many", () => {
    draw({ tool: "comment" });
    const comment = container.querySelector('[aria-keyshortcuts="Alt+C"]') as HTMLButtonElement;
    expect(comment.querySelector(".pill")).toBeNull();
    expect(tip(comment)?.firstChild?.textContent).toBe("Comment");
    draw({ tool: "comment", attention: 2 } as Partial<typeof props>);
    expect(comment.querySelector(".pill")?.textContent).toBe("2");
    expect(tip(comment)?.firstChild?.textContent).toBe("2 comments to review");
  });

  it("the tools' tooltips show their shortcuts; with an alert, Comment's doesn't", () => {
    draw();
    const comment = container.querySelector('[aria-keyshortcuts="Alt+C"]');
    const select = container.querySelector('[aria-keyshortcuts="Alt+V"]');
    expect(tip(comment)?.querySelector(".shortcut")?.textContent).toBe(keyLabel("alt+c"));
    expect(tip(select)?.querySelector(".shortcut")?.textContent).toBe(keyLabel("alt+v"));
    expect(tip(send())?.querySelector(".shortcut")).toBeNull();
    draw({ alerts: { comment: { title: "No agent", detail: "Run /pilot" } } } as Partial<typeof props>);
    expect(tip(comment)?.querySelector(".shortcut")).toBeNull();
  });

  it("jobs in progress: the jobs button, with their number, after Send; it leaves once they're done", () => {
    vi.useFakeTimers();
    draw({ pending: 2 });
    expect(jobs()?.textContent).toBe("2");
    expect(jobs()?.getAttribute("aria-label")).toBe("2 jobs in progress: show the next");
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

describe("Toolbar's Quit", () => {
  it("names what it stops: the agents on the site", () => {
    draw({ quitDetail: quitDetail([{ label: "Claude Code · app" }, { label: "Cursor · app" }, { label: "Claude Code · app" }]) } as Partial<typeof props>);
    const quit = container.querySelector('[aria-label^="Quit Pilot"]') as HTMLButtonElement;
    expect(tip(quit)?.textContent).toBe("Quit PilotStops Claude Code and Cursor listening");
    expect(quitDetail([])).toBeUndefined();
  });
});
