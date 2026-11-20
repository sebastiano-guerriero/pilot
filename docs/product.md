# What Pilot is

Pilot lets you design in your running app while your agents write the code. It's a design tool that works on the real page, in development, instead of on a separate canvas: everything you do in it (an edit, a comment, a task) becomes a job for your agent, and Pilot checks the result on the page, so you see what the code does, not what the agent says it did.

You're building with an agent. When you want to steer it precisely, you launch Pilot and work on the running page itself. Select an element and change it with a purpose-built control, leave a comment on it, or ask for a task like **Make responsive**. Each one goes to the agent as a job, and the agent writes it into the source using the project's conventions. Then Pilot checks the result on the page: changes that landed stop being previewed, what didn't goes back to the agent once, and tasks are measured at every width. You see what the code does, not what the agent says it did.

## The loop

```
 you + agent working            you design in the page                 the agent writes the code
┌──────────────────┐     ┌───────────────────────────────────┐     ┌──────────────────────────┐
│ npx usepilot     │ ──▶ │ select element                    │ ──▶ │ reads the change set     │
│                  │     │ search "opa" → opacity editor     │     │ translates plain CSS to  │
│                  │     │ drag → live preview on the page   │     │ Tailwind / modules /     │
│                  │     │ Send to agent                     │     │ tokens, edits source     │
└──────────────────┘     └───────────────────────────────────┘     └──────────────────────────┘
```

1. **Launch.** `npx usepilot` in the project (it runs your agent for each job), or Option+P (Alt+P) on any page of the app. Pilot is loaded in development and stays invisible until launched. See [page.md](page.md).
2. **Select** an element with the toolbar's Select tool. Its property dialog opens next to it.
3. **Search** a property the way you'd type a Tailwind class (`pt`, `w`, `gap-x`) and get a visual editor for exactly that property. See [property-dialog.md](property-dialog.md).
4. **Tweak.** Each change shows live on the page through a stylesheet Pilot adds. Nothing touches the source yet. Cmd/Ctrl+Z undoes. See [edits.md](edits.md).
5. **Hand off.** With `npx usepilot` running, **Send** turns the changes not sent yet into a job, Pilot runs the agent for it, and you keep designing meanwhile. Without it, the toolbar says Pilot isn't running. See [handoff.md](handoff.md).
6. **Apply and check.** The agent translates the plain-CSS intent into the stack: `border-radius: 12px` becomes `rounded-xl` in a Tailwind project, an existing `--radius-lg` token, or a CSS-module rule. Pilot then checks each change against the page's real CSS.

**As fast as typing Tailwind classes.** Figma makes you hunt for a property in a sidebar. Tailwind is fast to type but gives no visual help. Pilot aims to beat both: you type, and you get a visual editor for exactly that property.

## Principles

- **Lives in the codebase.** It's a dev-only overlay in the real app, with real data, real layout and real breakpoints. There's no canvas to keep in sync.
- **Captures intent, never edits source.** Pilot records `property: from → to` (and a text's `from → to`) on identifiable elements. The agent decides how that maps onto the project.
- **Framework-agnostic.** It works on any page because it only deals with the DOM and CSS. Framework hints (a component name) may be added to the handoff when available, but nothing depends on them.
- **First-party editors.** Every property editor is designed and shipped with Pilot. Users find editors through search. They don't assemble or customize them. Pilot is meant as an alternative to Figma, not a component kit.
- **Isolated.** The UI renders in a Shadow DOM, so the app's CSS doesn't leak into Pilot and Pilot's CSS doesn't leak into the app. Outside it, Pilot adds only: a crosshair-cursor `<style>` while select mode is on, the preview stylesheet and its `data-pilot-edit` attributes ([edits.md](edits.md)), and, while a text is edited inline, `contenteditable` on that element (a run in a mixed element is wrapped in a `<span>` while it's edited).
- **Checked results.** Pilot doesn't take the agent's word when it can measure. What it can't measure (a hover state, another width, a comment) is accepted on the agent's word, and says so.
