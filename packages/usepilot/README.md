# Pilot

**Take the controls from your coding agent and edit your UI in the browser.**

Pilot is a dev-only design overlay for your real app. Select an element,
search a property the way you'd type a Tailwind class (`pt`, `gap-x`,
`size`), adjust it in a visual editor and see the change live. Then copy your
changes as a prompt for your coding agent: plain-CSS intent it translates into
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

## Use

1. **Launch**: press **Option+P** (Alt+P) on any page of your app.
2. **Select**: click the cursor in the toolbar, then any element.
3. **Search and edit**: type a property (`p`, `pt`, `w`, `gap`, `display`,
   `aspect`…), Tab into its editor, type or drag a value. Cmd/Ctrl+Z undoes.
   Type `from-768 ` first to make the change for some viewport widths only.
4. **Copy prompt**: the second toolbar button copies your changes as a
   prompt. Paste it to your coding agent.
5. **Clear changes**: once the agent has applied them, the eraser removes your
   changes so you see the real result (Cmd/Ctrl+Z brings them back).

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
