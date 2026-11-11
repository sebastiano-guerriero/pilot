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
- **Every property change must be undoable.** Editors change styles only through `onChange(property, value, { gesture })`, which goes through `EditHistory` (`src/edits/history.ts`). Never set `element.style` directly. For continuous interactions (drags, scrubbing), pass the same `gesture` object for the whole interaction so Cmd/Ctrl+Z undoes it in one step. After an undo, inputs must show the restored value. To take back part of an ongoing gesture (e.g. Alt released mid-drag), use `onRevert(property, gesture)`. Never re-apply the old number: that leaves a fake inline edit.
- Build editors from the shared pieces: a one-value property is a `lengthEditor({ … })` (`src/editors/length/`), and a four-sided one is a `boxEditor({ … })` (`src/editors/box/`). Value fields are `PropertyInputText`. Don't fork these per property; extend their config instead.
- Editors parse, display and step values with `src/css/values.ts` (`parseValue`, `displayValue`, `stepValue`), so every field accepts the same things. Don't write per-editor parsers. Add each new property an editor writes to `src/css/properties.ts` (default, keywords, negative allowed).
- The copy-prompt and MCP paths must produce identical text. Both go through `formatPrompt()`.

## Repo conventions

- pnpm workspace (`packages/*`, `apps/*`), TypeScript strict, ESM, `.ts` extensions in relative imports.
- Overlay components: one folder per component, `ui/components/<Name>/` with `<Name>.tsx` + `<Name>.css`. The CSS is wrapped in `@scope (.component-root)` and imported in `ui/styles/index.css` into `layer(components)`. Use px rather than rem. See README, "Styling".
- **Tokens: use only the `--plt-*` tokens that are actually defined in `ui/styles/tokens.css`.** The project owner maintains that file, and its contents change.
  - Read the file before writing CSS. Don't rely on memory, older versions, or other components, which may still reference tokens that were removed.
  - If no token fits, use a raw value (e.g. `8px`). Don't invent a token, and don't add one to `tokens.css` unless asked.
  - `pnpm test` fails on any `var(--plt-…)` that `tokens.css` doesn't define (`ui/styles/tokens.test.ts`).
- Preact 11 doesn't add `px` to numeric inline styles. Pass strings, using the `px()` helper in `ui/px.ts`.
- Tests are `*.test.ts` next to the source and run with Vitest from the root (`pnpm test`).
- Before finishing a change, run `pnpm typecheck` and `pnpm test`.
- Use `pnpm dev` (playground at :5173) to try overlay changes in a browser.
