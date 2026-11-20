# Pilot docs

These are the working docs for whoever builds Pilot, people and agents. The [README](../README.md) at the root is for people who want to use Pilot: what it is and how to install it. Everything else lives here.

Each doc covers one area. Read the one for the area you're changing before you change it, and update it in the same change.

| Doc | Covers |
| --- | --- |
| [product.md](product.md) | What Pilot is, its principles, the loop from the designer to the agent and back |
| [page.md](page.md) | What Pilot draws on the page: launching, the toolbar, selecting, element names, grid lines, inline text editing, the DOM tree, the viewport width and breakpoints, tooltips |
| [property-dialog.md](property-dialog.md) | The dialog next to the selection: where it sits, the empty-search list, finding properties, the width chip and state pills, keys |
| [editors.md](editors.md) | Property editors: the contract, the shared pieces, value grammar, the property database, and each editor |
| [edits.md](edits.md) | How a change is recorded, shown and handed off: the history and undo, the preview stylesheet, declared values, removals, widths, states, text changes, the change set, reloads |
| [handoff.md](handoff.md) | Agent handoff: agent runs (`npx usepilot`), jobs, the check after done, Make responsive and the width check, comments, elements being worked on, the hub |
| [development.md](development.md) | Working on Pilot: scripts, the playground, trying it in other projects, the responsive lab, releasing, styling, fonts |
| [roadmap.md](roadmap.md) | What's built, what's next, open questions |
| [design-tokens.md](design-tokens.md) | Design tokens (in part planned) |

## How to write these docs

The docs record what the code can't say by itself: how Pilot behaves, what was decided, and why. They're the memory between sessions, so a decision that isn't written here gets undone by the next person who doesn't know it.

- **Write behavior and reasons.** "Clearing a field means the element doesn't set the property, never `0`", and why. Keep rejected alternatives when they'd come up again ("a drawn caret was tried and dropped: …").
- **Don't copy what the code already holds.** Sizes, colors, radii, timings and easings live in the CSS and the components. Lists that live in one file (the list order, the property database, the icons) are named by that file, not copied. Two copies drift.
- **Say who owns a look.** The project owner designs Pilot's visuals. Say when a part is the owner's design, a placeholder pending design, or derived from a designed one (an icon rotated or mirrored), so nobody "improves" a design or mistakes a placeholder for one.
- **Point at the code** with a link to the file once per section, and name functions in backticks. `pnpm test` checks that every link in the docs and the README points at a file that exists (`docs/links.test.ts`).
- **One home per fact.** If two docs need the same thing, one says it and the other links there.
- **Fix what's stale when you see it.** A shipped feature still listed as planned, an open question already answered: correct it in the same change.
- **Roadmap:** tick an item when it ships, as one line. The details go in the doc for its area, not in the roadmap.
