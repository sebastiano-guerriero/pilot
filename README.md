# Pilot

**Take the controls from your coding agent.**

Pilot is a design tool that lives inside your codebase, not on a separate canvas. You're building with an agent. When you want to experiment or make a few precise edits yourself, you launch Pilot and your running app becomes editable. You select an element, search for the property you want to change, and tweak it with a purpose-built control. When the result looks right, you hand the edits back to the agent, and the agent writes them into the source using your project's conventions.

> Status: **early scaffolding**. The overlay mounts and toggles. Selection, property editors and the agent handoff are next. See the [Roadmap](#roadmap).

---

## How it works

```
 you + agent working            you take the controls                  agent takes them back
┌──────────────────┐     ┌───────────────────────────────────┐     ┌──────────────────────────┐
│ "/pilot"         │ ──▶ │ select element                    │ ──▶ │ reads the change set     │
│  (or Option+P)   │     │ search "opa" → opacity editor     │     │ translates plain CSS to  │
│                  │     │ drag → inline CSS preview         │     │ Tailwind / modules /     │
│                  │     │ Send to agent  ·  Copy prompt     │     │ tokens, edits source     │
└──────────────────┘     └───────────────────────────────────┘     └──────────────────────────┘
```

1. **Launch.** Run `/pilot` in your agent, or press **Option+P** (Alt+P) in the browser.
2. **Select.** Click any element on the page.
3. **Search.** Type a property (`opacity`, `padding`, `radius`…). As you type, Pilot shows the matching editor.
4. **Tweak.** Each change is applied live as an **inline style** on the selected element, so you see the result right away. Nothing touches your source yet.
5. **Hand off.**
   - **Send to agent** (one click): the edits go to the agent through Pilot's local bridge and MCP server.
   - **Copy prompt** (always works): copies a Markdown change list that you can paste into any agent.
6. **Apply.** The agent translates the plain-CSS intent into your stack. For example, `border-radius: 12px` becomes `rounded-xl` in a Tailwind project, an existing `--radius-lg` token, or a CSS-module rule.

## Principles

- **Lives in the codebase.** It's a dev-only overlay in your real app, with real data, real layout and real breakpoints. There's no canvas to keep in sync.
- **Captures intent, never edits source.** Pilot records `property: from → to` on identifiable elements. The agent decides how that maps onto your setup.
- **Framework-agnostic.** It works on any page because it only deals with the DOM and CSS. Framework hints (like a component name) may be added to the hand-off when available, but nothing depends on them.
- **First-party editors.** Every property editor is designed and shipped with Pilot. Users find editors through search. They don't assemble or customize them. Pilot is meant as an alternative to Figma, not a component kit.
- **Isolated.** The UI renders in a Shadow DOM, so your app's CSS doesn't leak into Pilot and Pilot's CSS doesn't leak into your app.

## Architecture

```
┌──────────────────────── browser (your app, dev mode) ────────────────────────┐
│  @pilot/overlay  (Shadow DOM, Preact)                                        │
│    selection · property search · property editors · inline-style preview    │
│    change set ──▶ Copy prompt (clipboard)                                    │
│               ──▶ Send to agent ──HTTP──┐                                    │
└─────────────────────────────────────────┼────────────────────────────────────┘
                                          ▼
                     @pilot/cli   `pilot mcp`  (local process, started by the agent)
                       • localhost HTTP endpoint that receives change sets
                       • MCP tools over stdio, e.g. pilot_wait_for_edits
                                          ▲
                              coding agent (Claude Code, Cursor, …)
                              + the /pilot skill
```

| Package | Path | Role |
| --- | --- | --- |
| `@pilot/overlay` | [packages/overlay](packages/overlay) | The in-page editor: Shadow DOM mount, toggle shortcut, property search, editor registry. Builds `pilot.js` (API) and `pilot-auto.js` (self-mounting). |
| `@pilot/protocol` | [packages/protocol](packages/protocol) | Shared `ChangeSet` types and `formatPrompt()`. Copy prompt and the MCP tools produce identical text. |
| `@pilot/cli` | [packages/cli](packages/cli) | The `pilot` command: `init`, `bridge`, `mcp` (placeholders for now). |
| `playground` | [apps/playground](apps/playground) | A plain Vite page for developing Pilot. |
| `/pilot` skill | [skills/pilot](skills/pilot) | Instructions the agent follows to launch Pilot and apply change sets. |

### The change set

The overlay records a `ChangeSet`: page URL, viewport, an optional designer note, and per element a selector, DOM path, text snippet, and the `{ property, from, to }` changes. See [packages/protocol/src/types.ts](packages/protocol/src/types.ts). `formatPrompt()` turns it into a Markdown brief that tells the agent to:

- map the values to the project's conventions (no inline styles),
- prefer existing tokens and utilities, and report any value it had to approximate,
- ask before changing a shared component everywhere.

### Property editors

A property editor is a Preact component plus metadata ([packages/overlay/src/editors/types.ts](packages/overlay/src/editors/types.ts)):

```ts
{
  id: "opacity",
  label: "Opacity",
  properties: ["opacity"],          // CSS it writes
  keywords: ["transparency", "fade"], // extra search terms
  component: OpacityEditor,          // receives element, values, onChange
}
```

Editors are registered in [packages/overlay/src/editors/registry.ts](packages/overlay/src/editors/registry.ts), and `searchEditors()` ranks them by exact, prefix, then keyword match. A single editor can cover several related properties (e.g. one **Spacing** editor for `padding-*`).

### Agent handoff ("Send to agent")

The plan for one-click handoff:

1. The user runs `/pilot` in the agent. The skill tells the agent to call `pilot_wait_for_edits`. That tool blocks until the designer clicks **Send**, which effectively hands control back.
2. The agent starts `pilot mcp` as a regular MCP server (stdio). The same process listens on `localhost` for change sets posted by the overlay.
3. When the designer clicks **Send**, the tool returns the formatted change set, and the agent applies it.
4. If no agent is connected (bridge unreachable), **Send** falls back to **Copy prompt**.

## Installing Pilot in a project (planned)

```bash
npx pilot init
```

`init` will add the dev-only overlay to the app and register the MCP server and `/pilot` skill with the user's agent. Users will also be able to ask their agent to install Pilot through the MCP server. Manual setup will look like this:

```ts
// app entry, dev only
if (import.meta.env.DEV) import("@pilot/overlay/auto");
```

> Package names (`@pilot/*`) are placeholders until we pick an npm scope.

## Developing Pilot

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` starts the playground at http://localhost:5173. Press **Option+P** to toggle the panel.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Playground with the overlay loaded from source (HMR) |
| `pnpm build` | Builds `packages/*` (`overlay` with Vite, `cli` with tsup) |
| `pnpm test` | Vitest across packages |
| `pnpm typecheck` | `tsc` in every workspace package |

Stack: TypeScript, Preact (small, bundled into the overlay, so it never conflicts with the host app's framework), Vite, Vitest, and tsup for the CLI.

## Roadmap

**Foundation**
- [x] pnpm monorepo, TypeScript, Vite, Vitest
- [x] Overlay mounts in Shadow DOM, toggles with Option+P / Escape
- [x] `ChangeSet` model and `formatPrompt()`
- [x] Property search ranking
- [ ] Panel design (look and feel of the shell, search and results)

**Editing**
- [ ] Element selection: hover highlight, click to select, parent/child navigation
- [ ] Inline-style preview engine: apply, track `from → to`, revert per property/element
- [ ] First property editors (opacity, spacing, radius, color, typography…)
- [ ] Change list in the panel (review and undo before handoff)
- [ ] Designer note field

**Handoff**
- [ ] Copy prompt
- [ ] `pilot mcp`: MCP server and localhost bridge in one process
- [ ] `pilot_wait_for_edits` and the `/pilot` skill flow
- [ ] Send to agent, with Copy fallback

**Distribution**
- [ ] `npx pilot init` (detect framework entry, add the dev import, register MCP and skill)
- [ ] Pick the npm scope and publish

## Open questions

- Which property editors ship in v1, and how should related properties be grouped?
- Should Pilot handle hover, focus and responsive states (edit at a breakpoint or in a pseudo-state)?
- How should multi-element edits work (e.g. "all cards")?
- Should the shortcut be configurable per project? (It's already an option on `mountPilot`.)
- License.
