# Pilot

**Design in your running app. Your agents write the code.**

Pilot turns the page you're building into a design surface for your agents. You edit, ask for changes or run tasks, they write the code while you keep going, and Pilot checks the real page to show you what landed, not what the agent says it did.

- **Edit.** Select an element, type a property the way you'd type a Tailwind class (`pt`, `w`, `gap-x`), and set it with a visual control.
- **Ask for a change.** Click an element with the comment tool and say what you want, in your own words, with a screenshot or a file if it helps. The agent makes the change and tells you in a line what it did.
- **Run a task.** Type `/` in the comment box and pick one: **Make responsive** makes the element work at every screen width, and **Break and fix** tries it with odd content (very long text, missing or odd-shaped images) and fixes what breaks.

> **Early preview (0.x).** It works, and things will change between versions.

## Install

Works with any agent that supports MCP: Claude Code, Codex, Cursor, VS Code and others.

1. **Paste this into your agent**, in your project. It installs Pilot and loads it in your app, in development only.

   ```
   Set up Pilot in this project: run `npx usepilot@latest init --agent <you>`, where <you> is the agent you are (claude-code, cursor, codex, vscode or other), and follow what it prints.
   ```

2. **Open a new chat.** Pilot doesn't work in the chat that installed it. In the new one, ask the agent to **launch Pilot**, or run `/pilot` (`$pilot` in Codex).

   To work on several things at once, launch Pilot in more chats on the same project: each Send or comment goes to a chat that's free, and two chats never work on the same element at once.

Your agent is connected once for this machine, with nothing added to the repo. In another project, the same prompt only adds Pilot to that app. Teammates paste it in their own agent. To keep the setup in the repo instead, for a team to commit, the agent adds `--project`.

**No agent?** Run `npx usepilot@latest init --agent other` yourself and do the step it prints for loading Pilot. Then press **Option+P** (Alt+P on Windows and Linux) in your app, and **Copy prompt** hands your changes to any chat.

### If something doesn't work

- **The toolbar doesn't appear.** Pilot only loads in development, in the browser. Ask your agent to check where `usepilot/auto` is imported. The shortcut is ignored while you're typing in a text field.
- **The agent doesn't know Pilot.** Start a new chat: agents load their MCP servers when a chat starts. Some ask once to approve the project's server: say yes. In Cursor, if `pilot` shows switched off in Cursor Settings (MCP section), switch it on: Cursor keeps servers set up in a repo off until you do.
- **Pilot doesn't open, and another project's chat runs an older Pilot.** Pilots before 0.6.1 all used one port, so two projects on different versions blocked each other. Update Pilot in the older project (paste the install prompt there), or close that chat. From 0.6.1, each version has its own port, and projects on different versions run side by side.

## Using Pilot

1. **Launch:** ask your agent to launch Pilot, or run `/pilot`. Pilot opens in your app, connected to the agent: everything you send goes to it, and it writes the code while you keep designing. Closed Pilot, or moved to another page? **Option+P** (Alt+P) opens it again, still connected while the agent's chat runs Pilot.
2. **Select** with the cursor button in the toolbar, then click any element. Its property dialog opens next to it. Shift+click selects several, to edit them together.
3. **Search and edit.** Type a property (`p`, `pt`, `w`, `gap`, `display`, `aspect`…), press Tab to go into its editor, then type or drag a value. Cmd/Ctrl+Z undoes.
   - Type `from-768 ` first to make the change only for some screen widths.
   - Type `hover:` to change the hover state.
   - Type `/` to see every modifier.
4. **Send** your changes to the agent with the toolbar's Send button. Keep designing while it works. Each change stays previewed until it's really in your code.
5. **Ask for a change** with the speech-bubble tool: click an element (Shift+click for several) and tell the agent what to change. Type `/` there for tasks like Make responsive and Break and fix.
6. **Edit text** in place: with the cursor tool on, double-click it.

Your changes survive reloads in the same browser tab. Quit with the toolbar's last button.

### Options

```ts
import { mountPilot } from "usepilot";

mountPilot({
  shortcut: "alt+p",              // or "ctrl+shift+e", or false
  launch: false,                  // true: open on load
  nameAttributes: ["data-block"], // attributes your project names elements with
});
```

## Working on Pilot

```bash
pnpm install
```

```bash
pnpm dev
```

The playground opens at http://localhost:5180. Everything else is in [docs/](docs/README.md): how each part works and why, development and releasing, and the [roadmap](docs/roadmap.md).

## License

[FSL-1.1-MIT](LICENSE.md) (Functional Source License, MIT Future License). The code is public and free to use, modify and share, including at work, for anything except a competing commercial product or service built from it. Each version becomes MIT two years after it's released.
