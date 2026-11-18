# Pilot

**Design in your running app. Your agents write the code.**

Pilot turns the page you're building into a design surface for your agents. You edit, comment or ask for a task, they write the code while you keep going, and Pilot checks the real page to show you what landed, not what the agent says it did.

- **Edit.** Select an element, type a property the way you'd type a Tailwind class (`pt`, `w`, `gap-x`), and set it with a visual control.
- **Comment.** Leave a note on an element and get the agent's reply right there.
- **Ask for a task.** Use **Make responsive** on a section and the agent makes it work at every screen width.

> **Early preview (0.x).** It works, and things will change between versions.

## Install

Paste this into your coding agent, in your project. Any agent that supports MCP works: Claude Code, Codex, Cursor, VS Code and others.

```
Set up Pilot in this project: run `npx usepilot@latest init` and follow what it prints.
```

The agent installs Pilot as a dev dependency, connects itself to it, and loads it in your app, in development only. Then open a new chat and ask it to **launch Pilot** (`/pilot` in Claude Code). It opens Pilot in your app.

Commit the files it adds (the MCP config for your agents, and Claude Code's `/pilot`), and everyone on the project gets Pilot.

**No agent?** Run `npx usepilot@latest init` yourself and do the step it prints for loading Pilot. Then press **Option+P** (Alt+P on Windows and Linux) in your app, and **Copy prompt** hands your changes to any chat.

### If something doesn't work

- **The toolbar doesn't appear.** Pilot only loads in development, in the browser. Ask your agent to check where `usepilot/auto` is imported. The shortcut is ignored while you're typing in a text field.
- **The agent doesn't know Pilot.** Start a new chat: agents load their MCP servers when a chat starts. Some ask once to approve the project's server: say yes.
- **"Another Pilot version (bridge …) runs on port 4747".** Another open chat runs a different Pilot version. Update with `npx usepilot@latest init` and restart that chat.

## Using Pilot

1. **Launch:** ask your agent to launch Pilot (`/pilot` in Claude Code), or press **Option+P** on any page of your app.
2. **Select** with the cursor button in the toolbar, then click any element. Its property dialog opens next to it.
3. **Search and edit.** Type a property (`p`, `pt`, `w`, `gap`, `display`, `aspect`…), press Tab to go into its editor, then type or drag a value. Cmd/Ctrl+Z undoes.
   - Type `from-768 ` first to make the change only for some screen widths.
   - Type `hover:` to change the hover state.
   - Type `/` to see every modifier.
4. **Send** your changes to the agent with the toolbar's Send button. Keep designing while it works. Each change stays previewed until it's really in your code.
5. **Comment** with the speech-bubble tool: click an element and write to the agent.
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
