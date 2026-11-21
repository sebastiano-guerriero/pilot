# Pilot

**Design in your running app. Your agents write the code.**

Pilot turns the page you're building into a design surface for your agents. You edit, ask for changes or run tasks, they write the code while you keep going, and Pilot checks the real page to show you what landed, not what the agent says it did.

- **Edit.** Select an element, type a property the way you'd type a Tailwind class (`pt`, `w`, `gap-x`), and set it with a visual control.
- **Ask for a change.** Click an element with the comment tool and say what you want, in your own words, with a screenshot or a file if it helps. The agent makes the change and tells you in a line what it did.
- **Run a task.** Type `/` in the comment box and pick one: **Make responsive** makes the element work at every screen width, and **Break and fix** tries it with odd content (very long text, missing or odd-shaped images) and fixes what breaks. Your agent's own skills are there too: pick one and the agent uses it for your comment.

> **Early preview (0.x).** It works, and things will change between versions.

## Install

Pilot runs your coding agent for each change you send: **Claude Code**, **Codex** or **Cursor**. It needs the agent's command-line tool, installed and signed in (once per machine; skip it if you already use it in a terminal):

| Agent | Install | Sign in |
| --- | --- | --- |
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude auth login` |
| Codex | `npm install -g @openai/codex` | `codex login` |
| Cursor | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent login` |

It uses your agent's plan, as when you use it yourself.

1. **Add Pilot to your project.** Paste this into your agent, in the project:

   ```
   Set up Pilot in this project: run `npx usepilot@latest init` and follow what it prints.
   ```

   It installs Pilot, loads it in your app in development only, and checks your agent's command-line tool.

2. **Run Pilot**, in the project's folder, in a terminal beside your dev server:

   ```bash
   npx usepilot
   ```

   Open your app: Pilot opens on every page. Design and press Send, or comment on an element: Pilot runs your agent for each job, and the terminal shows what it does. No chat needs to stay open. The first time, if several agents are signed in, it asks which to use; `npx usepilot --agent codex` changes it.

**What the agent may do:** what you allow it in its own chat, and edit your project's files. Pilot never skips your agent's permissions: what it would ask you about there is refused, since no one is there to answer, and its reply says so.

Pilot needs `npx usepilot` running: without it, the toolbar says so. **Option+P** (Alt+P on Windows and Linux) opens or hides Pilot in your app.

### Updating

Run this in your project's folder:

```bash
npx usepilot@latest update
```

Then restart your app's dev server and `npx usepilot`. Updating from 0.13 or earlier also removes Pilot's old setup in your agents (its MCP server and the `/pilot` skill): Pilot no longer runs inside a chat.

### If something doesn't work

- **The toolbar doesn't appear.** Pilot only loads in development, in the browser. Ask your agent to check where `usepilot/auto` is imported. The shortcut is ignored while you're typing in a text field.
- **The toolbar says "Pilot isn't running for this site".** Run `npx usepilot` in your project's folder, and keep it running.
- **The toolbar says your agent isn't signed in**, or couldn't do a job. Sign in with the command above; the terminal running `npx usepilot` shows what the agent said.

## Using Pilot

1. **Open your app** with `npx usepilot` running. Closed Pilot, or moved to another page? **Option+P** (Alt+P) opens it again.
2. **Select** with the cursor button in the toolbar, then click any element. Its property dialog opens next to it. Shift+click selects several, to edit them together.
3. **Search and edit.** Type a property (`p`, `pt`, `w`, `gap`, `display`, `aspect`…), press Tab to go into its editor, then type or drag a value. Cmd/Ctrl+Z undoes.
   - Type `from-768 ` first to make the change only for some screen widths.
   - Type `hover:` to change the hover state.
   - Type `/` to see every modifier.
4. **Send** your changes to the agent with the toolbar's Send button. Keep designing while it works. Each change stays previewed until it's really in your code.
5. **Ask for a change** with the speech-bubble tool: click an element (Shift+click for several) and tell the agent what to change. Type `/` there for tasks like Make responsive and Break and fix.
6. **Edit text** in place: with the cursor tool on, double-click it.

Your changes survive reloads in the same browser tab. Close Pilot with the toolbar's last button.

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
