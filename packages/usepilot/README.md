# Pilot

**Take the controls from your coding agent and edit your UI in the browser.**

Pilot is a dev-only design overlay for your real app. Select an element,
search a property the way you'd type a Tailwind class (`pt`, `gap-x`,
`size`), adjust it in a visual editor and see the change live. Then send your
changes to your coding agent: plain-CSS intent it translates into
your project's own conventions (Tailwind classes, CSS modules, design tokens…).
Pilot never edits your files.

> Early preview (0.x). Things will change between versions.

## Install

```bash
npm install -D usepilot
```

Load it in development only. Pilot runs in its own Shadow DOM, so it doesn't
touch your app's styles or framework.

**Vite (React, Vue, Svelte, plain…)**: in your app's entry file (`main.tsx`,
`main.ts`…):

```ts
if (import.meta.env.DEV) import("usepilot/auto");
```

**Next.js (App Router)**: a small client component, rendered in your root
layout:

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
// app/layout.tsx: inside <body>
<Pilot />
```

**Anything else**: import `usepilot/auto` from code that only runs in the
browser, in development.

## Hand the page over from your agent

Pilot works with your coding agent: type `/pilot` in a chat, and Pilot opens
in your app. Design, press **Send**, and the agent applies your edits while
you keep going. Pilot shows each change until it's really in your code, and
sends back to the agent what didn't land.

**For a repo you share**: from its root folder, then commit the two files it
writes (`.claude/skills/pilot/SKILL.md` and `.mcp.json`), so everyone working
in the repo gets `/pilot`:

```bash
npx usepilot setup --project
```

**Just for you, in every project** (nothing goes in the repo):

```bash
npx usepilot setup
claude mcp add --scope user pilot -- npx -y usepilot mcp
```

(Other agents: add `npx -y usepilot mcp` as an MCP server in their settings.)

## Use

1. **Launch**: press **Option+P** (Alt+P) on any page of your app.
2. **Select**: click the cursor in the toolbar, then any element.
3. **Search and edit**: type a property (`p`, `pt`, `w`, `gap`, `display`,
   `aspect`…), Tab into its editor, type or drag a value. Cmd/Ctrl+Z undoes.
   Type `from-768 ` first to make the change for some viewport widths only.
4. **Send**: with an agent in `/pilot` mode, the second toolbar button sends
   your changes to it. Keep designing meanwhile; each change stops being
   previewed once it's in your code. Without an agent, the button copies
   your changes as a prompt to paste anywhere (Cmd/Ctrl+Z undoes them once
   they're applied).

Your changes survive reloads in the same browser tab. Quit with the toolbar's
last button.

## Options

```ts
import { mountPilot } from "usepilot";

mountPilot({
  shortcut: "alt+p", // or "ctrl+shift+e", or false
  launch: false, // true: open on load
  nameAttributes: ["data-block"], // attributes your project names elements with
});
```

## License

[FSL-1.1-MIT](./LICENSE.md): free to use, modify and share, including at work,
for anything except a competing commercial product. Each version becomes MIT
two years after its release.
