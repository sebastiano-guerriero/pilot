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
- The copy-prompt and MCP paths must produce identical text. Both go through `formatPrompt()`.

## Repo conventions

- pnpm workspace (`packages/*`, `apps/*`), TypeScript strict, ESM, `.ts` extensions in relative imports.
- Tests are `*.test.ts` next to the source and run with Vitest from the root (`pnpm test`).
- Before finishing a change, run `pnpm typecheck` and `pnpm test`.
- Use `pnpm dev` (playground at :5173) to try overlay changes in a browser.
