// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentWidget } from "./CommentWidget.tsx";
import type { MentionOption } from "./mentions.ts";

let container: HTMLElement;
let element: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  element = document.createElement("button");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const field = () => container.querySelector(".field") as HTMLTextAreaElement;
const type = (value: string) =>
  act(() => {
    field().value = value;
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
const press = (key: string) =>
  act(() => {
    field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });

function draw(onSend = vi.fn(() => "sent" as const), mentions?: () => MentionOption[]) {
  act(() =>
    render(
      h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose: () => {}, agentOn: true, mentions }),
      container,
    ),
  );
  return onSend;
}

describe("CommentWidget's / actions", () => {
  it("/ lists the actions; Enter picks one as a chip, and Send sends it with the words", async () => {
    const onSend = draw();
    await type("/resp");
    expect([...container.querySelectorAll(".action-option .action-name")].map((e) => e.textContent)).toEqual(["Make responsive"]);
    await press("Enter");
    expect(container.querySelector(".composer .action-chip")?.textContent).toBe("Make responsive");
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("Add details (optional)");
    await type("Two columns on tablet");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Two columns on tablet", [], "responsive", [], false);
  });

  it("an action can go alone; Backspace at the start removes it; Esc closes only the menu, the text stays", async () => {
    const onSend = draw();
    await type("/");
    await press("Escape");
    expect(field().value).toBe("/");
    expect(container.querySelector(".action-option")).toBeNull();
    expect(container.querySelector(".comment-widget")).not.toBeNull();
    await type("");
    await type("/");
    await press("Tab");
    await press("Backspace");
    expect(container.querySelector(".composer .action-chip")).toBeNull();
    await type("/");
    await press("Enter");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("", [], "responsive", [], false);
  });
});

describe("CommentWidget's / anywhere", () => {
  it("/ at the start of any word opens the actions; the pick leaves the text, the words stay as its note", async () => {
    const onSend = draw();
    await type("Two columns on tablet /resp");
    expect([...container.querySelectorAll(".action-option .action-name")].map((e) => e.textContent)).toEqual(["Make responsive"]);
    expect(container.querySelector(".buttons")?.hasAttribute("hidden")).toBe(true);
    await press("Enter");
    expect(container.querySelector(".composer .action-chip")?.textContent).toBe("Make responsive");
    expect(field().value).toBe("Two columns on tablet ");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Two columns on tablet", [], "responsive", [], false);
  });

  it("not inside a word (and/or); a /word matching nothing is text, and Enter sends it", async () => {
    const onSend = draw();
    await type("this and/or that");
    expect(container.querySelector("#pilot-actions")).toBeNull();
    await type("link it to /about");
    expect(container.querySelector("#pilot-actions")).toBeNull();
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("link it to /about", [], undefined, [], false);
  });
});

describe("CommentWidget's edits chip", () => {
  const drawWith = (edits: number, onSend = vi.fn(() => "sent" as const)) => {
    act(() =>
      render(h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose: () => {}, agentOn: true, edits }), container),
    );
    return onSend;
  };
  const chip = () => container.querySelector('.composer .action-chip[data-kind="edits"]');

  it("the selection's unsent edits show as a chip and go with the comment", async () => {
    const onSend = drawWith(3);
    expect(chip()?.textContent).toBe("3 changes");
    await type("Like this, on mobile too");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Like this, on mobile too", [], undefined, [], true);
  });

  it("taken off, they stay for Send; with an action, the chip isn't there (a task goes apart)", async () => {
    const onSend = drawWith(1);
    expect(chip()?.textContent).toBe("1 change");
    act(() => (chip()?.querySelector("button") as HTMLButtonElement).click());
    expect(chip()).toBeNull();
    await type("Calmer");
    await press("Enter");
    expect(onSend).toHaveBeenLastCalledWith("Calmer", [], undefined, [], false);
    render(null, container);
    const withAction = drawWith(2);
    await type("/resp");
    await press("Enter");
    expect(chip()).toBeNull();
    await press("Enter");
    expect(withAction).toHaveBeenCalledWith("", [], "responsive", [], false);
  });

  it("none: no chip", () => {
    drawWith(0);
    expect(chip()).toBeNull();
  });
});

describe("CommentWidget's @ mentions", () => {
  const options: MentionOption[] = [
    { group: "Tokens", label: "--color-accent", insert: "--color-accent", detail: "#1cf69e", swatch: "#1cf69e" },
    { group: "Tokens", label: "--radius", insert: "--radius", detail: "8px" },
    { group: "Components", label: "ProductCard", insert: "@ProductCard" },
  ];
  const shown = () => [...container.querySelectorAll(".mention-option .action-name")].map((e) => e.textContent);

  it("@ lists what the page has, by group, read when it opens; Enter puts the pick in the text, and Send sends it as a mention", async () => {
    const mentions = vi.fn(() => options);
    const onSend = draw(undefined, mentions);
    await type("Make it @");
    expect(mentions).toHaveBeenCalledTimes(1);
    expect([...container.querySelectorAll(".mention-group")].map((e) => e.textContent)).toEqual(["Tokens", "Components"]);
    await type("Make it @col");
    expect(shown()).toEqual(["--color-accent"]);
    await press("Enter");
    expect(field().value).toBe("Make it --color-accent ");
    expect(container.querySelector(".mention-option")).toBeNull();
    await type("Make it --color-accent like @Prod");
    await press("ArrowDown"); // one match: stays on it
    await press("Tab");
    expect(field().value).toBe("Make it --color-accent like @ProductCard ");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Make it --color-accent like @ProductCard", [], undefined, [options[0], options[2]], false);
  });

  it("Esc closes only the list, the text stays; a pick taken out of the text isn't sent", async () => {
    const onSend = draw(undefined, () => options);
    await type("@rad");
    await press("Enter");
    expect(field().value).toBe("--radius ");
    await type("--radius and @");
    await press("Escape");
    expect(container.querySelector(".mention-option")).toBeNull();
    expect(container.querySelector(".comment-widget")).not.toBeNull();
    expect(field().value).toBe("--radius and @");
    await type("rounder");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("rounder", [], undefined, [], false);
  });

  it("an email's @ isn't a mention; with nothing matching, Enter sends", async () => {
    const onSend = draw(undefined, () => options);
    await type("ask a@b.c");
    expect(container.querySelector("#pilot-mentions")).toBeNull();
    await type("see @zzz");
    expect(container.querySelector(".action-none")?.textContent).toBe("Nothing matches");
    await press("Enter");
    // Typed, found nowhere: sent for the agent to look for.
    expect(onSend).toHaveBeenCalledWith("see @zzz", [], undefined, [{ group: "Unlisted", label: "zzz", insert: "@zzz" }], false);
  });

  it("in the thread, a sent message's mentions show apart from its words", () => {
    const thread = {
      id: "t",
      target: { selector: "button", path: "button", tag: "button" },
      messages: [{ from: "designer" as const, text: "Use --color-accent here", at: "1", references: [{ kind: "token" as const, name: "--color-accent", value: "#1cf69e" }] }],
    };
    act(() =>
      render(
        h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: thread as never, onSend: () => "sent" as const, onClose: () => {}, agentOn: true }),
        container,
      ),
    );
    expect(container.querySelector(".message p")?.innerHTML).toBe('Use <span class="mention">--color-accent</span> here');
  });

  it("the project's components join the list when the server sends them, after the page's", async () => {
    let send: (list: Array<{ name: string; file: string; line?: number }>) => void = () => {};
    const projectComponents = vi.fn(() => new Promise<Array<{ name: string; file: string; line?: number }>>((done) => (send = done)));
    act(() =>
      render(
        h(CommentWidget, {
          element,
          anchor: new DOMRect(0, 0, 100, 40),
          thread: null,
          onSend: () => "sent" as const,
          onClose: () => {},
          agentOn: true,
          mentions: () => options,
          projectComponents,
        }),
        container,
      ),
    );
    expect(field().placeholder).toBe("Ask the agent, / for actions, @ to mention");
    await type("@Pr");
    expect(shown()).toEqual(["ProductCard"]);
    await act(async () => send([{ name: "PricingTable", file: "src/pricing/table.tsx", line: 4 }]));
    expect(shown()).toEqual(["ProductCard", "PricingTable"]);
    expect(projectComponents).toHaveBeenCalledTimes(1);
  });
});
