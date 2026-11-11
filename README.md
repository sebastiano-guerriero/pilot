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
     - Select mode stays on, so you can click another element to switch to it. **Esc** clears the selection. With nothing selected, **Esc** turns the select tool off.
     - Clicking the cursor again turns select mode off. The selection is cleared and the page behaves normally again.
   - **Send:** sends the collected edits to the agent.
   - **Quit:** closes Pilot.
3. **Search.** Selecting an element opens the property dialog next to it. At first the dialog holds only the search field. Type a property (`opacity`, `padding`, `radius`…) and the dialog adds the matching editors below the search: the best match plus its family. `w` shows width, min-width and max-width, while `min-w` shows just min-width (see *Finding properties* below).
4. **Tweak.** Each change is applied live as an **inline style** on the selected element, so you see the result right away. Nothing touches your source yet. **Cmd+Z** (Ctrl+Z on Windows/Linux) undoes the last change, and **Cmd+Shift+Z** (Ctrl+Shift+Z or Ctrl+Y) redoes it. This works for every property, across selections, and a whole drag counts as one step.
5. **Hand off.** Click **Send**. The edits go to the agent through Pilot's local bridge and MCP server. When no agent is connected, Send copies them to the clipboard as a Markdown prompt you can paste into any agent.
6. **Apply.** The agent translates the plain-CSS intent into your stack. For example, `border-radius: 12px` becomes `rounded-xl` in a Tailwind project, an existing `--radius-lg` token, or a CSS-module rule.

**Keyboard: as fast as typing Tailwind classes.** Figma makes you hunt for a property in a sidebar. Tailwind is fast to type but gives no visual help. Pilot aims to beat both: you type, and you get a visual editor for exactly that property.

```
pt ⇥ 24 ⏎    px ⏎ 6 ⏎    …
```

| Key | Where | Does |
| --- | --- | --- |
| type | search | Finds the property. Tailwind aliases work: `p`, `pt`, `px`… The search only finds properties: values are always set in the editor. |
| **Tab** or **Enter** | search | Jumps into the matched editor. What you typed decides the focus: `pt` → top, `pl` → left |
| type a number | editor | `12` or `12px`. ↑/↓ change it by 1, by 10 with Shift |
| **Enter** | editor | Applies the value and returns to the search, text selected, ready for the next property |
| **Tab / Shift+Tab** | editor | Next/previous field (padding: top → right → bottom → left), continuing into the next/previous editor when several are shown. Past the first or last, back to the search |
| **Esc** | anywhere in the dialog | One level back: editor → search (discards typed text) → clears the search → closes the dialog |
| **Esc** | page, nothing selected | Turns the select tool off |
| **Cmd/Ctrl+Z**, **Cmd/Ctrl+Shift+Z** | anywhere | Undo / redo |

A **footer** under the properties always shows the keys for what you're doing: in the search, "**Tab** or **Enter** to edit"; in a property, "**Enter** to apply, **Esc** to go back". The keys are `<kbd>` elements and the footer carries `data-area="search" | "editor"` for styling. The copy never names a property: every panel follows the same keys, so the messages stay the same for all of them.

Linked values follow Tailwind's meaning: `px` links left and right, `py` top and bottom, and `p` all four, so one number sets them all, as one undo step.

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
  aliases: ["o"],                     // Tailwind-style short codes, exact match, ranked first
  keywords: ["transparency", "fade"], // extra search terms
  component: OpacityEditor,          // receives element, values, onChange, focusRequest, onReturnToSearch
}
```

Each editor lives in its own folder, `src/editors/<name>/`, with its `.tsx` and `.css` side by side. It's registered in [packages/overlay/src/editors/registry.ts](packages/overlay/src/editors/registry.ts), and its CSS is imported in `ui/styles/index.css`. `searchEditors()` ranks them, best first: an exact **alias**, then an exact label or property name, then a prefix (`pad`), then a substring or keyword. Aliases borrow Tailwind's utility names, so a designer who knows them gets there in a keystroke or two. Typing `p`, `pt`, `pr`, `pb`, `pl`, `px` or `py` brings up the padding editor, and so do `pad`, `padding` and `spacing`. A single editor can cover several related properties (e.g. one **Spacing** editor for `padding-*`).

**Finding properties** (`matchEditors()` in the registry). Hyphens and spaces are ignored on both sides, so `minw`, `min w`, `min-w` and `minwidth` are the same query, and `paddingtop` finds padding focused on top. **Abbreviations** work too: when nothing better matches, a query whose letters appear in order in a property name, starting at a word start, finds it (`wdt` → width, `mxw` → max-width, `pdg` → padding). Requiring a word start keeps the matches sensible (`dt` won't match width through its middle letters). Ranked last, these never override an alias, name, prefix or substring. Among several, the one skipping the fewest letters wins, then the shortest name. Swapped letters (`widht`) aren't handled yet. The dialog shows:

- **every editor tied for the best match**, if that match is a prefix or better. Once height exists, `min` will show min-width *and* min-height. A weaker, substring-only best match shows just the top editor, so a single letter doesn't flood the dialog;
- **plus the family** of each editor shown. Editors can declare a `family`: min-width and max-width belong to `width`. A query that lands on the family's main editor brings the whole family, main one first (`w`, `wid`, `width` → width, min-width, max-width). A query that lands on a member shows only that member (`min-w`, `min`, `max-width` → just that one);
- at most 4 editors.

The dialog renders each matched editor inside its own `.editor` wrapper. It passes the element's current computed values for the editor's `properties`, and `onChange` applies the new value. For the keyboard loop, editors also get `focusRequest`: a new object, `{ query }`, each time the designer tabs or enters in from the search, so the editor can focus the part the query names (`pt` → top). They call `onReturnToSearch()` when a value is done (Enter), and `onTabOut(direction)` when Tab moves past their last field (or Shift+Tab before their first). The dialog then focuses the next/previous editor with `focusRequest.edge` set to `"first"`/`"last"`, or returns to the search past either end. Esc is handled by the dialog. `onHint(content | null)` replaces the footer message while something editor-specific is going on, such as a drag. `onInspect(areas | null)` shows parts of the element's box model on the page, such as `[{ box: "padding", side: "top" }]`, in place of the selection highlight. `onRevert(property, gesture)` takes back what an ongoing gesture did to one property, restoring its exact earlier value instead of re-applying an old number, which would leave a fake edit in the change set.

**Shared editor parts.** `PropertyLabel` is the property name in a row. `PropertyInputText` is the value control: a real `<input type="text">` that sizes itself to its text, up to 128px (longer values scroll inside it), and is right-aligned, so an empty field's caret starts where typing will grow from. It sizes itself with `field-sizing: content` (falling back to a width in `ch`, exact since the font is monospaced). It works like every Pilot value: the first click selects all, Enter commits and returns to the search, Esc discards, ↑/↓ ask the editor for a step (×10 with Shift), and after an undo it shows the restored value. With no value set, it shows a `placeholder` (the property's default) in `--plt-color-contrast-low`, while set values use `--plt-color-contrast-high`. Committing an empty field means reset, and editors pass `""` to `onChange`, which removes the inline value. Editors only decide what a typed value or a step means. Values too long for the field end with an **ellipsis** (`text-overflow`) until it's focused, so you can tell there's more. Containers can tighten the 128px limit by setting `--_max-width`, as the box diagram does for its 40px side bands. A `compact` variant has 4px inline padding. For linked fields (padding's `px`), a field can report its draft (`onDraft`) and show another field's (`mirror`), meaning its text once typed and its selection drawn as `data-mirror-selected`. A focused **empty** field counts as selected until you type: its placeholder gets the selection highlight (`data-placeholder-selected`), since typing replaces it, and linked fields mirror that. So `m` ⇥ highlights all four margins even when they're all `0`.

**CSS values** ([src/css](packages/overlay/src/css)). Every field accepts the same things, through `parseValue(property, text)`:

- a bare number is px: `120` → `120px`;
- 29 length units, most common first: `px % em rem ch lh vw vh svw svh lvw lvh dvw dvh vmin vmax rlh ex cqw cqh cqi cqb cqmin cqmax cm mm in pt pc`;
- the property's keywords (`auto`, `fit-content`… for width) and the global ones (`inherit`, `initial`, `unset`, `revert`, `revert-layer`);
- functions as typed: `min()`, `max()`, `clamp()`, `var()`…;
- **math without `calc()`**: `100% - 20px`, `50%+2rem` or `100vw/3` are wrapped in `calc()`, with the spaces CSS requires added. Typing `calc(…)` works too, but fields always show the value without it (`displayValue`), so designers learn they don't need it.

**Smart parentheses** in `PropertyInputText`, as in a code editor (safe in CSS: every `(` needs its `)`). `(` inserts `()` with the caret inside, or wraps the selected text. `)` right before a `)` that closes an open one steps over it, and Backspace inside an empty `()` deletes both. So `var(` + `--gap` + `)` gives `var(--gap)` without any extra keystrokes. This hooks `beforeinput`, so it works however the character is typed. Pasted text is left as is.

Values are checked against this grammar, then by the browser (`CSS.supports`). `stepValue` handles ↑/↓: it keeps the unit, steps keywords and empty fields from the computed px, leaves math alone, and never goes below 0 unless the property allows negatives.

**CSS property database** ([src/css/properties.ts](packages/overlay/src/css/properties.ts)): per property, its default (the field's placeholder), its keywords, and whether negatives are valid. It currently covers `width`, `min-width` (default `auto`), `max-width` (default `none`), and the four sides of `padding-*` (`0`), `margin-*` (`0`, negatives and `auto` allowed) and `border-*-width` (`medium`, plus `thin`/`medium`/`thick`). Add an entry whenever an editor starts writing a new property.

**Every property change goes through the edit history** ([src/edits/history.ts](packages/overlay/src/edits/history.ts)). Editors never write `element.style` themselves; they call `onChange(property, value, { gesture })`. The history then:

- sets the value as an inline style and records the inline value it replaced, so undo restores it exactly (or removes the property if there was none),
- groups a continuous interaction into one undo step: every change made with the same `gesture` object is one step, so a drag passes the same token on each move,
- skips no-op changes (re-applying the current value),
- can `revert()` one property of the ongoing gesture to exactly what it was (dropping the step if nothing is left),
- handles **Cmd/Ctrl+Z** and **Cmd/Ctrl+Shift+Z** / **Ctrl+Y** in `App`, unless there's nothing to undo or redo, or the user is typing in one of the page's own fields.

The same records will provide the change set's `from → to` values.

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
mountPilot({ dev: { select: ".button--primary" } });
```

On every load this launches Pilot (even after a Quit), turns on select mode, and selects the first element matching `select`, so the dialog opens with an empty search. Add `query: "padding"` to pre-fill the search and open that editor directly. Remove `dev` to get the real flow back.

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
    BoxAreas/                box-model areas of the selection (padding, border, margin being edited)
    PropertyLabel/           shared: the property name in an editor row
    PropertyInputText/       shared: the value control in an editor row (a text input)
    PropertyLabel/           property name in an editor row
    PropertyInputText/       value control in an editor row
```

To add a component, create `components/<Name>/<Name>.tsx` and `<Name>.css`, then add one `@import` line to `styles/index.css`. Property editors will follow the same pattern under `src/editors/<name>/`.

| File | Purpose |
| --- | --- |
| [styles/index.css](packages/overlay/src/ui/styles/index.css) | Entry point. It declares the layer order and `@import`s every file. Add new component files here. |
| [styles/tokens.css](packages/overlay/src/ui/styles/tokens.css) | All design tokens as `--plt-*` custom properties, declared on `.root` (Pilot's container inside the Shadow DOM): color themes (light, plus dark via `prefers-color-scheme`), typography scale, spacing, radius, shadow, sizes, z-index. |
| [styles/base.css](packages/overlay/src/ui/styles/base.css) | Resets (cuts inheritance from the host page) and shared building blocks like `.surface`, the floating-panel look used by the toolbar and search. |
| `components/<Name>/<Name>.css` | That component's rules: [Toolbar](packages/overlay/src/ui/components/Toolbar/Toolbar.css), [PropertyDialog](packages/overlay/src/ui/components/PropertyDialog/PropertyDialog.css), [PropertySearch](packages/overlay/src/ui/components/PropertySearch/PropertySearch.css), [Highlight](packages/overlay/src/ui/components/Highlight/Highlight.css), [BoxAreas](packages/overlay/src/ui/components/BoxAreas/BoxAreas.css), [PropertyLabel](packages/overlay/src/ui/components/PropertyLabel/PropertyLabel.css), [PropertyInputText](packages/overlay/src/ui/components/PropertyInputText/PropertyInputText.css). |

Conventions:

- **Layers decide which rule wins.** The order is `@layer tokens, base, components`, and later layers win. A component rule always beats a base rule, whatever the selector specificity.
- **`@scope` isolates components.** Each component file wraps its rules in `@scope (.component-root) { … }`. Inner class names can stay short and generic (`.button`, `.label`, `.input`), because they only match inside that component. Containers that will host property editors stop at the editor boundary with `@scope (.property-search) to (.editor)`, so their rules never leak into an editor.
- **Variants are attributes**, e.g. `data-variant="hover"` or `aria-pressed="true"`, styled as `:scope[data-variant="hover"]`.
- **Use only defined tokens, otherwise raw values.** A component may use a `var(--plt-*)` only if [tokens.css](packages/overlay/src/ui/styles/tokens.css) defines it. When no token fits, write the raw value (`8px`) instead of inventing a token. New tokens go into `tokens.css` deliberately, never as a side effect of a component change. An undefined token doesn't cause any error; the property just silently gets no value. So `pnpm test` includes a check ([tokens.test.ts](packages/overlay/src/ui/styles/tokens.test.ts)) that fails and lists every `var(--plt-…)` that `tokens.css` doesn't define.
- **Tokens are protected from the page.** CSS variables inherit into a Shadow DOM, and page CSS can set them on the `<pilot-root>` host element, which beats `:host` declarations. So tokens are declared on `.root` instead, which page CSS can't reach. The short `--plt-` prefix (in the spirit of Tailwind's `--tw-`) also means no site variable shares a name with them, so a missing token can't silently pick up a page value.
- **Sizes are in px, not rem.** Inside a Shadow DOM, `rem` still follows the host page's `<html>` font size, which Pilot doesn't control.
- **Native CSS nesting** (`&:hover`) is fine. The build flattens it.
- **Text selection** anywhere in Pilot uses the accent at 20% (`.root ::selection` in `base.css`).
- **Typography is set once on `.root`.** That covers font family, size, line height and OpenType features, and every Pilot element inherits them. Components only change what differs, e.g. the highlight label's smaller size.

#### Font

Pilot's main font is **Geist Mono** (variable, weights 100–900):

- **No network request.** The woff2 is vendored in [packages/overlay/src/assets/fonts](packages/overlay/src/assets/fonts) and inlined into the bundle as a data URL. There's no Google Fonts or CDN request. It comes from Vercel's `geist` npm package v1.9.2 under the SIL Open Font License, and the license file sits next to the font.
- **Registered from JavaScript, not CSS.** [ui/fonts.ts](packages/overlay/src/ui/fonts.ts) registers the font with the FontFace API (`document.fonts`). Browsers don't reliably apply `@font-face` rules declared inside a Shadow DOM, and this way Pilot doesn't have to add a `<style>` to the host page.
- **It has its own family name.** It's registered as `"PLT Geist Mono"`, so it never collides with a Geist Mono the host app loads, which might be a different version or subset.
- **OpenType features.** `--plt-font-features` holds them and is set to `normal`, so every number uses Geist Mono's default **slashed zero**. Don't enable `ss09`: it's the font's non-slashed zero, its only alternate digit style. The other stylistic sets are listed in `tokens.css`.

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
- [x] Dialog = search field + the matching editors as you type: best matches plus their family, Tab across all of them
- [x] Footer with a contextual key hint (search vs. editing a property)
- [x] Keyboard loop: Tab/Enter from the search into the editor (focus picked from the alias), Enter back to the search, Tab between fields, Esc one level at a time
- [ ] Typing a letter in a fully selected value jumps back to the search (experiment)
- [x] `describeElement()`: unique selector, DOM path, text snippet
- [ ] Parent/child navigation for the selection (e.g. picking the wrapper instead of the text inside it)
- [x] Undo/redo for every property change (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y), with drags grouped into one step
- [ ] Inline-style preview engine: track `from → to` per element for the change set, revert per property/element
- [ ] Keep pending edits across page reloads. Today a reload (including the dev server's full reloads) drops every preview edit and the undo history, because they only live in the page's DOM and memory.
- [ ] First property editors (opacity, spacing, radius, color, typography…)
  - [x] **Box editors**: padding, margin, border width ([editors/box/BoxEditor.tsx](packages/overlay/src/editors/box/BoxEditor.tsx)). One component, configured per property group: the CSS property for each side, Tailwind aliases, the diagram's title, the page area to show, and optionally a property the value depends on. Each is a small definition: [padding](packages/overlay/src/editors/padding/PaddingEditor.tsx), [margin](packages/overlay/src/editors/margin/MarginEditor.tsx), [border](packages/overlay/src/editors/border/BorderEditor.tsx).
    - **Layout:** a row with the name as a `PropertyLabel` on the left and the diagram on the right. The diagram is 128×72, with a 48×24 center standing for the element. Each side is a trapezoid between the center and the edge, highlighted on hover. Each value is a compact `PropertyInputText` centered in its band: 16px tall, sized to its content, up to 4 characters on the left/right sides (`4ch` + padding ≈ 34px, inside the 40px bands) and 80px on top/bottom (24px bands), with an ellipsis when it doesn't fit.
    - **Values:** any value that's there shows at full contrast, without `px` (`12`, `1.5rem`), whether Pilot set it inline or it comes from the page's own CSS (the button's `padding: 10px 18px`). Only the default, nothing there (`0`), is dimmed, as the empty field's placeholder. The placeholder is always that default, so deleting a value previews the reset (`0`) instead of repeating the deleted value. After Enter, a side the page's CSS sets shows that value again. Real values can be selected and mirrored like any text. A side accepts what every field accepts (`12` as px, units, keywords, math). Clearing it removes Pilot's inline value and goes back to the page's value. (Width can't make this distinction yet: its computed value is always a px number, whether or not the stylesheet sets one.)
    - **Type:** click the value (text cursor) or anywhere else on a side. The first click selects all. Type, then press Enter.
    - **Arrow keys:** ↑/↓ change the value by 1, or 10 with Shift, keeping the unit.
    - **Drag:** drag over a side, outside its value, to scrub. Dragging outward from the label increases the value: up for top, right for right, and so on. Padding and border never go below 0. Margin can go negative. **Hold Alt while dragging** to change the opposite side too, or **Shift** for all four sides. Shift wins if both are held, either key can be pressed or released mid-drag, and a side that drops out is reverted to exactly what it was. Alt is shown before it's needed: on a side's drag area (the ↕/↔ cursor), the footer says "Hold **Alt** to change both sides". Holding Alt lights up the opposite side (`data-paired`), and the footer says "Drag to change top and bottom" without applying anything. Shift lights up the other three sides ("Drag to change all sides"). During the drag, the footer says "Changing top and bottom".
    - **On the page:** while a side is hovered or dragged, the selection outline and corner dots are replaced by the element's actual area (padding inside the border, the border itself, or margin outside it) for every affected side. It's drawn in the accent at 30% with 1px diagonal stripes, follows the values live, and carries `data-box` for styling.
    - **From the search:** the per-side alias (`pt`, `mr`, `border-b`…) or property name focuses that side. The axis aliases (`px`/`py`, `mx`/`my`, `border-x`/`border-y`) and the all-sides alias (`p`, `m`, `border`) link sides (`data-linked`), and the editor's name focuses top. Linked sides keep their own values until you type, then mirror the typed text. While the value is fully selected, they also show the selection highlight. Enter or Tab applies to all linked sides as one undo step. A link lasts only while focus stays in the editor: leaving it any way (Esc, Enter, a click elsewhere) ends the link, so a later click on one side edits just that side.
    - **Border needs a style:** a width does nothing while the side's `border-style` is `none` (the default). Setting a width on such a side also sets `border-{side}-style: solid` in the same undo step. Clearing that width later removes the style Pilot added, and an existing style is left alone.
  - [x] Width, min-width, max-width ([editors/width](packages/overlay/src/editors/width)), built on the shared one-value [LengthEditor](packages/overlay/src/editors/length/LengthEditor.tsx): a label and one value (`PropertyInputText`). `min-w`/`max-w` are the aliases, and placeholders come from the property database (`auto`, `auto`, `none`). The rest of this entry describes width, and the other two work the same way.
    - **Values:** shows the width set on the element, in full contrast. With none set, the field is empty and shows the default, `auto`, as a dimmed placeholder (`--plt-color-contrast-low`). Typing `auto` makes it explicit, so it shows as a value. Accepts what every Pilot field accepts (see **CSS values** below): `120` (taken as px), `50%`, `8lh`, `auto`, `fit-content`, and math without `calc()` (`100% - 20px`). Invalid text is ignored.
    - **Reset:** delete the content and confirm (Enter, Tab or click away) to remove the value, so the element goes back to its default or stylesheet width. It's undoable like any change. Pilot only knows values it set inline: if the stylesheet sets a width, the placeholder still says `auto`.
    - **Keys:** ↑/↓ step the number and keep its unit (`100%` → `101%`; keywords step from the computed px), with Shift for 10. From the search, `w`/`width` + Tab/Enter focuses the value. With a single field, Tab and Shift+Tab return to the search.
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
- Values typed in the search (`pt-4` + Enter, Tailwind-style) are deliberately left out for now: the search only finds properties. Revisit once more editors exist.
- Does Send also quit Pilot (hand control back), or keep it running for more edits?
- Should the toolbar be draggable, or have a fixed position (bottom center for now)?
- After a click selects an element, should select mode stay on (current behavior) or switch off so the page is interactive again?
- License.
