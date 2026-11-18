# Pilot

**Take the controls from your coding agent.**

Pilot lets you point at your running app and tell your coding agent exactly what to change. It runs inside your app in development, so you work on the real page with real data, not on a separate canvas:

- **Edit.** Select an element, type a property the way you'd type a Tailwind class (`pt`, `w`, `gap-x`), and set it with a visual control. You see the change live.
- **Comment.** Leave a note on an element ("make this feel less cramped") and get the agent's reply right there.
- **Ask for a task.** Use **Make responsive** on a section and the agent makes it work at every screen width.

Then press **Send**. Your agent writes the changes into your code using your project's own conventions (Tailwind classes, CSS modules, design tokens). Pilot never edits your files itself. It checks the result on the page: what landed stops being previewed, and what didn't goes back to the agent. You see what the code does, not what the agent says it did.

> **Early preview (0.x).** It works, and things will change between versions.

## Install

Installing takes two steps, about two minutes. First you add Pilot to your app (in development only), then you connect your agent.

### 1. Add Pilot to your app

```bash
npm install -D usepilot
```

(or `pnpm add -D usepilot`, `yarn add -D usepilot`, `bun add -d usepilot`)

Then load it in development only. Pick your setup:

**Vite** (React, Vue, Svelte, Solid, plain JS). Add this to your entry file (`src/main.tsx`, `src/main.ts`…):

```ts
if (import.meta.env.DEV) import("usepilot/auto");
```

**Next.js** (App Router). Add a small client component and render it in your root layout:

```tsx
// app/pilot.tsx
"use client";
import { useEffect } from "react";

export function Pilot() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") import("usepilot/auto");
  }, []);
  return null;
}
```

```tsx
// app/layout.tsx, inside <body>
<Pilot />
```

**Anything else:** import `usepilot/auto` from code that runs only in the browser, and only in development.

**Check that it works:** start your dev server, open your app and press **Option+P** (**Alt+P** on Windows and Linux). Pilot's toolbar appears at the bottom of the page.

### 2. Connect your agent

**Claude Code, for a repo you share.** Run this in your project's root folder:

```bash
npx usepilot setup --project
```

It writes two files: the `/pilot` skill (`.claude/skills/pilot/SKILL.md`) and Pilot's MCP server (`.mcp.json`). Commit both, and everyone working in the repo gets `/pilot`.

**Claude Code, just for you, in every project.** Nothing goes in the repo:

```bash
npx usepilot setup
```

```bash
claude mcp add --scope user pilot -- npx -y usepilot mcp
```

**Other agents (Cursor, Codex…).** Add `npx -y usepilot mcp` as an MCP server in their settings. They don't have a `/pilot` command yet, so ask the agent to launch Pilot.

**No agent?** Pilot still works: **Send** becomes **Copy prompt**, and you paste your changes into any chat.

### 3. Try it

Open a new Claude Code chat in your project's folder and type:

```
/pilot
```

The agent finds your dev server and opens Pilot in your app. Select an element, change something, and press **Send**. The agent applies the change while you keep going.

### If something doesn't work

- **The toolbar doesn't appear.** Make sure the import runs in the browser (in Next.js, in a `"use client"` component) and that your app runs in development mode. The shortcut is ignored while you're typing in a text field.
- **`/pilot` isn't there.** Start a new chat after running `setup`. With `--project`, Claude Code asks once whether to trust the project's MCP server: say yes.
- **"Another Pilot version (bridge …) runs on port 4747".** Another open chat runs a different Pilot version. Update with `npm install -D usepilot@latest` and restart that chat.

## Using Pilot

1. **Launch** with `/pilot` in your agent, or **Option+P** on any page of your app.
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

## License

[FSL-1.1-MIT](./LICENSE.md): free to use, modify and share, including at work,
for anything except a competing commercial product. Each version becomes MIT
two years after its release.
