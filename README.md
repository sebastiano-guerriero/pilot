# Pilot

**Take the controls from your coding agent.**

Pilot is a design tool that lives inside your codebase, not on a separate canvas. You're building with an agent. When you want to experiment or make a few precise edits yourself, you launch Pilot and your running app becomes editable. You select an element, search for the property you want to change, and tweak it with a purpose-built control. When the result looks right, you hand the edits back to the agent, and the agent writes them into the source using your project's conventions.

> Status: **early preview (0.x)**. Selecting, searching and the property editors work; `/pilot` in an agent hands the page to you, and **Send** hands your edits back as jobs the agent applies while you keep designing. The toolbar and the job list have placeholder styling. See the [Roadmap](#roadmap).

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

1. **Launch.** Press **Option+P** (Alt+P) on any page of the app (`mountPilot({ shortcut })` changes it, `false` turns it off; it's ignored while typing in the page's own fields). Pilot is loaded in dev but stays invisible until launched. Once the agent bridge exists, `/pilot` in your agent will launch it too.
2. **The toolbar.** While Pilot runs, a small toolbar is always visible. It has three buttons:
   - **Cursor:** turns on select mode. Then click any element on the page.
     - Hovering outlines the element and labels it with its **name and size** above its top-left corner: `article[data-slot=card] 293×110` (20px tall, 4px radius, 4px inline padding, 11px, like the width button). The name says what's about to be selected ([dom/name.ts](packages/overlay/src/dom/name.ts)), the most telling one first:
       1. its id: `section#features`;
       2. a naming data attribute: the project's own first (`mountPilot({ nameAttributes: ["data-block"] })`), then the common ones, `data-testid`, `data-test`, `data-cy`, `data-qa`, `data-slot` (shadcn/ui), `data-component`, `data-name`, `data-section`: `div[data-testid=hero]`;
       3. a form field's `name`: `input[name=email]`;
       4. its tag: `article`, `a`.

       Classes are never used: there's no reliable way to tell a meaningful one (`card`) from a utility (`flex`, `p-4`). Nor are other data attributes, which libraries use for state (`data-state="open"`), or `aria-label` and the element's text (`a "Get started"`), which are for readers, not what an element is targeted by for styling. Component names (React, Vue, Svelte…) will come first once Pilot reads them. The change set's DOM path still uses classes (`shortName()`), since they help the agent find the element. The playground's page has an example of each.
     - A click selects the element. Pilot catches the click, so the page's own handlers and links don't fire. The selected element gets an outline with a round 4px accent handle on each corner. The selection has **no label**: you know what you clicked, and its corner is kept for the selection's actions (planned). Hovering the selected element doesn't add one either.
     - **Grid containers** also show their grid lines: on hover, just the lines; once selected, numbered too ([GridOverlay](packages/overlay/src/ui/components/GridOverlay/GridOverlay.tsx)): 1px dashed accent lines across the content box, numbered like CSS numbers them (1 at the start edge), with columns numbered just below the content box and rows to its left. Between tracks with a gap, both edges of the gap are drawn and the number sits in the middle. Lines that sit on the element's outline (the outer lines, when there's no padding or border) aren't drawn, since they'd only double it. Their numbers stay. The first and last column numbers align to the box's edges (inward). The first and last row numbers sit just outside the top and bottom lines (outward), so they never overlap each other, even in a row shorter than two badges, nor the column numbers at a corner. The numbers are drawn above everything else (the grid lines, the selection outline and its corner dots, the stripes), so nothing covers them. The lines stay while editing, padding and margin included (only a border editor would hide them, with the selection: see `hidesSelection()`). While the gap field is hovered or focused, the gaps are striped on top of them (see **Gap**). The lines come from the computed track sizes ([dom/gridLines.ts](packages/overlay/src/dom/gridLines.ts)), which include implicit tracks. `justify-content`/`align-content` `center` and `end` are accounted for, while the `space-*` values are drawn from the start edge. This is a page overlay, so computed values are fine here: the "no computed values" rule is about fields.
     - **Grid items** show their parent's grid when selected: the lines and numbers they're placed on, for col-span, col-start and col-end (`orParent` on `GridOverlay`). The parent's border box is dashed like the lines: a grid's outer lines aren't drawn (they'd double its selection outline), and the parent has no outline, so they'd look missing. An element that's a grid itself shows its own.
     - Select mode stays on, so you can click another element to switch to it. **Esc** clears the selection. With nothing selected, **Esc** turns the select tool off.
     - Clicking the cursor again turns select mode off. The selection is cleared and the page behaves normally again.
   - The toolbar ([Toolbar](packages/overlay/src/ui/components/Toolbar/Toolbar.tsx)) is select, Send, the jobs button (only while there are jobs), a divider and quit: 32px buttons 4px apart, icons from Nucleo UI (filled, 18px: `square-dashed-cursor`, `circle-arrow-up`, `loader-4`, `power-off`).
   - **Send** (the second button): with an agent on this page, sends the changes not sent yet (see **Hand off**); without one, copies them as a prompt. With something to send it's the strong one: accent background, its icon in the background color (`data-ready`). With nothing, it's disabled, its icon at 50%.
   - **Jobs:** while jobs aren't finished (waiting, an agent applying, checking the page), a third button shows the spinning loader with a pill for how many (10px tall, 4px radius, 8px bold text, 3px padding inline, accent). Its arrival is animated: its slot grows from nothing, so the toolbar widens and stays centered, then the button scales in and, 0.1s later, its pill (`slot-in`, `pop-in`, 0.2s; reversed when the last job finishes). Clicking it opens the job list.
   - **Quit:** closes Pilot.

   The **viewport width** is hidden until you need it ([ViewportWidth](packages/overlay/src/ui/components/ViewportWidth/ViewportWidth.tsx)). An invisible 6px strip runs along the top of the window. Hovering it shows the bar: 28px of content, plus 20px of invisible margin below so it doesn't hide the moment the pointer leaves the button (48px in all). It stays while the pointer is on it. It also shows while the window is being resized, and hides 800ms after the last resize (`data-resizing`), so you can watch the width while dragging the window's edge. Nothing in it can be selected as text (`user-select: none`).
   - a **ruler** from the window's left edge, in the accent: 4px ticks every 10px and 8px ticks every 50px. The first tick is a short one at 10px (none at 0). No numbers.
   - the **width button** at the right end (8px in, 8px from the top): the window's width in CSS px (`1108`, no unit), live as you resize. It's the width media queries test (`window.innerWidth`, scrollbar included). It's shaped like the hover label (20px tall, 4px radius, 4px inline padding, 11px text), in `--plt-color-background` with `--plt-color-contrast-high` text. Clicking it sets the **width chip** (see **Viewport widths** below).
   - the page's **breakpoints**, on the ruler at their widths (`640`, `960`), centered on their tick and shaped like the width button, in the accent with `--plt-color-background` text (the width button's old look). Only those narrower than the window show. Where one meets the width button, it's drawn on top. Clicking one works like clicking the width: the chip becomes `from` it, Shift+click `to` it, and a typed `from`/`to` is finished the same way. They come from the page's stylesheets as they are now (`pageBreakpoints()` in [dom/breakpoints.ts](packages/overlay/src/dom/breakpoints.ts)), read again each time the bar shows, so a breakpoint changed in your tokens shows after hot reload. Every `@media` width condition counts: `(min-width: 768px)`, `(max-width: 767.98px)`, Tailwind v4's `(width >= 48rem)`. `em`/`rem` are 16px (in media queries they're the browser's initial font size, not the page's), values are rounded to whole pixels, and two 1px apart (`max-width: 767px` next to `min-width: 768px`) count once, as the larger. Breakpoint names (`md`) aren't read: Tailwind v4 only outputs the theme variables a page uses, so they're often missing. The agent maps widths to names from the project's config. Container queries, `device-width` and cross-origin stylesheets are left out. The playground has two breakpoints to try it: `40rem` (640) and `960px`.
   - **Showing it** takes 150ms: the ticks grow down from the top edge and the button fades in, sliding down 4px. Hiding plays it backwards. No animation with reduced motion.
3. **Search.** Selecting an element opens the property dialog next to it. **Where the dialog sits** follows strict rules (`dialogSpot()` and `dialogPosition()` in [PropertyDialog](packages/overlay/src/ui/components/PropertyDialog/PropertyDialog.tsx)):
   1. It picks its spot once, when the element is selected: beside it, on its right, else its left, else overlapping its right edge when the element is too wide for either; level with its top.
   2. Editing never moves it. The element growing, shrinking or moving (a padding, a width, a display change) leaves the dialog where it is, even if the element ends up under it.
   3. Scrolling moves it with the page: the spot is in page coordinates.
   4. It only shifts to stay on screen, 8px from the edges: when scrolling would take it off, or when it grows taller (more rows) than the room below. A shift from growing sticks (`raisedSpot`): the spot moves up with it, so when it shrinks again (the `/` menu, a shorter list) its top stays put instead of dropping back. A shift from scrolling doesn't.
   5. It picks a new spot when another element is selected, or when the window is resized (measuring the element right then).
   6. You can drag it: a strip, 12px tall, runs along its top edge, over the search (it adds no height), with a grip as the clue, centered across it and 3px from the top edge (the strip is 12px tall, over the search's empty top padding) (the `grip` icon, three 2px dots, 10×2, in `--plt-color-contrast-low`, `--plt-color-contrast-high` while the strip is hovered or dragged). The cursor shows `grab` over it and `grabbing` while dragging. The dragged spot lasts for this selection and still moves with scrolling and stays on screen; selecting another element (or resizing the window) picks a spot beside that element again. Focus stays in the search, and the drag never reaches the page.

   **With nothing typed, it lists the editors for every property the element has a value for** (from any source), in a fixed order kept in [editors/listOrder.ts](packages/overlay/src/editors/listOrder.ts) (`LIST_ORDER`), by group. Today there are five. Layout: display, width, min-width, max-width, height, min-height, max-height, aspect-ratio, padding, margin, order, a flex item's flex-grow, flex-shrink, flex-basis, then a grid item's col-span, col-start, col-end. Position: position, with inset as its row, then z-index. Appearance: border-radius. Visibility: visibility (mask, clip-path and other properties about what's drawn will join it). Typography: font-family, font-size, font-style, font-weight, line-height, letter-spacing. Display's rows are set there too, per value: grid shows grid-columns, gap, justify-content, align-items; flex shows flex-direction, flex-wrap, gap, justify-content, align-items (`rowsOf()`; the display editor reads them from there). Position shows inset for every value, and with none set (`*`). A row that shows on its own (gap on an element that isn't a grid) is listed right after display. A test fails for an editor that can be listed but has no place in the order. This list (and only this one: searching shows the matches alone) is **grouped**: each group starts with its label (the group's name, `--plt-color-contrast-low`), 8px above its first row, and a dotted line like the footer's, with 4px more space above and below it, separates groups (`groupOf()`). For example: a button shows its padding rows and border, a grid its display editor with the grid rows. The list is taken when the search is empty and kept while you edit, so clearing a value doesn't make its row vanish. An editor another one shows as a row (gap under display: grid) is left to that one. **For now it lists every editor, set or not** (`LIST_ALL_EDITORS = true` in `PropertyDialog.tsx`), so the editors can be seen together while more are built; the set-only list comes back with `false`. Size, which writes nothing of its own, isn't listed. The dialog is never taller than the window (8px from each edge): the properties scroll inside it, the search and the footer stay. Rows fade out over 12px as they scroll under the line below the search and the footer's line: two overlays (`.fade`) in the dialog's background color, going transparent. They're separate elements, not a mask on the list, so whatever opens out of the list (a select's menu) isn't cut off. The list has no native scrollbar (`scrollbar-width: none`, `::-webkit-scrollbar`): those take up to 15px on Windows and Linux and look different in every browser. [ScrollThumb](packages/overlay/src/ui/components/ScrollThumb/ScrollThumb.tsx) draws a 4px thumb over the list's right edge instead (3px in, 4px from the ends, at least 20px long; contrast-high at 20%, 40% hovered or dragged), absolutely positioned so it changes nothing in the layout. It shows while the pointer is over the list or for 0.8s after a scroll, and can be dragged; wheel, trackpad and keys scroll the list as usual. Typing replaces the list with the matches; clearing the search brings it back. **The search carries over** from one selection to the next: set col-span on one card, click the next, and the col-span editor is already there. The carried-over query is selected, so Tab/Enter goes into its editor and typing replaces it. It starts empty again once nothing is selected (Esc, the cursor turned off, the dialog closed). Type a property (`opacity`, `padding`, `radius`…) and the dialog adds the matching editors below the search: the best match plus its family. `w` shows width, min-width and max-width, while `min-w` shows just min-width (see *Finding properties* below).

   **Viewport widths.** Changes are for **every width** unless you say otherwise: Pilot never guesses from the window size, since a designer on a small screen may still mean every width. To make changes for some widths only, set the **width chip**, typed at the start of the search field ([edits/widths.ts](packages/overlay/src/edits/widths.ts)). It shows as a **pill** in a row of its own above the field, where more pills (other search modifiers) will sit side by side later. The row adds the pill's 18px and 12px of space above it (the search area grows from 40px to 70px), and the pill lines up with the field's text. A pill is the accent (`--plt-color-accent`) with `--plt-color-background` text at 10px, 18px tall with a 4px radius and 4px inline padding. Its remove button is an 8px × (`close-small`) in `--plt-color-background`, at 50% opacity (on the whole button), 100% on hover, with a 16×18 target and the icon 5px from the pill's right edge:
   - **The `/` menu** (discoverability: nobody guesses `from-1200`): typing `/` at the start of the search lists the **modifiers** under the field, inside the dialog ([search/modifiers.ts](packages/overlay/src/search/modifiers.ts)). Each row has a name, the syntax it stands for and a short description: **From width** `from-768` "This viewport width and up", **To width** `to-767` "Up to this viewport width". Typing after the `/` filters them by any word of the name or the syntax (`/fr`, `/to`, `/width`). ↑/↓ move, Enter or Tab picks, and picking puts its syntax in the search to finish typing: `from-`, with the window's width suggested dimmed after it, so Tab makes the pill. Esc closes the menu and clears the `/…` text, since it isn't a property search (the dialog stays open). No property starts with `/`, so it never gets in the way of searching. The placeholder says so: "Add a property, or / for modifiers". More modifiers (hover, focus, `*`, group-checked…) are one entry each in `MODIFIERS`: what they do once set (preview, prompt) is their own work. The rows' look is a placeholder, pending design.
   - **Type** `from-1200` then a space: the chip reads `from 1200px`, and the rest of the text is the search (`from-1200 pt` searches `pt`). `to-767 ` is `to 767px`, and both make a range: `from-768 to-1199 ` is `768–1199px`. The same width at both ends reads `1108px only`. Typing another token replaces that end. A token counts only once followed by a space, so `from-12` on the way to `from-1200` isn't taken.
   - **Click** the viewport width: the chip becomes `from` that width. **Shift+click** makes it `to` that width. With one end set, a click at another width (after resizing) makes a range, in either order; the same width changes nothing, and a click on a full range starts over. Focus and the query stay where they are.
   - **Click while typing a token:** with `from`, `from-`, `to-76`… in the search (a token without its space yet, `partialWidth()`), clicking the width finishes it: the typed word decides the end (`to` clicks as Shift+click does, Shift or not), as if `to-1108 ` had been typed, and the word leaves the search.
   - **Suggestion:** after `from-` or `to-`, the window's width shows dimmed after the text (`from-` → `from-1108`, `from-11` → `from-1108`), like a code editor's autocomplete. **Tab** takes it and makes the chip. It shows only while the digits typed start the width (`widthSuggestion()`): `from-12` at 1108px suggests nothing.
   - **Remove** it with its × button, or with Backspace at the very start of the field (it removes the last pill). Esc doesn't remove it.
   - Both ends are included. The chip **stays** across selections and with nothing selected, until you remove it. Every change made while it's set is recorded for its widths, a separate change from the same property at other widths.
   - When the window is **outside** the chip's range (`from 1200px` at 1108px), the pill looks the same (`data-outside` is still set on it and on the width button, unstyled): changes you make now don't show on the page until you resize into the range, and the fields show what applies at the window's width.
4. **Tweak.** Each change shows live on the page, through a stylesheet Pilot adds (see **The preview** below), so you see the result right away. A change for some widths shows only in its range: resize the window and each range shows its own changes, and the page's CSS everywhere else. Nothing touches your source yet. **Cmd+Z** (Ctrl+Z on Windows/Linux) undoes the last change, and **Cmd+Shift+Z** (Ctrl+Shift+Z or Ctrl+Y) redoes it. This works for every property, across selections, and a whole drag counts as one step.
5. **Hand off.** With an agent in `/pilot` mode on this page, the toolbar's middle button is **Send**: the changes not sent yet become a **job** for the agent (see **Agent handoff** below). Their preview stays on the page while the agent works, and you keep designing: new changes go in the next job. When the agent reports the job done, Pilot checks each change against the page's real CSS: what landed stops being previewed (you see the real code). What didn't goes back to the agent once, with what the page gives instead; after that, Pilot takes what the code gives. Without an agent, the button is **Copy prompt**: the same text (`buildChangeSet()` in [edits/changeSet.ts](packages/overlay/src/edits/changeSet.ts), formatted by `formatPrompt()`) to paste anywhere, and **Clear changes** removes the preview once it's applied. Your changes and jobs survive reloads (see **Edits survive reloads** below).
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
| `from-1200` / `to-767` + **Space** | start of the search | Sets the width chip: changes are for those viewport widths |
| **Tab** after `from-` / `to-` | search | Takes the suggested width (the window's, dimmed) as the chip |
| **Backspace** | start of the search | Removes the width chip: changes are for every width again |
| click / **Shift+click** | viewport width (top right) | Width chip `from` / `to` the current width; a second width makes a range |

A **footer** under the properties always shows the keys for what you're doing: in the search, "**Tab** or **Enter** to edit"; in a property, "**Enter** to apply, **Esc** to go back". The keys are `<kbd>` elements and the footer carries `data-area="search" | "editor"` for styling. The copy never names a property: every panel follows the same keys, so the messages stay the same for all of them.

Linked values follow Tailwind's meaning: `px` links left and right, `py` top and bottom, and `p` all four, so one number sets them all, as one undo step.

**Launching and quitting.** The shortcut (Option+P / Alt+P) launches Pilot, and the toolbar's **Quit** button quits it. `/pilot` will launch it too once the bridge exists. Pilot remembers whether it's running for the current browser tab, so the reloads a dev session triggers all the time (the agent editing files, HMR) don't open or close it on their own.

**Edits survive reloads** ([edits/persist.ts](packages/overlay/src/edits/persist.ts)). The history (changes, undo and redo) is saved in the tab's `sessionStorage` after every change and restored when Pilot mounts again: after a reload the preview comes back, undo still works, and Copy prompt still has everything. The history belongs to `mountPilot`, not the UI, so quitting and relaunching keeps it too. Each change keeps how to find its element (its unique selector, taken at the first change) and the page it was made on. On restore, an element found on this page gets its changes back. One that isn't (another page of the app, or not rendered yet) keeps its changes on a detached stand-in, still in the prompt, and finds its element again later (`reattach()`: on launch, on selecting an element, on `popstate`). A new tab starts clean. Known limit: an element whose selector changed (a list reordered, classes renamed) can't be found again.

## Principles

- **Lives in the codebase.** It's a dev-only overlay in your real app, with real data, real layout and real breakpoints. There's no canvas to keep in sync.
- **Captures intent, never edits source.** Pilot records `property: from → to` on identifiable elements. The agent decides how that maps onto your setup.
- **Framework-agnostic.** It works on any page because it only deals with the DOM and CSS. Framework hints (like a component name) may be added to the hand-off when available, but nothing depends on them.
- **First-party editors.** Every property editor is designed and shipped with Pilot. Users find editors through search. They don't assemble or customize them. Pilot is meant as an alternative to Figma, not a component kit.
- **Isolated.** The UI renders in a Shadow DOM, so your app's CSS doesn't leak into Pilot and Pilot's CSS doesn't leak into your app. Outside that, Pilot adds only one thing to your page: a crosshair-cursor `<style>` tag, and only while select mode is on.

## Architecture

```
page (your app in dev, the overlay)          one hub per machine, 127.0.0.1:4747
  Send ──POST /jobs──────────────────────▶  ┌───────────────────────────────────┐
  job updates, launch ◀──SSE /events───────  │ jobs and agents, by page origin   │
  follow-up ──POST /jobs/:id/retry───────▶  └───────────────────────────────────┘
                                               ▲ in-process        ▲ HTTP
                                   chat A: `usepilot mcp`   chat B: `usepilot mcp`
                                   (stdio MCP, runs the hub) (joins it, takes over
                                                              if chat A closes)
```

| Package | Path | Role |
| --- | --- | --- |
| `@pilot/overlay` | [packages/overlay](packages/overlay) | The in-page editor: Shadow DOM mount, launch/quit, toolbar, property search, editor registry. Builds `pilot.js` (API) and `pilot-auto.js` (self-mounting). |
| `@pilot/protocol` | [packages/protocol](packages/protocol) | Shared `ChangeSet` types and `formatPrompt()`. The clipboard prompt and the MCP tools produce identical text. |
| `@pilot/cli` | [packages/cli](packages/cli) | The CLI, shipped as `usepilot`'s command: `mcp` (the MCP server agents start, and the hub the page talks to: [hub.ts](packages/cli/src/hub.ts), [server.ts](packages/cli/src/server.ts), [agent.ts](packages/cli/src/agent.ts), [mcp.ts](packages/cli/src/mcp.ts)), `setup` (installs the `/pilot` skill). Bundled into one file by tsup, dependencies included. |
| `usepilot` | [packages/usepilot](packages/usepilot) | The one published package: the overlay's build (`dist/`) and the CLI's (`cli/`, its `usepilot` command), copied in by its `build` script, which `prepack` runs, hand-written types (`types/`), and the user-facing README (install for Vite and Next.js, use, options). Exports `usepilot` (`mountPilot`) and `usepilot/auto` (mounts with defaults). The CLI joins it later. |
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

**Removing a value.** Clearing a field means "this element doesn't set this property", which is not the same as `0` or `none`. When the page's own CSS sets it (a stylesheet rule, a Tailwind class, the app's own `style` attribute), Pilot records a **removal** ([edits/clear.ts](packages/overlay/src/edits/clear.ts)): the change is `{ property, from, to: "", removed: true, source }`, where `source` says where the page declares it, the element's `style` attribute or a rule's selector, with how many elements on the page that selector matches (`StyleSource`). `formatPrompt()` marks the row *removed* and spells it out for the agent: stop declaring it for this element, so it gets what the cascade gives without it; and for a rule other elements share, remove it for this element only unless the designer's note says otherwise. While editing:
- **The field is empty**, the Pilot way of saying no value is set.
- **The page previews the fallback**: the next declaration in the cascade (`declaredWithout()` in [dom/declared.ts](packages/overlay/src/dom/declared.ts) leaves the removed rule out), or `revert` when no other rule declares it. `revert` falls back to the browser's own styles (a list's padding, a heading's margins), which Pilot can't read from the stylesheets, and otherwise to the inherited value or the default. `unset` would skip the browser's styles and show a wrong preview. The fallback is only for the preview: the agent gets "don't declare it here" and the removed value (to find the declaration), never the fallback, which the cascade will give anyway. The preview wins over an `!important` rule like every preview rule does (see **The preview**). For a value from the app's own `style` attribute, the preview is the stylesheets' value.
- When only Pilot set the value, clearing just drops Pilot's edit: there's nothing to remove.
- The page's own value is the declared one: Pilot never writes the element's `style`, and its preview sheet is left out of declared values. So setting `20px` over a stylesheet's `16px` and then clearing removes the `16px`.
- With the width chip set, the removal is for those widths: the field is empty and the page shows the fallback only in that range (`removalOf()` looks at the window's width).
- It's undoable like any change, and typing a value afterwards replaces the removal (`EditHistory.removalOf()`).

Once the agent has applied the change set, the page's CSS no longer sets the property, and the field is empty for the same reason it shows now.

**Widths.** A change made with the width chip set carries `widths: { min?, max? }` (`WidthRange`: CSS px, both ends included); without one it has none and is for every width. `EditHistory.changes()` lists the changes in effect, one per element, property and range. `formatPrompt()` gives every change a Widths column (`from 1200px`, `to 767px`, `768–1199px`, `1108px only`, or `every width`, worded by `describeWidths()`, which the chip uses too), and tells the agent to use the project's breakpoints when one matches (or is within a few pixels), else a custom media query, and that "every width" means no media query should override the value. When the old value comes from a rule inside `@media`, `StyleSource.media` holds the condition (`mediaOf()` in [dom/declared.ts](packages/overlay/src/dom/declared.ts)), and the prompt says where it sits today: for every width, that query mustn't override the change. Pilot shows the page's breakpoints on the ruler, as widths: the agent names them.

### Property editors

A property editor is a Preact component plus metadata ([packages/overlay/src/editors/types.ts](packages/overlay/src/editors/types.ts)):

```ts
{
  id: "opacity",
  label: "Opacity",
  properties: ["opacity"],          // CSS it writes
  aliases: ["opacity-50"],            // Tailwind's class names: exact match, ranked first
  component: OpacityEditor,          // receives element, values, onChange, focusRequest, onReturnToSearch
}
```

Each editor lives in its own folder, `src/editors/<name>/`, with its `.tsx` and `.css` side by side. It's registered in [packages/overlay/src/editors/registry.ts](packages/overlay/src/editors/registry.ts), and its CSS is imported in `ui/styles/index.css`. `searchEditors()` ranks them, best first: an exact **alias**, then an exact label or property name, then a prefix (`pad`), then a later word starting with the query (`spa` → col-span), then a substring. **The search only looks at three things:** the editor's label, the CSS property names, and Tailwind's class names (its `aliases`, plus a row label that's neither, like `grid-columns`). There are no extra search keywords ("spacing", "layout"…): they matched things the designer didn't mean (`spa` found padding through "spacing"). Aliases borrow Tailwind's utility names, so a designer who knows them gets there in a keystroke or two. Padding is four rows (`padding-top`, `-right`, `-bottom`, `-left`), each carrying the Tailwind aliases that include it: `p`, `pad` and `padding` show all four, `px` right and left, `py` top and bottom, and `pt`/`pr`/`pb`/`pl` just one. No extra logic was needed: equal matches show together.

**Finding properties** (`matchEditors()` in the registry). Hyphens and spaces are ignored on both sides, so `minw`, `min w`, `min-w` and `minwidth` are the same query, and `paddingtop` finds padding-top. **A word being typed counts**: a query that starts a later word of a name or alias (`spa` → the "span" in col-span, `ite` → align-items, `cols` → Tailwind's `grid-cols`) ranks above letters in the middle of a word, and below names that start with the query. **Abbreviations** work too: when nothing better matches, a query whose letters appear in order in a property name, starting at a word start, finds it (`wdt` → width, `mxw` → max-width, `pdg` → the padding rows). Requiring a word start keeps the matches sensible (`dt` won't match width through its middle letters). Starting at a later word (the "width" in `min-width` or `border-top-width`) counts as one more skipped letter, so `wdt` prefers width itself. Ranked last, these never override an alias, name, prefix or substring. Among several, the one skipping the fewest letters wins, then the shortest name. Swapped letters (`widht`) aren't handled yet. The dialog shows:

- **every editor tied for the best match**, if that match is a prefix or better (`w` → width, min-width and max-width; once height exists, `min` → min-width *and* min-height), or an abbreviation skipping the same number of letters (`pdg` → the four padding rows). A substring-only best match shows just the top editor, so a single letter doesn't flood the dialog. Tied editors keep the registry's order (padding: top, right, bottom, left);
- **plus the family** of each editor shown. Editors can declare a `family`: min-width and max-width belong to `width`. A query that lands on the family's main editor brings the whole family, main one first (`w`, `wid`, `width` → width, min-width, max-width). A query that lands on a member shows only that member (`min-w`, `min`, `max-width` → just that one);
- at most 4 editors.

The dialog renders each matched editor inside its own `.editor` wrapper. It passes the element's computed values for the editor's `properties` (`values`, only for steps and drags), their declared values (`declared`, what fields show), and `onChange` applies the new value. For the keyboard loop, editors also get `focusRequest`: a new object, `{ query }`, each time the designer tabs or enters in from the search, so the editor can focus the part the query names (`pt` → top). They call `onReturnToSearch()` when a value is done (Enter), and `onTabOut(direction)` when Tab moves past their last field (or Shift+Tab before their first). The dialog then focuses the next/previous editor with `focusRequest.edge` set to `"first"`/`"last"`, or returns to the search past either end. Esc is handled by the dialog. `onHint(content | null)` replaces the footer message while something editor-specific is going on, such as a drag. `onInspect(areas | null)` shows parts of the element's box model on the page, such as `[{ box: "padding", side: "top" }]` or a grid's gaps (`[{ box: "gap" }]`). **Whether an area hides the selection highlight depends on the property** (`hidesSelection()` in `dom/boxModel.ts`). Padding, margin and the gap keep the outline, corner dots, label and a grid's lines and numbers while you interact with their editor: their stripes are drawn along with the highlight, and the outline helps place them. Border hides them, since the outline sits right on top of the border it would cover (there's no border editor right now). Each new kind of area decides this in one place. `onRevert(property, gesture)` takes back what an ongoing gesture did to one property, restoring its exact earlier value instead of re-applying an old number, which would leave a fake edit in the change set.

**Shared editor parts.** `PropertyRow` lays out a one-row editor: the property name (`PropertyLabel`) on the left, and a **128px value area** on the right. The dialog is 260px wide, so with its 16px side padding and the 8px gap, labels get 92px: enough for `padding-bottom` (83px in Geist), the longest so far. Fields in the value area share it equally, with an 8px gap: one field is 128px, two are 60px each. It's a grid of equal columns (`minmax(0, 1fr)`), so each field's own padding doesn't change its share. `PropertyInputText` is the value control: a real `<input type="text">` drawn as a **24px box** that fills its slot, with a 6px radius, a `--plt-color-background-light` fill and a 1px top highlight (`inset 0 1px 0`, white at 7%). The box is the shared `.field-box` class in `base.css`, so every value control (this and `PropertySelect`) looks the same. At rest its fill is at 90% opacity; on hover it turns solid, with no transition. On `:focus-visible` it becomes solid and gains a 1px inner ring (white at 7%) on top of the highlight. Text fields match `:focus-visible` whenever they're focused, and the select's trigger only when focused from the keyboard. Text is left-aligned with 6px inline padding. It works like every Pilot value: the first click selects all, Enter commits and returns to the search, Esc discards, ↑/↓ ask the editor for a step (×10 with Shift), and after an undo it shows the restored value. **With no value set, the box is empty**, with no placeholder: the box itself shows there's a field to type into. **Fields show declared values, never computed ones:** a field shows the CSS that applies to the element from any source, as written (`50%`, `var(--space-4)`), or nothing when nothing declares it (see **Declared values** below). Pilot is for writing CSS, not for inspecting what the browser computed. Computed values are only used behind the scenes, as where ↑/↓ and drags start from. Committing an empty field means "not set", and editors pass `""` to `onChange`. The dialog turns that into a removal when the page's CSS sets the property (see **Removing a value**), or just drops Pilot's inline value otherwise. Editors only decide what a typed value or a step means. Values too long for the field end with an **ellipsis** (`text-overflow`) until it's focused, so you can tell there's more. For linked fields (padding's `px`, size), a field can report its draft (`onDraft`) and show another field's (`mirror`): its text once typed, and where typing goes, drawn over the text since a page holds only one real selection. While the linked value is selected, the other field's text shows highlighted (`.mirror-selection`, the same highlight as `::selection`). The linked field also has the focused look (`data-mirror-focus`, styled with `:focus-visible` in `.field-box`: solid fill and the inner ring), so every field typing goes to looks focused, empty ones included. (A drawn caret was tried and dropped: a static one next to the real blinking caret looked off, and a synced custom caret would mean replacing the browser's.)

`PropertyInputText` has an **icon variant** too (`icon`): a 12px icon 6px from the field's left edge, with the text 6px after it. Clicks go through the icon to the field.

`ScrubHandle` lets a field be dragged to change its value. **It's an option, not a default:** `PropertyInputText` adds it when the editor passes `onScrub(steps, startText, gesture)`, and a length row asks for it with `lengthEditor({ …, scrub: true })`. For now only **gap** has it.
- **Look:** an 8×16px wheel, 8px from the field's right edge, so it lines up with a select's chevron. The field's text keeps 22px on the right for it. The lines sit on a small drum seen edge-on (radius 8px, 22° apart, so about 3px apart at the center), like the iOS timer picker. While you drag, the drum turns with the pointer, and the lines bunch up toward the edges. A vertical mask fades them out at the top and bottom, and the lines past 35° get a slight blur for depth. On release it comes to rest on a line, matching the designed layout. Lines are drawn in `currentColor` (`--plt-color-contrast-high`).
- **Target:** the field's full height, from 4px left of the wheel to the field's right edge, so you don't have to hit the 8×16 drawing.
- **Behavior:** the cursor is `ns-resize`. Drag up to increase and down to decrease, 1 step per pixel (the value moves with the wheel), ×10 with Shift. The drag is followed on the window, not just the handle, so every move counts wherever the pointer goes, and changes of direction are tracked: the value always follows the total distance from where the drag started. Steps keep the starting value's unit, and font-relative units (`em`, `rem`, `lh`…) step by 0.1 (`scrubIncrement`). The whole drag is one undo step (one `gesture`). What it steps from is fixed when the drag starts, since the computed value changes with every step. Back at the start, the exact earlier value is restored with `onRevert`, so it leaves no fake edit. **From an empty field**, it steps from the computed value (0 for gap, so the first step up is `1px`) and never goes back to empty: back at the start it's `0px`, and only deleting the field's text removes the value. **At the minimum** (0, unless the property allows negatives), dragging further doesn't count: turning back moves the value right away, instead of first climbing back through the distance dragged below 0.

`PropertySelect` is the keyword control: a trigger in the same `.field-box` as `PropertyInputText`, with a `chevron-down` icon 8px from its right edge, and **Pilot's own dropdown menu** (not the browser's, which can't be styled and draws differently per browser). With no value set, the trigger says **Select**, dimmed (`--plt-color-contrast-low`). Its text has 6px inline padding on the left and 20px on the right (the chevron plus a 4px gap), so `repeat` fits a 60px select. Values that don't fit end with an ellipsis (`custom` does at 60px).
- **Menu:** `--plt-color-background-light`, 4px padding, 10px radius, and a shadow of a 1px top highlight (white at 7%), a 1px inner ring (white at 5%) and `--plt-shadow-lg`. It's as wide as its longest option, and at least as wide as the trigger plus the label shift (below) and its padding. It's capped at 240px (longer options end with an ellipsis) and scrolls past 320px tall. It's `position: fixed`, so the dialog's `overflow: hidden` doesn't clip it. Like macOS's native select, it **opens over the trigger**, with the current value's option on top of it, and **its label exactly where the trigger's is**. An option's label starts 18px further in than the trigger's (the checkmark column), so the menu grows leftward by that much plus its 4px padding (the shift is measured, not hardcoded). The options' right edges line up with the trigger's. Near a viewport edge it's pushed back inside, 8px from the edge, and the option then no longer covers the trigger exactly (`menuPosition`).
- **Options:** 24px tall, 8px left and 24px right padding, 6px radius. Every option has an 8px column for the `check` icon, with an 8px gap before the text, so labels line up and the current value gets the checkmark. Hovered or keyboard-highlighted options get `--plt-color-contrast-high` at 10%.
- **Keys** (a WAI-ARIA select-only combobox: focus stays on the trigger, and the highlighted option is its `aria-activedescendant`): closed, **typing picks right away**, like a native select: `f` sets flex, and repeating a letter cycles through the options starting with it (`i` → inline-block, `i` again → inline…), while several letters typed quickly (`inline-f`) narrow the match instead. Each pick is its own undo step, and "Select" is never matched. Enter, Space, ↑ or ↓ open the menu on the current value, Backspace/Delete remove the value, Tab and Shift+Tab move to the next/previous field, and Esc goes back to the search as usual. Open, ↑/↓ and Home/End move the highlight, typing moves it the same way, Enter or Space picks, Esc closes without picking, and Tab closes and moves on. Picking keeps focus on the trigger, so Tab continues from there. Clicking picks, and losing focus closes the menu.
- **The first option is "Select"** (unless `clearable={false}`, for selects that always have a value), dimmed: it means no value, is checked while nothing is set, and picking it removes the value (as Backspace/Delete on the trigger do). A value set some other way that isn't in the list is still listed, right after it.
- **Icon variant** (`iconFor(value)`): a 12px icon 6px before the text, on the trigger and on every option. In the menu, the checkmark column stays 8px before the icon. `iconFor("")` is asked for the "Select" state (nothing set). Every option gets the icon slot, empty where a value has none, so labels line up, and the label-aligned placement still lines up icons and labels with the trigger's.

**CSS values** ([src/css](packages/overlay/src/css)). Every field accepts the same things, through `parseValue(property, text)`:

- a bare number is px: `120` → `120px`;
- 29 length units, most common first: `px % em rem ch lh vw vh svw svh lvw lvh dvw dvh vmin vmax rlh ex cqw cqh cqi cqb cqmin cqmax cm mm in pt pc`;
- the property's keywords (`auto`, `fit-content`… for width) and the global ones (`inherit`, `initial`, `unset`, `revert`, `revert-layer`);
- functions as typed: `min()`, `max()`, `clamp()`, `var()`…;
- **math without `calc()`**: `100% - 20px`, `50%+2rem` or `100vw/3` are wrapped in `calc()`, with the spaces CSS requires added. Typing `calc(…)` works too, but fields always show the value without it (`displayValue`), so designers learn they don't need it.

**Smart parentheses** in `PropertyInputText`, as in a code editor (safe in CSS: every `(` needs its `)`). `(` inserts `()` with the caret inside, or wraps the selected text. `)` right before a `)` that closes an open one steps over it, and Backspace inside an empty `()` deletes both. So `var(` + `--gap` + `)` gives `var(--gap)` without any extra keystrokes. This hooks `beforeinput`, so it works however the character is typed. Pasted text is left as is.

That's for lengths. A property can be of another **kind** (`kind` in properties.ts), with its own grammar in the same functions:
- **integer** (`order`): whole numbers, no unit, negatives where allowed. ↑/↓ step by 1, an empty field from the computed value.
- **grid-line** (`grid-column-start`/`-end`): a line number (`2`, `-1`, never 0, since lines count from 1, or from -1 at the end), `span N`, or `auto`. ↑/↓ skip 0 (`1` → `-1`), and from an empty field or `auto` go to `1` or `-1`.
- **grid-span** (`grid-column`, the col-span field): a count writes `span N / span N`, like Tailwind's `col-span-N`, and `full` writes `1 / -1`, first line to last, like `col-span-full`. `displayValue(value, property)` shows them back as `N` and `full` (also `2 / span 3` → `3`). An explicit `start / end` (`2 / 4`) is accepted as typed and shown as it is. ↑/↓ step the count from 1, so ↓ on an empty field writes nothing.

Values are checked against this grammar, then by the browser (`CSS.supports`). `stepValue` handles ↑/↓: it keeps the unit, steps keywords and empty fields from the computed px, leaves math alone, and never goes below 0 unless the property allows negatives.

**CSS property database** ([src/css/properties.ts](packages/overlay/src/css/properties.ts)): per property, its initial value, its keywords, whether negatives are valid, and its kind of value (length by default). It currently covers `width`, `min-width` and `height`, `min-height` (default `auto`), `max-width` and `max-height` (default `none`), and the four sides of `padding-*` (`0`) and `margin-*` (`0`, negatives and `auto` allowed), `display` (its keywords are the select's options, `DISPLAY_VALUES`), `grid-template-columns` (`none`), `gap` (`normal`) `justify-content` and `align-items` (`normal`, options in `JUSTIFY_CONTENT_VALUES` and `ALIGN_ITEMS_VALUES`), `order` (`0`, integer), `grid-column` (`auto`, grid-span), `grid-column-start`/`-end` (`auto`, grid-line), `aspect-ratio` (`auto`, ratio), `flex-direction` (`row`, options in `FLEX_DIRECTION_VALUES`) and `flex-wrap` (`nowrap`, `FLEX_WRAP_VALUES`). Add an entry whenever an editor starts writing a new property.

**Declared values** ([src/dom/declared.ts](packages/overlay/src/dom/declared.ts)): what fields show. For each of an editor's `properties`, the dialog passes `declared`: Pilot's own value at the window's width (`EditHistory.valueOf()`), else the winning declaration of the page's own CSS: its stylesheets, Tailwind classes and the app's inline styles (`fieldValues()` in the dialog). Pilot's preview sheet is left out of the walk (`isPreviewSheet()`): its edits come from the history, which knows them exactly (and happy-dom, in tests, can't parse its `@layer` anyway). Editors read it with `declaredOf(props, property)` ([editors/declared.ts](packages/overlay/src/editors/declared.ts)). How it's found:
- **Matching rules.** It walks the stylesheets of the element's root (the document or a shadow root, including adopted sheets) in document order, following `@import`. It keeps style rules whose selector matches the element (`element.matches`) and whose conditions hold: `@media` via `matchMedia`, `@supports` via `CSS.supports`, `@scope`'s start. Nested rules are resolved (`&`, and descendants of the parent selector).
- **The cascade.** `!important` beats normal. Then inline styles beat rules. Then `@layer` order: later layers and unlayered styles win normal declarations, the order flips for important ones, and styles directly in a layer beat its sub-layers. Then specificity (`:is`/`:not`/`:has` take their most specific argument, `:where` counts nothing), then order of appearance.
- **Shorthands and logical properties.** A side also comes from its logical longhand (`padding-inline-start`), the logical pair (`padding-inline`, which Tailwind's `px-4` writes) and the shorthand (`padding: 10px 18px`), assuming horizontal, left-to-right text. CSSOM can't expand a shorthand containing `var()`, so its text is split by hand: `calc(var(--spacing) * 4)` applies to every side.
- **Cost.** One walk is shared by all the editors in a render (cached for the rest of the task, and refreshed if the stylesheets or the element's classes change). It runs about 3ms per thousand rules.
- **Known gaps.** `@container` conditions can't be evaluated from script, so those rules are skipped. `@scope`'s end bound is ignored. Cross-origin stylesheets can't be read. The browser's own (user-agent) styles aren't visible, so a `<ul>`'s default padding counts as nothing declared. The app's own `style` attribute with `!important` wins over Pilot's preview (see **The preview**).
- **Clearing a field** drops Pilot's value, or records a removal when the page's CSS sets it (see **Removing a value**). Pilot can't remove a stylesheet declaration itself; that's the agent's job at handoff.

**Every property change goes through the edit history** ([src/edits/history.ts](packages/overlay/src/edits/history.ts)). Editors never write `element.style` themselves; they call `onChange(property, value, { gesture })`. The history then:

- records the change (element, property, value, widths, removal) and rebuilds the **preview** from every change in effect (below). Nothing is restored on undo: the undone change is just left out. A change replaces Pilot's earlier ones it covers for the same element and widths: the same property, or a longhand of it (`padding` replaces `padding-top`, `grid-column` replaces `grid-column-start`). A change to `""` drops Pilot's value,
- groups a continuous interaction into one undo step: every change made with the same `gesture` object is one step, so a drag passes the same token on each move,
- skips no-op changes (setting what Pilot already sets for those widths, or `""` where it sets nothing),
- can `revert()` one property of the ongoing gesture (dropping the step if nothing is left),
- answers what Pilot sets at a width (`valueOf()`, a longhand read out of a shorthand) and whether a property is removed there (`removalOf()`), for the fields, and lists the changes in effect (`changes()`) for the change set,
- handles **Cmd/Ctrl+Z** and **Cmd/Ctrl+Shift+Z** / **Ctrl+Y** in `App`, unless there's nothing to undo or redo, or the user is typing in one of the page's own fields.

**The preview** ([src/dom/preview.ts](packages/overlay/src/dom/preview.ts)). Pilot never touches the elements' own `style`. Each edited element gets a `data-pilot-edit` id, and each change in effect becomes a rule in a `<style data-pilot-preview>` that Pilot puts first in the document's head (or the element's shadow root), in the order the changes were made:

```css
@layer pilot-preview {
  [data-pilot-edit="1"] { padding-top: 4px !important; }
  @media (min-width: 960px) { [data-pilot-edit="1"] { padding-top: 30px !important; } }
}
```

- **Widths:** a change for some widths sits in `@media` with `min-width`/`max-width`, both ends included, so resizing shows each range's changes in their range and the page's CSS elsewhere. Among Pilot's rules the later wins, so a later change for every width wins in every range.
- **It wins over the page's CSS**, like an inline style did, and more: every declaration is `!important`, in a layer declared before any of the page's (the sheet comes first), and important declarations in the first layer beat every other stylesheet's, layered (Tailwind v4's `!p-4`) or not. The one thing it can't beat is the app's own `style` attribute with `!important`.
- **Values** are written by the browser (a scratch style declaration), so one it doesn't accept is left out, as an inline value would be.
- An element loses its `data-pilot-edit` when it has no rules left, and the sheet is emptied when there are none. Tests can pass another `Preview` to `EditHistory` ([test/inlinePreview.ts](packages/overlay/src/test/inlinePreview.ts) writes inline styles, ignoring widths) to read what an edit did from `element.style`.

### Agent handoff ("Send to agent")

**The loop.** In any agent chat, `/pilot`:
1. The skill ([skills/pilot/SKILL.md](skills/pilot/SKILL.md)) has the agent find the dev server's URL and call `pilot_launch({ url })`. The hub registers the chat for that page's origin and tells the open page to launch Pilot.
2. The agent calls `pilot_wait_for_edits`. It returns a job when the designer presses Send, or "no edits yet" after a while (the agent calls it again). In Claude Code the call waits up to 25 minutes, and after 2 minutes Claude Code moves it to the background: the chat stays usable and the job arrives as the task's result. Other clients wait 50 seconds per call, under MCP's default 60-second request timeout (`waitMsFor()` in [mcp.ts](packages/cli/src/mcp.ts); `PILOT_WAIT_MS` overrides it). Progress notifications every 20 seconds keep the call under Claude Code's idle limit.
3. The job is `formatPrompt()`'s text plus its id and "call `pilot_done`". The agent applies it, calls `pilot_done({ jobId, notes })`, and waits again. If some changes didn't land, the same job comes back once as a **follow-up** (`followUp()` in [mcp.ts](packages/cli/src/mcp.ts)): each change with its element, the designer's value and what the page gives, the usual causes, and "if you chose a different value on purpose, keep it and say so in your notes".

**The hub** ([packages/cli](packages/cli)) is one per machine, on `127.0.0.1:4747` (`PILOT_PORT`). It lives in the first `usepilot mcp` process; later ones get `EADDRINUSE`, check `/health`, and talk to it over HTTP (`/agents/*`). When the hub's process ends (its chat closed), the next call of another agent fails to connect and that process takes over the port. State is in memory only: the page is the source of truth for its jobs and posts its unfinished ones again on every connect (idempotent by id), so a takeover loses nothing. Remote agents ping every 10 seconds and are dropped after 30 without one.
- **Follow-ups:** `POST /jobs/:id/retry` puts a done job back in the queue once (`attempt: 2`, with its `differences`), given first to the agent that did it if it's waiting (`Hub.retry()`).
- **Routing:** jobs are filed by page origin (`localhost`, `127.0.0.1` and `[::1]` count as the same, `originKey()`): an agent only gets jobs from the page it launched for. Two repos open at once stay separate.
- **Security:** the page's origin comes from the `Origin` header, never from the request; jobs are only accepted from an origin an agent registered, so another website can't hand prompts to the agent. The agent routes refuse any request with an `Origin` (browsers send one, Node doesn't).

**The page** ([packages/overlay/src/bridge](packages/overlay/src/bridge)): `BridgeClient` listens to Server-Sent Events (`agents`, `launch`, `job`) and reconnects every 2–5 seconds while the hub is away (so `/pilot` opens Pilot within seconds; `bridge: false` in `mountPilot` options turns it off). `PilotSession` (owned by `mountPilot`, like the history) runs Send, keeps the jobs (saved in `sessionStorage`, `pilot:jobs`), and checks done jobs.
- **Jobs in the history:** Send tags the changes not sent yet with the job's id (`EditHistory.send()`, saved with the history); Copy prompt still takes everything in effect. Sent changes stay previewed and aren't sent again; a newer change of the same property goes in the next job. Cancel un-tags them (`unsend()`). A settled change leaves the history for good, not as an undo step (`settle()`): undoing it would cover the real code with a stale preview.
- **Checking** ([edits/verify.ts](packages/overlay/src/edits/verify.ts)): for each change, the element's computed value with only the page's CSS against its computed value with the job's changes previewed (`EditHistory.probe()`, both in one task, so nothing flickers). So `1.5rem` or `pt-5` from the agent matches the designer's `20px`. It checks again on every stylesheet change in the head (hot reload; Pilot's own preview sheet is ignored, `isPageMutation()`) and every half second, for up to 15 seconds; what landed is settled at once. Changes for other widths than the window's, or on elements not on this page, can't be checked: they're settled on the agent's word. What still doesn't match after 15 seconds goes back to the agent once as a follow-up, and stays previewed meanwhile (the job reads as the agent applying). After the follow-up, Pilot accepts what the code gives: the job's previews go, whatever they show, so the page never stays in a state the designer has to sort out. An applied job leaves the list after 8 seconds (and on the next load). To get an exact value the agent didn't keep, edit it again and Send: a new job.
- **Toolbar:** Send when an agent works on this page, Copy prompt otherwise; the jobs button with how many are in progress. It opens the job list ([JobList](packages/overlay/src/ui/components/JobList/JobList.tsx)), which shows each job: waiting for an agent, an agent applying (a follow-up too), checking the page, applied, with the agent's notes, and Cancel while it's not done. The list has a placeholder look, pending its design.

## Installing Pilot in a project

In the app, dev only (see [packages/usepilot/README.md](packages/usepilot/README.md) for Vite, Next.js and others):

```bash
npm install -D usepilot
```

```ts
// app entry, dev only
if (import.meta.env.DEV) import("usepilot/auto");
```

Once per machine, for every project: the `/pilot` skill, and Pilot's MCP server registered with Claude Code (Cursor and others: the same command as an MCP server in their settings).

```bash
npx usepilot setup
```

```bash
claude mcp add --scope user pilot -- npx -y usepilot mcp
```

Then `/pilot` in any chat. `npx usepilot init` (planned) will add the dev import to the app by itself.

**Names:** Pilot is published as one package, `usepilot` (the plain `pilot` name on npm is an abandoned 2011 library from the Ace editor's authors). The npm organization `usepilot` reserves the `@usepilot/…` scope in case Pilot is ever split into several packages. The site will be `usepilot.design`. The workspace packages (`@pilot/overlay`, `@pilot/protocol`, `@pilot/cli`) are internal and never published under those names: the `usepilot` package will bundle them.

## Developing Pilot

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` starts the playground at http://localhost:5180 (not Vite's default 5173, which your other projects may use). Launch Pilot with Option+P (or the dashed **Simulate /pilot** button). Use the toolbar's Quit button to close it.

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

### Releasing `usepilot`

The published package is [packages/usepilot](packages/usepilot). Publishing builds it first (`prepack` runs the overlay build and copies `dist/` and the license in):

1. Bump the version in [packages/usepilot/package.json](packages/usepilot/package.json) (0.x for now: `0.1.1` for fixes, `0.2.0` for new features), or run `npm version patch --no-git-tag-version` there.
2. Publish, from that folder (it asks for your npm security key):

   ```bash
   cd packages/usepilot && npm publish
   ```

3. Commit the version bump.

npm can take a minute or two to show a new version. Users update with `npm install -D usepilot@latest`. A published version can't be changed or reused: fix forward with a new version. To try the package before publishing, `npm pack` makes the tarball, and a separate app installs it with `npm install -D <path to the .tgz>`.

### Styling

Pilot's styles are plain CSS. There's one file per component, and at build time they're combined into a single `<style>` injected into Pilot's Shadow DOM. Each component has its own folder, with its markup and CSS side by side:

```
packages/overlay/src/ui/
  App.tsx                    composes the UI
  fonts.ts                   registers Geist
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
    BoxAreas/                striped areas of the selection (padding or margin sides, or grid gaps being edited)
    GridOverlay/             grid lines and line numbers of a selected grid container
    PropertyRow/             shared: an editor row (label left, 128px value area right)
    PropertyLabel/           shared: the property name in an editor row
    PropertyInputText/       shared: the value control in an editor row (a text input)
    PropertySelect/          shared: the keyword control in an editor row (trigger + dropdown menu)
    Icon/                    shared: Pilot's icons (chevron-down, check in currentColor; layout icons in tokens)
    ScrubHandle/             shared: the drag-to-change wheel in a field
    ViewportWidth/           the top ruler and the window's width (on hover); sets the width chip
```

To add a component, create `components/<Name>/<Name>.tsx` and `<Name>.css`, then add one `@import` line to `styles/index.css`. Property editors will follow the same pattern under `src/editors/<name>/`.

| File | Purpose |
| --- | --- |
| [styles/index.css](packages/overlay/src/ui/styles/index.css) | Entry point. It declares the layer order and `@import`s every file. Add new component files here. |
| [styles/tokens.css](packages/overlay/src/ui/styles/tokens.css) | All design tokens as `--plt-*` custom properties, declared on `.root` (Pilot's container inside the Shadow DOM): color themes (light, plus dark via `prefers-color-scheme`), typography scale, spacing, radius, shadow, sizes, z-index. |
| [styles/base.css](packages/overlay/src/ui/styles/base.css) | Resets (cuts inheritance from the host page) and shared building blocks like `.surface`, the floating-panel look used by the toolbar and search. |
| `components/<Name>/<Name>.css` | That component's rules: [Toolbar](packages/overlay/src/ui/components/Toolbar/Toolbar.css), [PropertyDialog](packages/overlay/src/ui/components/PropertyDialog/PropertyDialog.css), [PropertySearch](packages/overlay/src/ui/components/PropertySearch/PropertySearch.css), [Highlight](packages/overlay/src/ui/components/Highlight/Highlight.css), [BoxAreas](packages/overlay/src/ui/components/BoxAreas/BoxAreas.css), [GridOverlay](packages/overlay/src/ui/components/GridOverlay/GridOverlay.css), [PropertyRow](packages/overlay/src/ui/components/PropertyRow/PropertyRow.css), [PropertyLabel](packages/overlay/src/ui/components/PropertyLabel/PropertyLabel.css), [PropertyInputText](packages/overlay/src/ui/components/PropertyInputText/PropertyInputText.css), [PropertySelect](packages/overlay/src/ui/components/PropertySelect/PropertySelect.css), [Icon](packages/overlay/src/ui/components/Icon/Icon.css), [ScrubHandle](packages/overlay/src/ui/components/ScrubHandle/ScrubHandle.css), [ViewportWidth](packages/overlay/src/ui/components/ViewportWidth/ViewportWidth.css). |

Conventions:

- **Tokens are owned by the project owner.** Agents ask before any edit to `tokens.css`. Tokens hold only the shared part of a value: `--plt-shadow-lg` is drop shadows only, and each component adds its own inset ring (the dialog and toolbar a 1px ring at 10%, the select menu a 7% top highlight plus a 5% ring).
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

Pilot's main font is **Geist** (variable, weights 100–900). It replaced Geist Mono, which made the UI read like code; Geist reads as UI text and fits more of a label in the row:

- **No network request.** The woff2 is vendored in [packages/overlay/src/assets/fonts](packages/overlay/src/assets/fonts) and inlined into the bundle as a data URL. There's no Google Fonts or CDN request. It comes from Vercel's `geist` npm package v1.9.2 (`dist/fonts/geist-sans`) under the SIL Open Font License, and the license file sits next to the font.
- **Registered from JavaScript, not CSS.** [ui/fonts.ts](packages/overlay/src/ui/fonts.ts) registers the font with the FontFace API (`document.fonts`). Browsers don't reliably apply `@font-face` rules declared inside a Shadow DOM, and this way Pilot doesn't have to add a `<style>` to the host page.
- **It has its own family name.** It's registered as `"PLT Geist"`, so it never collides with a Geist the host app loads, which might be a different version or subset.
- **OpenType features.** `--plt-font-features` holds them and is set to `normal`, Geist's defaults. Geist's figures are proportional and its zero isn't slashed, unlike Geist Mono's. (Its slashed zero, stylistic set `ss09`, has no tabular version, so the fields couldn't use it.) Value fields (`PropertyInputText`) switch to **tabular figures** (`font-variant-numeric: tabular-nums`), so every digit is as wide: values don't jitter while they change (stepping, dragging), and numbers line up across rows.

We decided against Tailwind for now. If we revisit it: Tailwind v4's `@property` rules are ignored inside a Shadow DOM, so shadow, ring and transform utilities need a workaround.

## Roadmap

**Foundation**
- [x] pnpm monorepo, TypeScript, Vite, Vitest
- [x] Overlay mounts in Shadow DOM, dormant until launched
- [x] `launch()` / Quit button, running state kept per tab (playground simulates `/pilot`)
- [x] Toolbar: select, Send (accent when there's something to send), the jobs button with its count, quit (designed)
- [x] `ChangeSet` model and `formatPrompt()`
- [x] Property search ranking
- [ ] Visual design: toolbar, property search, selection highlight

**Editing**
- [x] Element selection: the cursor button enters select mode, with a hover highlight and label, click to select (page clicks blocked), Esc to clear
- [x] Hover label: name (id, naming data attributes, form field name, tag; never classes or text) and size; none on the selection
- [ ] Component names in the label (React, Vue, Svelte, Angular dev info), before the id
- [ ] Selection actions in place of the selected element's name: select parent / first child, and the scope ("this element" / "all N like it")
- [x] Property dialog next to the selected element: its spot picked once per selection (right side, flips left), fixed while editing, moving with the page's scroll, staying on screen, picked again on window resize
- [x] Dialog = search field + the matching editors as you type: best matches plus their family, Tab across all of them
- [x] Footer with a contextual key hint (search vs. editing a property)
- [x] Keyboard loop: Tab/Enter from the search into the editor (focus picked from the alias), Enter back to the search, Tab between fields, Esc one level at a time
- [ ] Typing a letter in a fully selected value jumps back to the search (experiment)
- [x] `describeElement()`: unique selector, DOM path, text snippet
- [ ] Parent/child navigation for the selection (e.g. picking the wrapper instead of the text inside it)
- [x] **Declared values:** fields show the CSS that applies to the element from any source (stylesheets, Tailwind classes, the app's inline styles), not only Pilot's inline values. See **Declared values** under Property editors.
- [ ] **Set properties on an empty search:** with no query, the dialog lists the editors whose properties have a declared value, and typing filters them. This answers "which of these elements has a `max-width`?" without searching on each one.
- [x] **Viewport widths:** the viewport width on a ruler that shows when the top edge is hovered, the width chip (`from-1200 `, `to-767 `, click / Shift+click the width), and the widths per change in the history and the prompt
- [x] Preview from a stylesheet Pilot adds (`@layer` + `!important`, `@media` per width range) instead of inline styles, so changes for some widths show only in their range and resizing shows the truth
- [x] Read the page's breakpoints from its CSS (the `@media` widths in use) and show them on the ruler, clickable
- [ ] `from-md` in the search (breakpoint names, where the page exposes them)
- [x] Undo/redo for every property change (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y), with drags grouped into one step
- [x] Change set from the history (`buildChangeSet()`): per element, the page's own `from`, `to`, removals, widths; Copy prompt in the toolbar
- [x] Edits survive reloads: the history is saved per tab and restored, elements found again by selector (see **Edits survive reloads**)
- [x] Clear changes (toolbar, undoable) once the agent has applied the prompt; left out of the designed toolbar (the bridge clears what landed by itself; undo still removes changes)
- [x] With the bridge: clear a job when the agent calls `pilot_done`, after checking each change landed (the page's own CSS now gives the value); what didn't goes back to the agent once as a follow-up, then Pilot accepts the code
- [ ] First property editors (opacity, spacing, radius, color, typography…)
  - [x] **Margin: one value or each side** ([editors/margin](packages/overlay/src/editors/margin/MarginEditor.tsx)): the same split editor as padding below, on `margin` and `margin-top`…: Tailwind's `m`, `mt`/`mr`/`mb`/`ml`, `ms`/`me`, `mx`/`my` and the logical names (`margin-inline`, `margin-block-start`…) land the same way. Negative values and `auto` are allowed (`mx` + `auto` centers), and ↓ and drags go below 0. Fields show the margin area on the page.
  - [x] **Padding: one value or each side** ([editors/padding](packages/overlay/src/editors/padding/PaddingEditor.tsx), built on the shared split editor, [editors/split](packages/overlay/src/editors/split/SplitEditor.tsx): a shorthand as one value or split into its parts, configured with the parts' properties, icons, page areas and search words, and pairs of parts typed together. `sidesEditor({ … })` ([editors/sides](packages/overlay/src/editors/sides/sides.ts)) configures the four sides for padding and margin; gap configures row and column). One row, two views, switched with the **button at the right of the row** (it changes nothing on the page):
    - **One value:** a single field for every side. It takes one value, not the CSS shorthand's list (`12px 16px` isn't accepted), and writes the shorthand (`padding: 12px`). When the sides differ it's empty and reads "Mixed" (the field's `placeholder`), and a value typed there sets them all. Clearing it clears every side, as one undo step (each side a removal where the page's CSS sets it). The button shows the all-sides icon.
    - **Each side:** four fields stacked 8px apart (top, right, bottom, left), the label level with the first, each writing its own property. The button is as tall as the four fields, with a side icon level with each (`side-top`…, the accent bar on that side).
    - **Which view:** the search decides **as you type**, before Tab: editors get the live search text (`query` in `PropertyEditorProps`). A side or a pair shows each side right away, and Tab lands on it. `p` shows the one value. Anything else (`padding`, `pad`, or nothing typed) keeps the view, which opens on each side when the sides differ and on one value otherwise.
      - **A side:** `pt`/`pr`/`pb`/`pl`, `ps`/`pe` (Tailwind's inline start and end), `padding-top`…, or a logical name (`padding-inline-start`, `padding-block-end`…) lands on that side.
      - **A pair:** `px` or `padding-inline` lands on right, `py` or `padding-block` on top, and a value typed there sets both sides of the pair (one undo step), as long as focus stays on that field. The other field of the pair mirrors it (`onDraft`/`mirror`): Tab selects the value in both, so both read as about to change, and what's typed shows in both. A boxed field draws the mirrored selection over its text (`.mirror-selection`, the same highlight as `::selection`), since a page holds only one real selection.
      - Logical names assume horizontal, left-to-right text, as declared values do. They're found by the search because they're CSS property names for the same sides (the editor's `logical` config).
      - Tab goes through the sides, then on to the next editor. The button isn't a Tab stop: the search switches views from the keyboard.
    - **Fields:** `PropertyInputText` with a drag handle (`ScrubHandle`), so they accept what every Pilot field accepts and drag like gap (the drag logic is shared, `useScrub()` in [editors/length](packages/overlay/src/editors/length/useScrub.ts)). ↑/↓ and drags on an empty field start from the side's computed value. Clearing a side after setting the one value shows the page's own value for that side (`revert-layer` in the preview).
    - **On the page:** hovering or focusing a field stripes its padding: all four sides for the one value, one side for a side.
    - **The button's layout** is shared: `PropertyRow`'s `action` slot, a 24px control at the end of the value area, 8px after the fields. Its right edge lines up with the other rows' fields (16px from the dialog's edge), and the fields keep the value area's left edge, giving up the button's width and the gap (96px left). Other editors can use it. The view button has no background at rest; on hover it's drawn like a field at rest (`.field-box`'s fill and 1px top highlight). Keyboard focus shows the accent outline.
  - [x] **Size** ([editors/size](packages/overlay/src/editors/size/SizeEditor.tsx)): Tailwind's `size`, width and height as two rows (each a length editor with a drag handle). Only `size` finds it: width and height are its `embeds`, so `width` and `h` still find just their own editors. From the search (`size` + Tab or Enter), it lands on width with height linked, like `px` on padding: the value shows selected in both, what's typed shows in both, and Enter writes it to both as one undo step (`LengthLink`: the leading field writes to `also` and reports its draft, the other mirrors it). The link lasts while focus stays on width; arrows and drags change one row, and Tab goes width → height → the next editor.
  - [x] **Aspect ratio** ([editors/aspect-ratio](packages/overlay/src/editors/aspect-ratio/AspectRatioEditor.tsx)): a select with the common ratios, `auto`, `1 / 1`, `4 / 3`, `3 / 2`, `16 / 9`, `21 / 9` and their portrait versions `3 / 4`, `2 / 3`, `9 / 16`, plus `custom`. Custom adds a field next to the select (60px each, like grid-columns) with the placeholder `x/y`, and focus moves into it. It writes nothing until a ratio is typed: `4/5`, `4 / 5` and `4:5` all write `4 / 5`, and one number (`1.5`) is that ratio to 1 (the `ratio` kind in css/values.ts). A listed ratio set some other way (`16/9`, or `1` for `1 / 1`) shows as that option; any other shows as custom with its value in the field. "Select" clears it. Found by `aspect`, `aspect-ratio` and Tailwind's `aspect-auto`, `aspect-square`, `aspect-video`.
  - [x] **Flex direction** and **flex wrap** ([editors/flex](packages/overlay/src/editors/flex/FlexEditors.tsx)): keyword selects (`keywordEditor`), shown by display as flex rows and found on their own. flex-direction: row, row-reverse, column, column-reverse (Tailwind's `flex-row`, `flex-row-reverse`, `flex-col`, `flex-col-reverse`). flex-wrap: nowrap, wrap, wrap-reverse (`flex-wrap`, `flex-wrap-reverse`, `flex-nowrap`). `flex` alone still finds display. flex-wrap has an icon per value (in the icon variant of the select, like justify-content): `flex-nowrap` (three items running out of a frame open on the right) and `flex-wrap` (the third item on a second line) are designed; `flex-wrap-reverse` flips wrap; nothing set shows `layout-empty`. flex-direction has one too: `flex-row` and `flex-col` are designed (three items fading to 66% and 33% in the order they run, and an arrow at 50% along the main axis); `flex-row-reverse` and `flex-col-reverse` mirror them (items from the other end, the arrow pointing back).
  - [ ] **Border:** removed for now; a new component is being designed (the box diagram it used is gone too).
  - [x] Width, min-width, max-width ([editors/width](packages/overlay/src/editors/width)), and **height, min-height, max-height** ([editors/height](packages/overlay/src/editors/height/HeightEditor.tsx)), which work the same way (`h`, `min-h`, `max-h`; `min` shows min-width and min-height). Each field has a drag handle (`scrub: true`), like gap. All are built on the shared one-value [LengthEditor](packages/overlay/src/editors/length/LengthEditor.tsx): a label and one value (`PropertyInputText`). `min-w`/`max-w` are the aliases. The rest of this entry describes width, and the other two work the same way.
    - **Values:** shows the width set on the element, in full contrast. With none set, the field is empty. Typing `auto` makes it explicit, so it shows as a value. Accepts what every Pilot field accepts (see **CSS values** below): `120` (taken as px), `50%`, `8lh`, `auto`, `fit-content`, and math without `calc()` (`100% - 20px`). Invalid text is ignored.
    - **Reset:** delete the content and confirm (Enter, Tab or click away) and the field stays empty: the element doesn't set a width. If the page's CSS sets one, that's a removal for the agent, and the page previews what applies without it (see **Removing a value**). It's undoable like any change.
    - **Keys:** ↑/↓ step the number and keep its unit (`100%` → `101%`; keywords step from the computed px), with Shift for 10. From the search, `w`/`width` + Tab/Enter focuses the value. With a single field, Tab and Shift+Tab return to the search.
  - [x] **Display** ([editors/display](packages/overlay/src/editors/display/DisplayEditor.tsx)): a `display` select (block, inline-block, inline, flex, inline-flex, grid, inline-grid, contents, none). Tailwind's display utilities are its aliases (`grid`, `flex`, `block`, `hidden`…).
    - **Grid rows:** picking `grid` or `inline-grid` shows four more rows below: grid-columns, gap, justify-content and align-items, 8px apart like the dialog's editors. Each is an editor of its own (below), listed in display's `embeds`: display reads and writes their properties and shows them as rows. Each writes its own property, so each change is its own undo step, and undoing back past `grid` hides the rows again. The select shows the declared `display`, so an element that's a grid through its stylesheet shows `grid` and its grid rows.
    - **Keys:** Tab goes display → grid-columns (select, then its field) → gap → justify-content → align-items, then to the next editor. From the search, `display`/`grid` land on the display select.
    - **Flex rows:** picking `flex` or `inline-flex` shows five rows: flex-direction, flex-wrap, gap, justify-content and align-items (`FLEX_ROWS`). gap, justify-content and align-items are the same editors as in the grid rows. Like them, each row writes its own property and is an editor of its own, found on its own by the search. Tab goes through them in that order.
  - **Revealing properties.** Some properties, or values of them, bring others with them: `display: grid` shows the grid rows. Only the revealing property does that. The revealed editors are found on their own: searching `gap`, `grid-cols` or `items-center` shows just that editor, not display or the other grid rows. The revealing editor lists them in `embeds`, which the search doesn't look at. Display and position are both built with the shared `revealEditor({ property, options, rows })` ([editors/reveal](packages/overlay/src/editors/reveal/RevealEditor.tsx)): a select, plus the rows LIST_ORDER sets for its value, with Tab running through them.
  - [x] **Position** ([editors/position](packages/overlay/src/editors/position/PositionEditor.tsx)): a `position` select (static, relative, absolute, fixed, sticky; Tailwind's `relative`, `absolute`… are its aliases), with **inset** always shown as its row, set or not.
  - [x] **Inset** ([editors/inset](packages/overlay/src/editors/inset/InsetEditor.tsx)): one value (`inset`) or each side (`top`, `right`, `bottom`, `left`), a `sidesEditor` like padding and margin (`sideProperty` names the sides, which have no `inset-` prefix). Found on its own by `inset`, `top`/`right`/`bottom`/`left`, `inset-x`/`inset-y` (a pair) and `start`/`end` (Tailwind's inset-inline-start/end, so `start` and `end` now find inset before col-start and col-end). Negative values and `auto` are allowed. Its icons are the frame with an accent bar from a side to the center: `inset-top` is designed; `inset-right`, `inset-bottom`, `inset-left` rotate it, and `inset-all` (one value) puts all four bars together, all derived. Its fields don't show anything on the page yet (no inset area is designed).
  - **Presets plus custom:** `presetEditor({ property, presets, customLabel, placeholder })` ([editors/preset](packages/overlay/src/editors/preset/PresetEditor.tsx)) is a select with a few values and `custom`, which adds a field (60px each) for any other value. A value set some other way that means a preset (`16/9`, `1.0`) shows as that preset. Aspect-ratio, flex-grow and flex-shrink use it.
  - [x] **Flex grow, flex shrink, flex basis** ([editors/flex-item](packages/overlay/src/editors/flex-item/FlexItemEditors.tsx)): a flex item's share of the space, listed after order. grow and shrink are selects with `0`, `1` and `custom` (the shared `presetEditor`, below): custom adds a field for any other number, kind `number` (no unit, decimals allowed: `0.5`; never negative). basis is a field with a drag handle (`lengthEditor`, `scrub: true`): a length or a size keyword (`auto`, `content`, `fit-content`…). Found by their names and Tailwind's `grow`, `shrink`, `basis`.
  - [x] **Z-index** ([editors/z-index](packages/overlay/src/editors/z-index/ZIndexEditor.tsx)): a whole number, negatives too, or `auto` (kind `integer`), in a plain field. Found by `z-index` and Tailwind's `z`. ↑/↓ from `auto` start at 0.
  - [x] **Border radius** ([editors/border-radius](packages/overlay/src/editors/border-radius/BorderRadiusEditor.tsx)): one value for every corner (`border-radius`), a `lengthEditor` with a drag handle (`scrub: true`). A length or a percentage, never negative. Found by `border-radius`, `radius` and Tailwind's `rounded`. Listed in the Appearance group.
  - [x] **Visibility** ([editors/visibility](packages/overlay/src/editors/visibility/VisibilityEditor.tsx)): a keyword select (visible, hidden, collapse), found by `visibility` and Tailwind's `visible`, `invisible`, `collapse`.
  - [x] **Typography** ([editors/typography](packages/overlay/src/editors/typography/TypographyEditors.tsx)), the Typography group. font-size, line-height and letter-spacing have a drag handle (`scrub: true`); the others don't:
    - **font-family:** the font names as typed, case kept (`Georgia ,serif` → `Georgia, serif`), kind `font-family`. Not stepped. Tailwind's `font-sans`, `font-serif`, `font-mono`.
    - **font-size:** a length, a percentage or a size keyword (`small`, `larger`…). Tailwind's `text`.
    - **font-style:** a select (normal, italic, oblique). Tailwind's `italic`, `not-italic`.
    - **font-weight:** a `presetEditor` with 100–900 and custom, for a variable font's in-between weights (`450`) or a keyword (`bold`). Tailwind's `font-thin` … `font-black`.
    - **line-height:** kind `line-height`: a bare number stays unitless (`1.5`, not `1.5px`) and steps by tenths (Shift: 1); lengths and percentages step as usual. ↑ (and dragging) from nothing set starts at 1.2, about what `normal` is. Dragging moves a unitless value by 0.1 per pixel and stops at 0 like any drag (`stepSize`); em and rem by 0.1, other lengths by 1. Tailwind's `leading`.
    - **letter-spacing:** a length, negatives too, or `normal`. Tailwind's `tracking`.
    - `font` shows the four font-* editors; `size` still finds the size editor (width and height), not font-size.
  - [x] **Grid columns** ([editors/grid-columns](packages/overlay/src/editors/grid-columns/GridColumnsEditor.tsx), labeled `grid-columns`, writes `grid-template-columns`). Tailwind's `grid-cols` and the label `grid-columns` find it (and `cols`, a word of `grid-cols`). It's a mode select (`repeat`, `custom`, `subgrid`, `none`, see [ColumnsRow](packages/overlay/src/editors/grid-columns/ColumnsRow.tsx)), plus a field for the modes that take a value. With a field, the two are 60px each. Without one, the select fills the value area.
    - **repeat** (the default): a column count. With nothing declared (no stylesheet or inline value), the row shows repeat and `1`, CSS grid's own default (one column), without writing anything. Clearing the count goes back to it, and ↓ at the default writes nothing. `3` writes `grid-template-columns: repeat(3, minmax(0, 1fr))`, three equal columns that can shrink below their content, and the field shows `3` back. Only whole numbers from 1 are accepted. ↑/↓ add or remove a column.
    - **custom:** any CSS for `grid-template-columns` (`1fr 2fr`, `200px auto`…), checked by the browser. Switching to custom starts from the current value, so it can be edited.
    - **subgrid, none:** written as soon as they're picked. Picking repeat after them writes `repeat(1, minmax(0, 1fr))` explicitly, since it may need to override a stylesheet. There's no "Select" option (`clearable={false}`): repeat 1 is the default.
    - Picking custom writes nothing until a value is typed. The row remembers the mode until then, or until the value changes (an undo, for example). The mode is read back from the value: Pilot's own `repeat(n, minmax(0, 1fr))` is repeat, and anything else not `subgrid` or `none` is custom.
    - Tab goes from the select to its field, then on to the next row or editor.
  - [x] **Gap: one value or split** ([editors/gap](packages/overlay/src/editors/gap/GapEditor.tsx)): the same split editor as padding, with two parts: `row-gap` (the gap between rows) and `column-gap` (between columns). One value writes `gap`. Typing `gap-y` or `row-gap` splits right away and Tab lands on the row gap; `gap-x` or `column-gap` on the column gap (Tailwind's `gap-x` is column-gap). `gap` lands on the one value, as Tailwind's `gap-*` sets both, like `p` for padding: Tab goes there even when the gaps differ (it reads "Mixed"), and a typed value sets both. Each field has a drag handle, and ↑/↓ or a drag on an empty field start from 0 (`normal` isn't a length).
    - **Icons:** `gap-all` (four corner cells, contrast-high at 20%, with an accent bar across each gap), `gap-row` for gap-y (two full-width cells, the horizontal bar between them) and `gap-column` for gap-x (`gap-row` rotated), drawn with tokens in [Icon](packages/overlay/src/ui/components/Icon/Icon.tsx). `gap-all` and `gap-row` are designed; `gap-column` is derived.
    - **On the page:** while a field is hovered or focused, a grid's gaps are striped, on top of the selection highlight and grid lines instead of replacing them (inspect areas `{ box: "gap", axis }`, drawn by `BoxAreas` from the grid lines). The one value stripes both: row gaps are cut where column gaps cross them, so crossings aren't striped twice. The row-gap field stripes only the row gaps (full width), the column-gap field only the column gaps (`gapRects(grid, axes)`). **Flex containers** get the same stripes ([dom/flexGaps.ts](packages/overlay/src/dom/flexGaps.ts)): flex has no tracks, so the gaps come from where the items are. Items that overlap on the cross axis form a line. Between neighbors on a line, the main-axis gap (column-gap in a row, row-gap in a column) is striped as tall as the line. Between wrapped lines, the cross-axis gap is striped across the content box. Each stripe is the gap's own size, centered in the space between the items, which is wider than the gap when justify-content or align-content spread them.
    - **Values:** `row-gap` and `column-gap` also come from a `gap` shorthand the browser can't expand (`gap: var(--space)`, see `sourcesOf()` in dom/declared.ts).
    - **Search:** `col` also finds gap now, since `column-gap` is a property it writes (listed first, being earlier in the registry).
  - [x] **Order** ([editors/order](packages/overlay/src/editors/order/OrderEditor.tsx)): a plain field (no drag handle) for a whole number, negatives too. `order` finds it.
  - [x] **col-span, col-start, col-end** ([editors/grid-column](packages/overlay/src/editors/grid-column/GridColumnEditor.tsx)): where a grid item sits on the columns, named and labeled the Tailwind way. Plain fields, no drag handle. `col-span`, `col-start`, `col-end` find each, and `col` finds all three (`cols` is still grid-columns).
    - **col-span** writes the `grid-column` shorthand: `3` → `span 3 / span 3`, `full` → `1 / -1` (see the grid-span kind under **CSS values**). Its field shows `3` or `full`.
    - **col-start / col-end** write `grid-column-start` / `grid-column-end`: a line (`2`, `-1`), `span 2` or `auto`.
    - They share the item's `grid-column`, so the latest edit wins where they overlap: col-span sets both ends, so col-span after col-start replaces the start (and col-start then shows `span 3`, which is what CSS has). Set col-span first, then col-start, for "start at 2, span 3" (`2 / span 3`, still shown as `3` in col-span). Undo restores each end exactly.
  - [x] **Justify content** ([editors/justify](packages/overlay/src/editors/justify/JustifyContentEditor.tsx)) and **align items** ([editors/align](packages/overlay/src/editors/align/AlignItemsEditor.tsx)): keyword selects in the icon variant, both built with the shared `keywordEditor({ property, options, icons })` ([editors/keyword](packages/overlay/src/editors/keyword/KeywordEditor.tsx)).
    - **justify-content:** start, end, center, space-between, space-around, space-evenly. Tailwind's `justify-start`, `justify-between`… find it, and so does `justify`, the start of its label.
    - **align-items:** start, center, end, stretch, baseline. Tailwind's `items-center`… find it, and so does `items`, a word of its label.
    - **Icons** (12px): a square frame (`--plt-color-contrast-high` at 20%) and accent items (`--plt-color-accent`) sitting flush on its edges. justify-start is designed, and the other justify icons move its two items along the row. The align icons are designed too: a short item and a tall one, side by side, at the top, middle or bottom; both full height for stretch; and for baseline, their bottoms on one line. With nothing set, both show the designed no-value icon, the frame crossed out at 20% (`layout-empty`). A value set some other way (`flex-start`, `normal`) still shows, without an icon.
- [ ] Change list in the panel (review and undo before handoff)
- [ ] Designer note field
- [ ] **Design tokens** (planned, design in [docs/design-tokens.md](docs/design-tokens.md)): read the page's CSS custom properties live (colors, type scale, spacing), offer them in fields, step and drag along the scale, and give the agent token names. Tokens that only live in code come later, watched by the bridge.

**Handoff**
- [x] Copy prompt: the toolbar's middle button copies the change set as a prompt
- [x] Launch shortcut (Option+P / Alt+P) until `/pilot` exists
- [x] `usepilot mcp`: MCP server and localhost hub in one process; several agents share one hub, with takeover
- [ ] The bridge watches token files that only live in code (Tailwind v3 config, `tokens.json`, Style Dictionary) and pushes them to the overlay live (see [docs/design-tokens.md](docs/design-tokens.md))
- [x] `pilot_launch`, `pilot_wait_for_edits`, `pilot_done` and the `/pilot` skill flow (including launching Pilot from the agent)
- [x] Send to agent through the bridge, as jobs: queued while the agent works, routed by page origin
- [ ] Design the Send states and the job list (placeholder look now)
- [ ] Cursor: a `/pilot` command file next to the MCP server (the server works there already)

**Distribution**
- [ ] `npx usepilot init` (detect framework entry, add the dev import, register MCP and skill)
- [x] Pick the name: `usepilot` on npm (package and organization), `usepilot.design` for the site
- [x] Claim `usepilot` on npm (`0.0.1`, published)
- [x] `usepilot` 0.1.0: the overlay bundled, installable in Vite and Next.js apps (tested in a separate Vite app from the packed tarball)
- [x] Publish `usepilot` 0.1.0 and 0.2.0
- [x] Add the CLI (`mcp`, `setup`) to `usepilot`

## Open questions

- Which property editors ship in v1, and how should related properties be grouped?
- Should Pilot handle hover and focus states (edit in a pseudo-state)? Widths are handled by the width chip (see **Viewport widths**).
- How should multi-element edits work (e.g. "all cards")?
- Values typed in the search (`pt-4` + Enter, Tailwind-style) are deliberately left out for now: the search only finds properties. Revisit once more editors exist.
- Should the toolbar be draggable, or have a fixed position (bottom center for now)?
- After a click selects an element, should select mode stay on (current behavior) or switch off so the page is interactive again?

## License

[FSL-1.1-MIT](LICENSE.md) (Functional Source License, MIT Future License). The code is public and free to use, modify and share, including at work, for anything except a competing commercial product or service built from it. Each version becomes MIT two years after it's released. The packages declare it in their `license` field.

