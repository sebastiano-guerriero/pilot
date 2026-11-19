# What Pilot is

Pilot is a control surface for coding agents, and it checks their results. It isn't a design tool: it runs inside your app in development instead of on a separate canvas, and everything you do in it becomes work for your agent.

You're building with an agent. When you want to steer it precisely, you launch Pilot and work on the running page itself. Select an element and change it with a purpose-built control, leave a comment on it, or ask for a task like **Make responsive**. Each one goes to the agent as a job, and the agent writes it into the source using the project's conventions. Then Pilot checks the result on the page: changes that landed stop being previewed, what didn't goes back to the agent once, and tasks are measured at every width. You see what the code does, not what the agent says it did.

## The loop

```
 you + agent working            you take the controls                  agent takes them back
┌──────────────────┐     ┌───────────────────────────────────┐     ┌──────────────────────────┐
│ "/pilot"         │ ──▶ │ select element                    │ ──▶ │ reads the change set     │
│                  │     │ search "opa" → opacity editor     │     │ translates plain CSS to  │
│                  │     │ drag → live preview on the page   │     │ Tailwind / modules /     │
│                  │     │ Send to agent  ·  Copy prompt     │     │ tokens, edits source     │
└──────────────────┘     └───────────────────────────────────┘     └──────────────────────────┘
```

1. **Launch.** `/pilot` in the agent's chat, or Option+P (Alt+P) on any page of the app. Pilot is loaded in development and stays invisible until launched. See [page.md](page.md).
2. **Select** an element with the toolbar's Select tool. Its property dialog opens next to it.
3. **Search** a property the way you'd type a Tailwind class (`pt`, `w`, `gap-x`) and get a visual editor for exactly that property. See [property-dialog.md](property-dialog.md).
4. **Tweak.** Each change shows live on the page through a stylesheet Pilot adds. Nothing touches the source yet. Cmd/Ctrl+Z undoes. See [edits.md](edits.md).
5. **Hand off.** With an agent in `/pilot` mode, **Send** turns the changes not sent yet into a job, and you keep designing while the agent works. Without an agent, the same text is copied as a prompt to paste anywhere. See [handoff.md](handoff.md).
6. **Apply and check.** The agent translates the plain-CSS intent into the stack: `border-radius: 12px` becomes `rounded-xl` in a Tailwind project, an existing `--radius-lg` token, or a CSS-module rule. Pilot then checks each change against the page's real CSS.

**As fast as typing Tailwind classes.** Figma makes you hunt for a property in a sidebar. Tailwind is fast to type but gives no visual help. Pilot aims to beat both: you type, and you get a visual editor for exactly that property.

## Principles

- **Lives in the codebase.** It's a dev-only overlay in the real app, with real data, real layout and real breakpoints. There's no canvas to keep in sync.
- **Captures intent, never edits source.** Pilot records `property: from → to` (and a text's `from → to`, an element deleted or added) on identifiable elements. The agent decides how that maps onto the project.
- **Framework-agnostic.** It works on any page because it only deals with the DOM and CSS. Framework hints (a component name) may be added to the handoff when available, but nothing depends on them.
- **First-party editors.** Every property editor is designed and shipped with Pilot. Users find editors through search. They don't assemble or customize them. Pilot is meant as an alternative to Figma, not a component kit.
- **Isolated.** The UI renders in a Shadow DOM, so the app's CSS doesn't leak into Pilot and Pilot's CSS doesn't leak into the app. Outside it, Pilot adds only: a crosshair-cursor `<style>` while select mode is on, the preview stylesheet and its `data-pilot-edit` attributes ([edits.md](edits.md)), while a text is edited inline, `contenteditable` on that element (a run in a mixed element is wrapped in a `<span>` while it's edited), and the elements added in the DOM tree, its own nodes (`data-pilot-new`) next to the page's, until the code has them.
- **Checked results.** Pilot doesn't take the agent's word when it can measure. What it can't measure (a hover state, another width, a comment) is accepted on the agent's word, and says so.
