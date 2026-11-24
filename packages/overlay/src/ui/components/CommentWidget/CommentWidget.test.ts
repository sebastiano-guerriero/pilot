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

function draw(onSend = vi.fn(() => "sent" as const), mentions?: () => MentionOption[], component?: string) {
  act(() =>
    render(
      h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose: () => {}, agentOn: true, mentions, component }),
      container,
    ),
  );
  return onSend;
}

describe("CommentWidget's send", () => {
  it("while the thread's job can be taken back, a stop button beside send stops it; without one, none", () => {
    const onStop = vi.fn();
    act(() => render(h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend: () => "sent" as const, onClose: () => {}, agentOn: true, onStop }), container));
    const stop = container.querySelector(".send-group .stop") as HTMLButtonElement;
    expect(stop.getAttribute("aria-label")).toBe("Stop the job");
    act(() => stop.click());
    expect(onStop).toHaveBeenCalledTimes(1);
    act(() => render(h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend: () => "sent" as const, onClose: () => {}, agentOn: true }), container));
    expect(container.querySelector(".stop")).toBeNull();
  });

  it("sent, its draft goes too, though the box closes before its text change would reach App", async () => {
    const onTextChange = vi.fn();
    const onClose = vi.fn();
    act(() =>
      render(h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend: () => "sent" as const, onClose, onTextChange, agentOn: true }), container),
    );
    await type("Bigger");
    await act(async () => {
      field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalled();
    expect(onTextChange).toHaveBeenLastCalledWith("");
  });

  it("sent, the box closes; not sent (an upload failed), it stays with the draft and says why", async () => {
    const onClose = vi.fn();
    let outcome: "sent" | { title: string; detail: string } = { title: "The file couldn't be attached", detail: "Try again" };
    const onSend = vi.fn(async () => outcome);
    act(() => render(h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose, agentOn: true }), container));
    await type("Make it calmer");
    await press("Enter");
    await act(async () => {});
    expect(onClose).not.toHaveBeenCalled();
    expect(field().value).toBe("Make it calmer");
    outcome = "sent";
    await press("Enter");
    await act(async () => {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CommentWidget's / menu", () => {
  it("on a component, / lists Props among the skills; Enter picks it as a chip, and Send sends it with the words", async () => {
    const onSend = draw(undefined, undefined, "Button");
    await type("/prop");
    expect([...container.querySelectorAll(".action-option .action-name")].map((e) => e.textContent)).toEqual(["Props"]);
    await press("Enter");
    expect(container.querySelector(".composer .action-chip")?.textContent).toBe("Props");
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("Add details (optional)");
    await type("Only the tone");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Only the tone", [], "props", [], false, []);
  });

  it("Pilot's own two say Pilot in the corner; Break and fix and the previews aren't there any more", async () => {
    draw(undefined, undefined, "Button");
    await type("/");
    expect([...container.querySelectorAll(".action-option")].map((o) => [o.querySelector(".action-name")?.textContent, o.querySelector(".action-author")?.textContent])).toEqual([
      ["Props", "Pilot"],
      ["Make responsive", "Pilot"],
    ]);
    await type("/break");
    expect(container.querySelector("#pilot-actions")).toBeNull();
    expect(field().placeholder).toBe("Ask the agent, or / for skills");
  });

  it("an action can go alone; Backspace at the start removes it; Esc closes only the menu, the text stays", async () => {
    const onSend = draw(undefined, undefined, "Button");
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
    expect(onSend).toHaveBeenCalledWith("", [], "props", [], false, []);
  });
});

describe("CommentWidget's skills", () => {
  it("/ lists the agent's skills, in the same rows as Props (no heading); a pick is a chip, sent with the comment (its edits too), and shown as /name", async () => {
    const onSend = vi.fn(() => "sent" as const);
    const skills = vi.fn(async () => [
      { name: "better-ui", description: "Polishes surfaces and icons", author: "Acme" },
      { name: "variant", description: "Builds variants" },
    ]);
    await act(async () => {
      render(
        h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose: () => {}, agentOn: true, skills, edits: { styles: 2, texts: 0 } }),
        container,
      );
    });
    // Asked for when the box opens, so they're there for the first `/`.
    expect(skills).toHaveBeenCalled();
    await act(async () => {
      field().value = "/ui";
      field().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect([...container.querySelectorAll(".action-option[data-kind=skill] .action-name")].map((e) => e.textContent)).toEqual(["better-ui"]);
    expect(container.querySelector(".mention-group")).toBeNull();
    // Its author in the corner, when its SKILL.md says one.
    expect(container.querySelector(".action-option[data-kind=skill] .action-author")?.textContent).toBe("Acme");
    expect(container.querySelector(".action-option[data-kind=skill]")?.classList.contains("mention-option")).toBe(false);
    await press("Enter");
    expect(container.querySelector(".composer .action-chip[data-kind=skill]")?.textContent).toBe("better-ui");
    expect(field().value).toBe("");
    // Not an action: the edits chip stays, and goes with it.
    expect(container.querySelector(".composer .action-chip[data-kind=edits]")).not.toBeNull();
    await type("Softer shadow");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Softer shadow", [], undefined, [], true, [], "better-ui");
  });

  it("a /word matching no action but a skill opens the list; Backspace at the start removes the chip", async () => {
    const onSend = vi.fn(() => "sent" as const);
    const skills = async () => [{ name: "stress-test" }];
    await act(async () => {
      render(h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose: () => {}, agentOn: true, skills }), container);
    });
    await type("/stress");
    expect([...container.querySelectorAll(".action-option .action-name")].map((e) => e.textContent)).toEqual(["stress-test"]);
    await press("Tab");
    await press("Backspace");
    expect(container.querySelector(".composer .action-chip")).toBeNull();
    await type("/stress");
    await press("Enter");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("", [], undefined, [], false, [], "stress-test");
  });

  it("a sent message with a skill reads as typed, /name before the words", () => {
    act(() =>
      render(
        h(CommentWidget, {
          element,
          anchor: new DOMRect(0, 0, 100, 40),
          thread: { id: "t", target: { selector: "button", path: "button", tag: "button", classes: [] }, messages: [{ from: "designer", text: "Softer", at: "1", skill: "better-ui" }] },
          onSend: () => "sent" as const,
          onClose: () => {},
          agentOn: true,
        }),
        container,
      ),
    );
    expect(container.querySelector(".messages .message p")?.textContent).toBe("/better-ui Softer");
  });
});

describe("CommentWidget's / anywhere", () => {
  it("/ at the start of any word opens the list; the pick leaves the text, the words stay as its note", async () => {
    const onSend = draw(undefined, undefined, "Button");
    await type("Only the tone /prop");
    expect([...container.querySelectorAll(".action-option .action-name")].map((e) => e.textContent)).toEqual(["Props"]);
    expect(container.querySelector(".buttons")?.hasAttribute("hidden")).toBe(true);
    await press("Enter");
    expect(container.querySelector(".composer .action-chip")?.textContent).toBe("Props");
    expect(field().value).toBe("Only the tone ");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Only the tone", [], "props", [], false, []);
  });

  it("not inside a word (and/or); a /word matching nothing is text, and Enter sends it", async () => {
    const onSend = draw();
    await type("this and/or that");
    expect(container.querySelector("#pilot-actions")).toBeNull();
    await type("link it to /about");
    expect(container.querySelector("#pilot-actions")).toBeNull();
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("link it to /about", [], undefined, [], false, []);
  });
});

describe("CommentWidget's edits chip", () => {
  const drawWith = (edits: { styles: number; texts: number }, onSend = vi.fn(() => "sent" as const)) => {
    act(() =>
      render(h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend, onClose: () => {}, agentOn: true, edits }), container),
    );
    return onSend;
  };
  const chip = () => container.querySelector('.composer .action-chip[data-kind="edits"]');

  it("the selection's unsent edits show as a chip and go with the comment", async () => {
    const onSend = drawWith({ styles: 3, texts: 0 });
    expect(chip()?.textContent).toBe("3 style changes");
    await type("Like this, on mobile too");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("Like this, on mobile too", [], undefined, [], true, []);
  });

  it("taken off, they stay for Send; with an action, the chip isn't there (a task goes apart)", async () => {
    const onSend = drawWith({ styles: 1, texts: 1 });
    expect(chip()?.textContent).toBe("1 style change and 1 text change");
    act(() => (chip()?.querySelector("button") as HTMLButtonElement).click());
    expect(chip()).toBeNull();
    await type("Calmer");
    await press("Enter");
    expect(onSend).toHaveBeenLastCalledWith("Calmer", [], undefined, [], false, []);
    render(null, container);
    const withAction = vi.fn(() => "sent" as const);
    act(() =>
      render(
        h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: null, onSend: withAction, onClose: () => {}, agentOn: true, edits: { styles: 2, texts: 0 }, component: "Button" }),
        container,
      ),
    );
    await type("/prop");
    await press("Enter");
    expect(chip()).toBeNull();
    await press("Enter");
    expect(withAction).toHaveBeenCalledWith("", [], "props", [], false, []);
  });

  it("none: no chip", () => {
    drawWith({ styles: 0, texts: 0 });
    expect(chip()).toBeNull();
  });
});

describe("CommentWidget's props", () => {
  const propList = [{ name: "tone", type: "options" as const, options: ["light", "dark", "outline"] }];
  const thread = {
    id: "t",
    target: { selector: "article", path: "article", tag: "article", classes: [] },
    messages: [{ from: "agent" as const, text: "ProductCard has 1 prop.", at: "1", propList }],
  };
  const drawThread = (onSend = vi.fn(() => "sent" as const)) => {
    act(() =>
      render(
        h(CommentWidget, {
          element,
          anchor: new DOMRect(0, 0, 100, 40),
          thread: thread as never,
          onSend,
          onClose: () => {},
          agentOn: true,
          component: "ProductCard",
          currentProps: () => ({ tone: "light" }),
        }),
        container,
      ),
    );
    return onSend;
  };
  const chooseTone = (value: string) => {
    act(() => (container.querySelector(".props-list .trigger") as HTMLElement).click());
    act(() => ([...container.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes(value)) as HTMLElement).click());
  };

  it("a pick sends nothing: it writes a name: value line in the comment, which goes, exact, when it's sent", async () => {
    const onSend = drawThread();
    await type("A calmer card");
    chooseTone("dark");
    expect(onSend).not.toHaveBeenCalled();
    expect(field().value).toBe("A calmer card\ntone: dark");
    expect(container.querySelector(".props-list .trigger")?.textContent).toContain("dark");
    // Picked again: the same line, a new value.
    chooseTone("outline");
    expect(field().value).toBe("A calmer card\ntone: outline");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("A calmer card\ntone: outline", [], undefined, [], false, [{ name: "tone", from: "light", to: "outline" }]);
  });

  it("answered (the designer wrote after it), the list's rows go; its words stay", () => {
    const answered = { ...thread, messages: [...thread.messages, { from: "designer" as const, text: "tone: dark", at: "2" }] };
    act(() =>
      render(
        h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: answered as never, onSend: () => "sent" as const, onClose: () => {}, agentOn: true }),
        container,
      ),
    );
    expect(container.querySelector(".props-list")).toBeNull();
    expect(container.querySelector(".agent-reply")?.textContent).toContain("ProductCard has 1 prop.");
  });

  it("the page's value again takes the line out; a line typed by hand counts as a pick", async () => {
    const onSend = drawThread();
    chooseTone("dark");
    chooseTone("light");
    expect(field().value).toBe("");
    await type("Tone: Dark,");
    await type("tone: Dark,");
    expect(container.querySelector(".props-list .trigger")?.textContent).toContain("dark");
    await press("Enter");
    expect(onSend).toHaveBeenCalledWith("tone: Dark,", [], undefined, [], false, [{ name: "tone", from: "light", to: "dark" }]);
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
    expect(onSend).toHaveBeenCalledWith("Make it --color-accent like @ProductCard", [], undefined, [options[0], options[2]], false, []);
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
    expect(onSend).toHaveBeenCalledWith("rounder", [], undefined, [], false, []);
  });

  it("an email's @ isn't a mention; with nothing matching, Enter sends", async () => {
    const onSend = draw(undefined, () => options);
    await type("ask a@b.c");
    expect(container.querySelector("#pilot-mentions")).toBeNull();
    await type("see @zzz");
    expect(container.querySelector(".action-none")?.textContent).toBe("Nothing matches");
    await press("Enter");
    // Typed, found nowhere: sent for the agent to look for.
    expect(onSend).toHaveBeenCalledWith("see @zzz", [], undefined, [{ group: "Unlisted", label: "zzz", insert: "@zzz" }], false, []);
  });

  it("in the thread, an action reads as typed, /command in green, and the edits that went with it as words; no chips", () => {
    const thread = {
      id: "t",
      target: { selector: "button", path: "button", tag: "button" },
      messages: [
        { from: "designer" as const, text: "Two columns on tablet", at: "1", action: "responsive" as const },
        { from: "designer" as const, text: "", at: "2", action: "props" as const },
        { from: "designer" as const, text: "Like this", at: "3", edits: { styles: 2, texts: 0 } },
      ],
    };
    act(() =>
      render(
        h(CommentWidget, { element, anchor: new DOMRect(0, 0, 100, 40), thread: thread as never, onSend: () => "sent" as const, onClose: () => {}, agentOn: true }),
        container,
      ),
    );
    expect([...container.querySelectorAll(".message p")].map((p) => p.innerHTML)).toEqual([
      '<span class="mention">/responsive</span> Two columns on tablet',
      '<span class="mention">/props</span>',
      '<span class="mention">2 style changes</span> Like this',
    ]);
    expect(container.querySelector(".messages .action-chip")).toBeNull();
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
    expect(field().placeholder).toBe("Ask the agent, / for skills, @ to mention");
    await type("@Pr");
    expect(shown()).toEqual(["ProductCard"]);
    await act(async () => send([{ name: "PricingTable", file: "src/pricing/table.tsx", line: 4 }]));
    expect(shown()).toEqual(["ProductCard", "PricingTable"]);
    expect(projectComponents).toHaveBeenCalledTimes(1);
  });
});

describe("CommentWidget's Edit manually", () => {
  const target = { selector: "button", path: "button", tag: "button", classes: [] };
  const drawMessages = (messages: object[], onAdjust = vi.fn()) => {
    act(() =>
      render(
        h(CommentWidget, {
          element,
          anchor: new DOMRect(0, 0, 100, 40),
          thread: { id: "t", target, messages } as never,
          onSend: () => "sent" as const,
          onClose: () => {},
          agentOn: true,
          onAdjust,
        }),
        container,
      ),
    );
    return onAdjust;
  };
  const adjust = () => [...container.querySelectorAll(".choice")].find((b) => b.textContent === "Edit manually") as HTMLButtonElement | undefined;
  const asked = { from: "designer", text: "Make the text bigger", at: "1" };

  it("on the latest reply to a job that changed the elements' look: a secondary button that adjusts it by hand", () => {
    const onAdjust = drawMessages([asked, { from: "agent", text: "Done.", at: "2", restyled: true }]);
    expect(adjust()?.hasAttribute("data-secondary")).toBe(true);
    act(() => adjust()?.click());
    expect(onAdjust).toHaveBeenCalledTimes(1);
  });

  it("not on a reply whose job changed nothing the dialog edits (an icon swapped, an answer)", () => {
    drawMessages([asked, { from: "agent", text: "Swapped the icon.", at: "2" }]);
    expect(adjust()).toBeUndefined();
  });

  it("only the latest, and not on a question, a props list or a stopped job", () => {
    drawMessages([asked, { from: "agent", text: "Done.", at: "2", restyled: true }, { from: "designer", text: "And the title?", at: "3" }]);
    expect(adjust()).toBeUndefined();
    drawMessages([asked, { from: "agent", text: "Every card?", at: "2", choices: ["All of them", "Only this"], restyled: true }]);
    expect(adjust()).toBeUndefined();
    drawMessages([asked, { from: "agent", text: "1 prop.", at: "2", propList: [{ name: "tone", type: "options", options: ["a"] }], restyled: true }]);
    expect(adjust()).toBeUndefined();
    drawMessages([asked, { from: "agent", text: "Stopped.", at: "2", stopped: true, restyled: true }]);
    expect(adjust()).toBeUndefined();
  });
});

