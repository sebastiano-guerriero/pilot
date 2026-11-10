# Pilot

**Take the controls from your coding agent.**

Pilot is a design tool that lives inside your codebase, not on a separate canvas. You're building with an agent. When you want to experiment or make a few precise edits yourself, you launch Pilot and your running app becomes editable. You select an element, search for the property you want to change, and tweak it with a purpose-built control. When the result looks right, you hand the edits back to the agent, and the agent writes them into the source using your project's conventions.

> Status: **early scaffolding**. The toolbar (cursor, send, quit) and element selection work with placeholder styling, and the playground launches Pilot with a stand-in for `/pilot`. The inline-style engine, property editors and the agent handoff are next. See the [Roadmap](#roadmap).

---

## How it works

```
 you + agent working            you take the controls                  agent takes them back
┌──────────────────┐     ┌───────────────────────────────────┐     ┌──────────────────────────┐
│ "/pilot"         │ ──▶ │ select element                    │ ──▶ │ reads the change set     │
│                  │     │ search "opa" → opacity editor     │     │ translates plain CSS to  │
│                  │     │ drag → inline CSS preview         │     │ Tailwind / modules /     │
│                  │     │ Send to agent  ·  Copy prompt     │     │ tokens, edits source     │
└──────────────────┘     └───────────────────────────────────┘     └──────────────────────────┘
```

1. **Launch.** Run `/pilot` in your agent. Pilot is loaded in dev but stays invisible until `/pilot` launches it.
2. **The toolbar.** While Pilot runs, a small toolbar is always visible. It has three buttons:
   - **Cursor:** turns on select mode. Then click any element on the page.
     - Hovering outlines the element and labels it with its name and size, e.g. `a.button 122×41`.
     - A click selects the element. Pilot catches the click, so the page's own handlers and links don't fire. The selected element gets an outline with a round 4px accent handle on each corner.
     - Select mode stays on, so you can click another element to switch to it. **Esc** clears the selection.
     - Clicking the cursor again turns select mode off. The selection is cleared and the page behaves normally again.
   - **Send:** sends the collected edits to the agent.
   - **Quit:** closes Pilot.
3. **Search.** Selecting an element opens the property dialog next to it. At first the dialog holds only the search field. Type a property (`opacity`, `padding`, `radius`…) and the dialog adds the editor for the best-matching property, and only that one, below the search.
4. **Tweak.** Each change is applied live as an **inline style** on the selected element, so you see the result right away. Nothing touches your source yet.
5. **Hand off.** Click **Send**. The edits go to the agent through Pilot's local bridge and MCP server. When no agent is connected, Send copies them to the clipboard as a Markdown prompt you can paste into any agent.
6. **Apply.** The agent translates the plain-CSS intent into your stack. For example, `border-radius: 12px` becomes `rounded-xl` in a Tailwind project, an existing `--radius-lg` token, or a CSS-module rule.

**Launching and quitting.** `/pilot` is the only way to launch Pilot, and the toolbar's **Quit** button is the only way to quit it. There's no keyboard shortcut for now. Pilot remembers whether it's running for the current browser tab, so the reloads a dev session triggers all the time (the agent editing files, HMR) don't open or close it on their own.

## Principles

- **Lives in the codebase.** It's a dev-only overlay in your real app, with real data, real layout and real breakpoints. There's no canvas to keep in sync.
- **Captures intent, never edits source.** Pilot records `property: from → to` on identifiable elements. The agent decides how that maps onto your setup.
- **Framework-agnostic.** It works on any page because it only deals with the DOM and CSS. Framework hints (like a component name) may be added to the hand-off when available, but nothing depends on them.
- **First-party editors.** Every property editor is designed and shipped with Pilot. Users find editors through search. They don't assemble or customize them. Pilot is meant as an alternative to Figma, not a component kit.
- **Isolated.** The UI renders in a Shadow DOM, so your app's CSS doesn't leak into Pilot and Pilot's CSS doesn't leak into your app. Outside that, Pilot adds only one thing to your page: a crosshair-cursor `<style>` tag, and only while select mode is on.

## Architecture

```
┌──────────────────────── browser (your app, dev mode) ────────────────────────┐
│  @pilot/overlay  (Shadow DOM, Preact)                                        │
│    toolbar · selection · property search · editors · inline-style preview   │
│    change set ──▶ Send ──HTTP──┐   (no agent connected → clipboard prompt)  │
│                                └────────┐                                    │
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
| `@pilot/overlay` | [packages/overlay](packages/overlay) | The in-page editor: Shadow DOM mount, launch/quit, toolbar, property search, editor registry. Builds `pilot.js` (API) and `pilot-auto.js` (self-mounting). |
| `@pilot/protocol` | [packages/protocol](packages/protocol) | Shared `ChangeSet` types and `formatPrompt()`. The clipboard prompt and the MCP tools produce identical text. |
| `@pilot/cli` | [packages/cli](packages/cli) | The `pilot` command: `init`, `bridge`, `mcp` (placeholders for now). |
| `playground` | [apps/playground](apps/playground) | A plain Vite page for developing Pilot. |
| `/pilot` skill | [skills/pilot](skills/pilot) | Instructions the agent follows to launch Pilot and apply change sets. |

### The change set

The overlay records a `ChangeSet`: page URL, viewport, an optional designer note, and per element a selector, DOM path, text snippet, and the `{ property, from, to }` changes. See [packages/protocol/src/types.ts](packages/protocol/src/types.ts). `describeElement()` ([packages/overlay/src/dom/target.ts](packages/overlay/src/dom/target.ts)) builds the element part:

- A selector guaranteed to match only that element. It prefers ids and adds `:nth-of-type()` only where siblings would be ambiguous.
- A readable path like `main > section.hero > h1`.
- A trimmed text snippet the agent can grep for. `formatPrompt()` turns it into a Markdown brief that tells the agent to:

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

Each editor lives in its own folder, `src/editors/<name>/`, with its `.tsx` and `.css` side by side. It's registered in [packages/overlay/src/editors/registry.ts](packages/overlay/src/editors/registry.ts), and its CSS is imported in `ui/styles/index.css`. `searchEditors()` ranks them by exact, prefix, then keyword match. A single editor can cover several related properties (e.g. one **Spacing** editor for `padding-*`).

The dialog takes the top result of `searchEditors()` and renders that editor inside an `.editor` wrapper. It passes the element's current computed values for the editor's `properties`, and `onChange` writes the new value to the element's inline style. Recording each `from → to` change for the change set comes with the inline-style engine.

### Agent handoff ("Send to agent")

The plan for one-click handoff:

1. The user runs `/pilot` in the agent. The skill tells the agent to call `pilot_wait_for_edits`. That tool blocks until the designer clicks **Send**, which effectively hands control back.
2. The agent starts `pilot mcp` as a regular MCP server (stdio). The same process listens on `localhost` for change sets posted by the overlay.
3. When the designer clicks **Send**, the tool returns the formatted change set, and the agent applies it.
4. If no agent is connected (bridge unreachable), **Send** copies the same text to the clipboard instead.
5. `/pilot` is also what launches Pilot in the open page: the bridge tells the overlay to call `launch()`.

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

`pnpm dev` starts the playground at http://localhost:5173. Until the bridge exists, the playground has a dashed **Simulate /pilot** button that launches Pilot. Use the toolbar's Quit button to close it.

**Designing the dialog.** Saving a CSS file reloads the page, which normally closes everything. To keep the dialog on screen while you style it, the playground mounts Pilot with a `dev` option ([apps/playground/src/main.ts](apps/playground/src/main.ts)):

```ts
mountPilot({ dev: { select: ".button--primary", query: "padding" } });
```

On every load this launches Pilot (even after a Quit), turns on select mode, selects the first element matching `select`, and pre-fills the search with `query`, so the dialog opens showing that editor. Remove `dev` to get the real flow back.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Playground with the overlay loaded from source (HMR) |
| `pnpm build` | Builds `packages/*` (`overlay` with Vite, `cli` with tsup) |
| `pnpm test` | Vitest across packages |
| `pnpm typecheck` | `tsc` in every workspace package |

Stack: TypeScript, Preact (small, bundled into the overlay, so it never conflicts with the host app's framework), Vite, Vitest, and tsup for the CLI.

### Styling

Pilot's styles are plain CSS. There's one file per component, and at build time they're combined into a single `<style>` injected into Pilot's Shadow DOM. Each component has its own folder, with its markup and CSS side by side:

```
packages/overlay/src/ui/
  App.tsx                    composes the UI
  fonts.ts                   registers Geist Mono
  px.ts                      inline-style unit helper
  styles/
    index.css                entry: layer order + @imports
    tokens.css               design tokens
    base.css                 resets + shared building blocks
  components/
    Toolbar/                 Toolbar.tsx + Toolbar.css
    PropertyDialog/          the dialog next to the selection: search + matched editor
    PropertySearch/          the search field
    Highlight/               Highlight.tsx + Highlight.css
```

To add a component, create `components/<Name>/<Name>.tsx` and `<Name>.css`, then add one `@import` line to `styles/index.css`. Property editors will follow the same pattern under `src/editors/<name>/`.

| File | Purpose |
| --- | --- |
| [styles/index.css](packages/overlay/src/ui/styles/index.css) | Entry point. It declares the layer order and `@import`s every file. Add new component files here. |
| [styles/tokens.css](packages/overlay/src/ui/styles/tokens.css) | All design tokens as `--plt-*` custom properties, declared on `.root` (Pilot's container inside the Shadow DOM): color themes (light, plus dark via `prefers-color-scheme`), typography scale, spacing, radius, shadow, sizes, z-index. |
| [styles/base.css](packages/overlay/src/ui/styles/base.css) | Resets (cuts inheritance from the host page) and shared building blocks like `.surface`, the floating-panel look used by the toolbar and search. |
| `components/<Name>/<Name>.css` | That component's rules: [Toolbar](packages/overlay/src/ui/components/Toolbar/Toolbar.css), [PropertyDialog](packages/overlay/src/ui/components/PropertyDialog/PropertyDialog.css), [PropertySearch](packages/overlay/src/ui/components/PropertySearch/PropertySearch.css), [Highlight](packages/overlay/src/ui/components/Highlight/Highlight.css). |

Conventions:

- **Layers decide which rule wins.** The order is `@layer tokens, base, components`, and later layers win. A component rule always beats a base rule, whatever the selector specificity.
- **`@scope` isolates components.** Each component file wraps its rules in `@scope (.component-root) { … }`. Inner class names can stay short and generic (`.button`, `.label`, `.input`), because they only match inside that component. Containers that will host property editors stop at the editor boundary with `@scope (.property-search) to (.editor)`, so their rules never leak into an editor.
- **Variants are attributes**, e.g. `data-variant="hover"` or `aria-pressed="true"`, styled as `:scope[data-variant="hover"]`.
- **Use only defined tokens, otherwise raw values.** A component may use a `var(--plt-*)` only if [tokens.css](packages/overlay/src/ui/styles/tokens.css) defines it. When no token fits, write the raw value (`8px`) instead of inventing a token. New tokens go into `tokens.css` deliberately, never as a side effect of a component change. An undefined token doesn't cause any error; the property just silently gets no value. So `pnpm test` includes a check ([tokens.test.ts](packages/overlay/src/ui/styles/tokens.test.ts)) that fails and lists every `var(--plt-…)` that `tokens.css` doesn't define.
- **Tokens are protected from the page.** CSS variables inherit into a Shadow DOM, and page CSS can set them on the `<pilot-root>` host element, which beats `:host` declarations. So tokens are declared on `.root` instead, which page CSS can't reach. The short `--plt-` prefix (in the spirit of Tailwind's `--tw-`) also means no site variable shares a name with them, so a missing token can't silently pick up a page value.
- **Sizes are in px, not rem.** Inside a Shadow DOM, `rem` still follows the host page's `<html>` font size, which Pilot doesn't control.
- **Native CSS nesting** (`&:hover`) is fine. The build flattens it.
- **Typography is set once on `.root`.** That covers font family, size, line height and OpenType features, and every Pilot element inherits them. Components only change what differs, e.g. the highlight label's smaller size.

#### Font

Pilot's main font is **Geist Mono** (variable, weights 100–900):

- **No network request.** The woff2 is vendored in [packages/overlay/src/assets/fonts](packages/overlay/src/assets/fonts) and inlined into the bundle as a data URL. There's no Google Fonts or CDN request. It comes from Vercel's `geist` npm package v1.9.2 under the SIL Open Font License, and the license file sits next to the font.
- **Registered from JavaScript, not CSS.** [ui/fonts.ts](packages/overlay/src/ui/fonts.ts) registers the font with the FontFace API (`document.fonts`). Browsers don't reliably apply `@font-face` rules declared inside a Shadow DOM, and this way Pilot doesn't have to add a `<style>` to the host page.
- **It has its own family name.** It's registered as `"PLT Geist Mono"`, so it never collides with a Geist Mono the host app loads, which might be a different version or subset.
- **OpenType features.** `--plt-font-features` holds them and is set to `"ss09" 1`. That's Geist Mono's non-slashed zero, the font's only alternate digit style (the default zero is slashed). The other stylistic sets are listed in `tokens.css`.

We decided against Tailwind for now. If we revisit it: Tailwind v4's `@property` rules are ignored inside a Shadow DOM, so shadow, ring and transform utilities need a workaround.

## Roadmap

**Foundation**
- [x] pnpm monorepo, TypeScript, Vite, Vitest
- [x] Overlay mounts in Shadow DOM, dormant until launched
- [x] `launch()` / Quit button, running state kept per tab (playground simulates `/pilot`)
- [x] Toolbar: cursor, send, quit (placeholder styling)
- [x] `ChangeSet` model and `formatPrompt()`
- [x] Property search ranking
- [ ] Visual design: toolbar, property search, selection highlight

**Editing**
- [x] Element selection: the cursor button enters select mode, with a hover highlight and label, click to select (page clicks blocked), Esc to clear
- [x] Property dialog anchored next to the selected element (right side, flips left, follows scroll/resize, stays on screen as it grows)
- [x] Dialog = search field + only the best-matching editor as you type
- [x] `describeElement()`: unique selector, DOM path, text snippet
- [ ] Parent/child navigation for the selection (e.g. picking the wrapper instead of the text inside it)
- [ ] Inline-style preview engine: apply, track `from → to`, revert per property/element
- [ ] First property editors (opacity, spacing, radius, color, typography…)
  - [ ] Padding: registered, static structure in progress ([editors/padding](packages/overlay/src/editors/padding)), behavior to wire next
- [ ] Change list in the panel (review and undo before handoff)
- [ ] Designer note field

**Handoff**
- [ ] Send: clipboard prompt when no agent is connected
- [ ] `pilot mcp`: MCP server and localhost bridge in one process
- [ ] `pilot_wait_for_edits` and the `/pilot` skill flow (including launching Pilot from the agent)
- [ ] Send to agent through the bridge

**Distribution**
- [ ] `npx pilot init` (detect framework entry, add the dev import, register MCP and skill)
- [ ] Pick the npm scope and publish

## Open questions

- Which property editors ship in v1, and how should related properties be grouped?
- Should Pilot handle hover, focus and responsive states (edit at a breakpoint or in a pseudo-state)?
- How should multi-element edits work (e.g. "all cards")?
- Do we want a keyboard shortcut to launch Pilot later? (Removed for now: `/pilot` only.)
- Does Send also quit Pilot (hand control back), or keep it running for more edits?
- Should the toolbar be draggable, or have a fixed position (bottom center for now)?
- After a click selects an element, should select mode stay on (current behavior) or switch off so the page is interactive again?
- License.
