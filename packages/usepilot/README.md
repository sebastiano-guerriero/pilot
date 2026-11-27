# Pilot

**Design in your running app. Your agents write the code.**

Pilot turns the page you're building into a design surface for your agents. You edit, ask for changes or run tasks, they write the code while you keep going, and Pilot checks the real page to show you what landed, not what the agent says it did.

- **Edit.** Select an element, type a property the way you'd type a Tailwind class (`pt`, `w`, `gap-x`), and set it with a visual control.
- **Ask for a change.** Click an element with the comment tool and say what you want, in your own words, with a screenshot or a file if it helps. The agent makes the change and tells you in a line what it did.
- **Use your skills.** Type `/` in the comment box to pick one of your agent's skills (yours, or your team's), and the agent uses it for your comment. Pilot adds two of its own: **Make responsive** makes the element work at every screen width, and on a component, **Props** lists the props you can change.

> **Early preview (0.x).** It works, and things will change between versions.

## Install

Pilot works with **Claude Code**, **Codex** or **Cursor**, on your agent's usual plan.

1. **Paste this into your agent's chat**, in your project:

   ```
   Set up Pilot in this project: run `npx usepilot@latest init` and follow what it prints.
   ```

   Your agent adds Pilot to your app and sets it to start with your dev server. Pilot only runs while you develop: it never ships to your live site. Pilot runs your agent's terminal app for each job, not its chat window, so if that isn't installed yet, your agent installs it (it asks you first).

2. **Restart your dev server** and open your app. Pilot appears on every page, and you can start designing right away.

3. **Sign in once**, when Pilot asks. The first time you send something (Send, or a comment), Pilot opens your agent's sign-in page in your browser. What you sent waits, then goes as soon as you've signed in. Already using your agent in a terminal? You're signed in already.

**What your agent can do:** edit your project's files, and anything you've already set it to always allow. Anything it would normally ask your permission for is refused, since no one is there to answer: its reply tells you.

Your dev server's terminal shows what Pilot and your agent are doing. **Option+P** (Alt+P on Windows and Linux) opens or hides Pilot in your app.

**A dev server Pilot can't start with?** Run `npx usepilot` in your project's folder, next to it, and keep it open.

### Updating

Run this in your project's folder:

```bash
npx usepilot@latest update
```

Then restart your app's dev server (and `npx usepilot`, if you run it). Updating from 0.13 or earlier also removes Pilot's old setup in your agents (its MCP server and the `/pilot` skill): Pilot no longer runs inside a chat.

### If something doesn't work

- **The toolbar doesn't appear.** Pilot only loads in development, in the browser. Ask your agent to check where `usepilot/auto` is imported. The shortcut is ignored while you're typing in a text field.
- **The toolbar says "Pilot isn't running for …".** Restart your dev server: Pilot starts with it (its terminal says why, if it doesn't). Without that setup, run `npx usepilot` in your project's folder and keep it running. Its terminal says why it left the page: another project's page, or a page set up before 0.15 (ask your agent to run `npx usepilot@latest update`).
- **The sign-in page doesn't open**, or the sign-in doesn't finish. Sign in in a terminal instead: `claude auth login`, `codex login` or `cursor-agent login`. Pilot notices, and what you sent goes.
- **The toolbar says your agent couldn't do a job.** Your dev server's terminal (or the one running `npx usepilot`) shows what the agent said.

## Using Pilot

Everything Pilot does, task by task, is in the guide, which ships with Pilot: `npx usepilot guide` prints it for the version you have, and it's in your project at `node_modules/usepilot/GUIDE.md`. Ask your agent how to do something in Pilot and it can answer from there. The short version:

1. **Open your app** with its dev server running. Closed Pilot, or moved to another page? **Option+P** (Alt+P) opens it again.
2. **Select** with the cursor button in the toolbar, then click any element. Its property dialog opens next to it. Shift+click selects several, to edit them together.
3. **Search and edit.** Type a property (`p`, `pt`, `w`, `gap`, `display`, `aspect`…), press Tab to go into its editor, then type or drag a value. Cmd/Ctrl+Z undoes.
   - Type `from-768 ` first to make the change only for some screen widths.
   - Type `hover:` to change the hover state.
   - Type `/` to see every modifier.
4. **Send** your changes to the agent with the toolbar's Send button. Keep designing while it works. Each change stays previewed until it's really in your code.
5. **Ask for a change** with the speech-bubble tool: click an element (Shift+click for several) and tell the agent what to change. Type `/` there to use one of your skills.
6. **Edit text** in place: with the cursor tool on, double-click it.

Your changes survive reloads in the same browser tab. Close Pilot with the toolbar's last button.

### Options

```ts
import { mountPilot } from "usepilot";

mountPilot({
  shortcut: "alt+p",              // or "ctrl+shift+e", or false
  launch: false,                  // true: open on load
  nameAttributes: ["data-block"], // attributes your project names elements with
  project: "my-app",              // your package.json's name: npx usepilot runs for its own project's pages
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
