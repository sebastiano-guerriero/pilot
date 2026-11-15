# Pilot: notes for agents working on this repo

Read [README.md](README.md) first. It holds the product vision, architecture and roadmap.

## Keep the README current

The README is the project's living spec. Update it in the same change whenever you:
- add, remove or rename a package, script or command,
- complete a roadmap item (tick it) or add new planned work,
- change a design decision (handoff flow, change-set shape, editor contract),
- resolve an open question (move the answer into the relevant section).

## Product rules

- Pilot never edits source files. It records plain-CSS intent (`ChangeSet` in `packages/protocol`), and the agent translates that intent into the project's conventions.
- The overlay must stay framework-agnostic and isolated: Shadow DOM, no global CSS, and no dependency on the host app's packages. Preact is bundled into the overlay.
- Property editors are first-party and are designed by the project owner. Don't invent editor visuals without being asked. Build the plumbing and leave the look for review.
- **Every property change must be undoable.** Editors change styles only through `onChange(property, value, { gesture })`, which goes through `EditHistory` (`src/edits/history.ts`). It shows changes on the page through the preview stylesheet (`src/dom/preview.ts`). Never set `element.style`: Pilot never touches the elements' own styles. For continuous interactions (drags, scrubbing), pass the same `gesture` object for the whole interaction so Cmd/Ctrl+Z undoes it in one step. After an undo, inputs must show the restored value. To take back part of an ongoing gesture (e.g. Alt released mid-drag), use `onRevert(property, gesture)`. Never re-apply the old number: that leaves a fake edit.
- Editors show what they change on the page with `onInspect(areas)`. Whether an area hides the selection highlight (outline, dots, label) while its editor is in use depends on the property: hide it only where it would cover the change happening live (padding, border, margin), and keep it otherwise (gap). Set this per area in `hidesSelection()` (`src/dom/boxModel.ts`), and ask the project owner when it's unclear.
- Build editors from the shared pieces: a one-value property is a `lengthEditor({ … })` (`src/editors/length/`), also for non-lengths: give the property a `kind` in `css/properties.ts` (integer, grid-line, grid-span) and `name` for a row label that isn't the property name, a keyword property is a `keywordEditor({ … })` (`src/editors/keyword/`, a select, with icons per value if given), and a shorthand that splits into parts is a `splitEditor({ … })` (`src/editors/split/`: one value or each part, switched by a button in `PropertyRow`'s `action` slot; gap uses it directly, padding and margin through `sidesEditor({ … })` in `src/editors/sides/`). (Border is removed while its new component is designed; the old box diagram is gone.) Rows are a `PropertyRow` (label left, 128px value area right); value fields are `PropertyInputText` (a drag handle, `ScrubHandle`, is opt-in: pass `onScrub`, or `scrub: true` to `lengthEditor`; only where asked), and keyword pickers are `PropertySelect`. Don't fork these per property; extend their config instead.
- Search terms: an editor is found by its label, the CSS property names it writes (and their logical equivalents, `padding-inline`), and Tailwind's class names (`aliases`, plus a row label that's neither, like `grid-columns`). Nothing else: no extra search keywords, no made-up shortcuts.
- Revealing properties: when a property or value brings others with it (`display: grid` shows grid-columns, gap, justify-content, align-items), the revealed ones are editors of their own, listed in the revealing editor's `embeds` and rendered as its rows. Only the revealing property reveals: searching a revealed one (`gap`) shows just that editor. Don't add revealed properties to the revealing editor's `properties` or `aliases`, or the search finds it too.
- Clearing a field means "this element doesn't set this property", never `0`/`none`/the default. Editors pass `""` to `onChange`, and the dialog's `clearProperty()` (`src/edits/clear.ts`) records a removal when the page's CSS sets it (the field stays empty, the page previews the cascade's fallback). Don't handle clearing per editor.
- Fields show declared values, never computed ones: read them with `declaredOf(props, property)` (`src/editors/declared.ts`), which comes from `dom/declared.ts` via the dialog. Pilot's own values come from the history (`valueOf`, `removalOf`), not the page. Don't read `element.style` or `getComputedStyle` for what a field shows. Computed `values` are only for steps and drags.
- Editors parse, display and step values with `src/css/values.ts` (`parseValue`, `displayValue`, `stepValue`), so every field accepts the same things. Don't write per-editor parsers. Add each new property an editor writes to `src/css/properties.ts` (default, keywords, negative allowed).
- Viewport widths are explicit: a change is for every width unless the width chip is set. Never infer a range from the window size. Changes record the chip's `widths` through `history.apply(…, { widths })` / `clearProperty(…, widths)`, which the dialog passes for every editor: editors don't handle widths.
- The history belongs to `mountPilot` (one per page load) and survives reloads: it's saved per tab and restored by selector (`src/edits/persist.ts`). Anything new it records must be plain data (JSON-safe) apart from the element, and found again from the change's `target` after a reload.
- The copy-prompt and MCP paths must produce identical text. Both go through `formatPrompt()`, fed by `buildChangeSet()` (`src/edits/changeSet.ts`).

## Repo conventions

- pnpm workspace (`packages/*`, `apps/*`), TypeScript strict, ESM, `.ts` extensions in relative imports.
- Overlay components: one folder per component, `ui/components/<Name>/` with `<Name>.tsx` + `<Name>.css`. The CSS is wrapped in `@scope (.component-root)` and imported in `ui/styles/index.css` into `layer(components)`. Use px rather than rem. See README, "Styling".
- **Tokens: use only the `--plt-*` tokens that are actually defined in `ui/styles/tokens.css`.** The project owner maintains that file, and its contents change.
  - Read the file before writing CSS. Don't rely on memory, older versions, or other components, which may still reference tokens that were removed.
  - If no token fits, use a raw value (e.g. `8px`). Don't invent a token, and don't add one to `tokens.css` unless asked.
  - **Ask the project owner before any edit to `tokens.css`**, even one they seem to imply (adding, removing or changing a token's value). Say which token and what would change, and wait for a yes.
  - Tokens hold the shared part only. `--plt-shadow-lg` is drop shadows only: components add their own inset rings in their CSS (`inset 0 0 0 1px …`), since the ring differs per component.
  - `pnpm test` fails on any `var(--plt-…)` that `tokens.css` doesn't define (`ui/styles/tokens.test.ts`).
- **Icons from the project owner** (pasted SVGs) go into `ICONS` in `ui/components/Icon/Icon.tsx`, used through `<Icon name="…" />`, never as raw SVG in a component.
  - One color: draw it in `currentColor`, so it takes the color of the text around it.
  - Several colors: replace each hex with its token from `ui/styles/tokens.css` (e.g. `#E5E5E5` → `var(--plt-color-contrast-high)`, `#1CF69E` → `var(--plt-color-accent)`), keeping any `fill-opacity`. If a color matches no token, ask the project owner instead of keeping the hex.
  - Reuse the shared shapes when they match (the layout frame, the side and gap helpers), and derive the variations that weren't designed (reversed, single side or axis) from the designed one. Say which ones were derived, so the owner can replace them.
- Preact 11 doesn't add `px` to numeric inline styles. Pass strings, using the `px()` helper in `ui/px.ts`.
- Tests are `*.test.ts` next to the source and run with Vitest from the root (`pnpm test`).
- Before finishing a change, run `pnpm typecheck` and `pnpm test`.
- Use `pnpm dev` (playground at :5173) to try overlay changes in a browser.
