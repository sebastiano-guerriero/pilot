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
     - A click selects the element. Pilot catches the click, so the page's own handlers and links don't fire. The selected element gets an outline with a round 4px accent handle on each corner. While another element is hovered, the selection's name and size label is hidden, so only the hovered element's label shows and the two never overlap.
     - **Grid containers** also show their grid lines: on hover, just the lines; once selected, numbered too ([GridOverlay](packages/overlay/src/ui/components/GridOverlay/GridOverlay.tsx)): 1px dashed accent lines across the content box, numbered like CSS numbers them (1 at the start edge), with columns numbered just below the content box and rows to its left. Between tracks with a gap, both edges of the gap are drawn and the number sits in the middle. Lines that sit on the element's outline (the outer lines, when there's no padding or border) aren't drawn, since they'd only double it. Their numbers stay. The first and last column numbers align to the box's edges (inward). The first and last row numbers sit just outside the top and bottom lines (outward), so they never overlap each other, even in a row shorter than two badges, nor the column numbers at a corner. The numbers are drawn above everything else (the grid lines, the selection outline and its corner dots, the stripes), so nothing covers them. The lines stay while editing, except while a padding, border or margin row is in use (they hide with the selection, see `hidesSelection()`). While the gap field is hovered or focused, the gaps are striped on top of them (see **Gap**). The lines come from the computed track sizes ([dom/gridLines.ts](packages/overlay/src/dom/gridLines.ts)), which include implicit tracks. `justify-content`/`align-content` `center` and `end` are accounted for, while the `space-*` values are drawn from the start edge. This is a page overlay, so computed values are fine here: the "no computed values" rule is about fields.
     - **Grid items** show their parent's grid when selected: the lines and numbers they're placed on, for col-span, col-start and col-end (`orParent` on `GridOverlay`). An element that's a grid itself shows its own.
     - Select mode stays on, so you can click another element to switch to it. **Esc** clears the selection. With nothing selected, **Esc** turns the select tool off.
     - Clicking the cursor again turns select mode off. The selection is cleared and the page behaves normally again.
   - **Send:** sends the collected edits to the agent.
   - **Quit:** closes Pilot.
3. **Search.** Selecting an element opens the property dialog next to it. At first the dialog holds only the search field. **The search carries over** from one selection to the next: set col-span on one card, click the next, and the col-span editor is already there. The carried-over query is selected, so Tab/Enter goes into its editor and typing replaces it. It starts empty again once nothing is selected (Esc, the cursor turned off, the dialog closed). Type a property (`opacity`, `padding`, `radius`…) and the dialog adds the matching editors below the search: the best match plus its family. `w` shows width, min-width and max-width, while `min-w` shows just min-width (see *Finding properties* below).
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

**Removing a value.** Clearing a field means "this element doesn't set this property", which is not the same as `0` or `none`. When the page's own CSS sets it (a stylesheet rule, a Tailwind class, the app's own `style` attribute), Pilot records a **removal** ([edits/clear.ts](packages/overlay/src/edits/clear.ts)): the change is `{ property, from, to: "", removed: true, source }`, where `source` says where the page declares it, the element's `style` attribute or a rule's selector, with how many elements on the page that selector matches (`StyleSource`). `formatPrompt()` marks the row *removed* and spells it out for the agent: stop declaring it for this element, so it gets what the cascade gives without it; and for a rule other elements share, remove it for this element only unless the designer's note says otherwise. While editing:
- **The field is empty**, the Pilot way of saying no value is set.
- **The page previews the fallback**: the next declaration in the cascade (`declaredWithout()` in [dom/declared.ts](packages/overlay/src/dom/declared.ts) leaves the removed rule out), or `revert` when no other rule declares it. `revert` falls back to the browser's own styles (a list's padding, a heading's margins), which Pilot can't read from the stylesheets, and otherwise to the inherited value or the default. `unset` would skip the browser's styles and show a wrong preview. The fallback is only for the preview: the agent gets "don't declare it here" and the removed value (to find the declaration), never the fallback, which the cascade will give anyway. Over an `!important` rule the preview is `!important` too. A value from the app's own `style` attribute is simply removed from it, so the stylesheets show through.
- When only Pilot set the value, clearing just drops Pilot's edit: there's nothing to remove.
- The page's own value is what it was before Pilot touched it (`EditHistory.originalInline()`), so setting `20px` over a stylesheet's `16px` and then clearing removes the `16px`.
- It's undoable like any change, and typing a value afterwards replaces the removal (`EditHistory.removalOf()`).

Once the agent has applied the change set, the page's CSS no longer sets the property, and the field is empty for the same reason it shows now.

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

Each editor lives in its own folder, `src/editors/<name>/`, with its `.tsx` and `.css` side by side. It's registered in [packages/overlay/src/editors/registry.ts](packages/overlay/src/editors/registry.ts), and its CSS is imported in `ui/styles/index.css`. `searchEditors()` ranks them, best first: an exact **alias**, then an exact label or property name, then a prefix (`pad`), then a substring or keyword. Aliases borrow Tailwind's utility names, so a designer who knows them gets there in a keystroke or two. Padding is four rows (`padding-top`, `-right`, `-bottom`, `-left`), each carrying the Tailwind aliases that include it: `p`, `pad` and `padding` show all four, `px` right and left, `py` top and bottom, and `pt`/`pr`/`pb`/`pl` just one. No extra logic was needed: equal matches show together.

**Finding properties** (`matchEditors()` in the registry). Hyphens and spaces are ignored on both sides, so `minw`, `min w`, `min-w` and `minwidth` are the same query, and `paddingtop` finds padding-top. **Abbreviations** work too: when nothing better matches, a query whose letters appear in order in a property name, starting at a word start, finds it (`wdt` → width, `mxw` → max-width, `pdg` → the padding rows). Requiring a word start keeps the matches sensible (`dt` won't match width through its middle letters). Starting at a later word (the "width" in `min-width` or `border-top-width`) counts as one more skipped letter, so `wdt` prefers width itself. Ranked last, these never override an alias, name, prefix or substring. Among several, the one skipping the fewest letters wins, then the shortest name. Swapped letters (`widht`) aren't handled yet. The dialog shows:

- **every editor tied for the best match**, if that match is a prefix or better (`p` → the four padding rows; once height exists, `min` → min-width *and* min-height), or an abbreviation skipping the same number of letters (`pdg` → the four padding rows). A substring-only best match shows just the top editor, so a single letter doesn't flood the dialog. Tied editors keep the registry's order (padding: top, right, bottom, left);
- **plus the family** of each editor shown. Editors can declare a `family`: min-width and max-width belong to `width`. A query that lands on the family's main editor brings the whole family, main one first (`w`, `wid`, `width` → width, min-width, max-width). A query that lands on a member shows only that member (`min-w`, `min`, `max-width` → just that one);
- at most 4 editors.

The dialog renders each matched editor inside its own `.editor` wrapper. It passes the element's computed values for the editor's `properties` (`values`, only for steps and drags), their declared values (`declared`, what fields show), and `onChange` applies the new value. For the keyboard loop, editors also get `focusRequest`: a new object, `{ query }`, each time the designer tabs or enters in from the search, so the editor can focus the part the query names (`pt` → top). They call `onReturnToSearch()` when a value is done (Enter), and `onTabOut(direction)` when Tab moves past their last field (or Shift+Tab before their first). The dialog then focuses the next/previous editor with `focusRequest.edge` set to `"first"`/`"last"`, or returns to the search past either end. Esc is handled by the dialog. `onHint(content | null)` replaces the footer message while something editor-specific is going on, such as a drag. `onInspect(areas | null)` shows parts of the element's box model on the page, such as `[{ box: "padding", side: "top" }]` or a grid's gaps (`[{ box: "gap" }]`). **Whether an area hides the selection highlight depends on the property** (`hidesSelection()` in `dom/boxModel.ts`). Padding, border and margin hide the outline, corner dots and label, and a grid's lines and numbers, while you interact with their editor, since the outline sits right on top of them and would hide the change happening live. The gap is inside the element, so its stripes are drawn along with the highlight. Each new kind of area decides this in one place. `onRevert(property, gesture)` takes back what an ongoing gesture did to one property, restoring its exact earlier value instead of re-applying an old number, which would leave a fake edit in the change set.

**Shared editor parts.** `PropertyRow` lays out a one-row editor: the property name (`PropertyLabel`) on the left, and a **128px value area** on the right. The dialog is 260px wide, so with its 16px side padding and the 8px gap, labels get 92px: enough for `padding-bottom` (83px in Geist), the longest so far. Fields in the value area share it equally, with an 8px gap: one field is 128px, two are 60px each. It's a grid of equal columns (`minmax(0, 1fr)`), so each field's own padding doesn't change its share. `PropertyInputText` is the value control: a real `<input type="text">` drawn as a **24px box** that fills its slot, with a 6px radius, a `--plt-color-background-light` fill and a 1px top highlight (`inset 0 1px 0`, white at 7%). The box is the shared `.field-box` class in `base.css`, so every value control (this and `PropertySelect`) looks the same. At rest its fill is at 90% opacity. On `:focus-visible` it becomes solid and gains a 1px inner ring (white at 7%) on top of the highlight. Text fields match `:focus-visible` whenever they're focused, and the select's trigger only when focused from the keyboard. Text is left-aligned with 6px inline padding. It works like every Pilot value: the first click selects all, Enter commits and returns to the search, Esc discards, ↑/↓ ask the editor for a step (×10 with Shift), and after an undo it shows the restored value. **With no value set, the box is empty**, with no placeholder: the box itself shows there's a field to type into. **Fields show declared values, never computed ones:** a field shows the CSS that applies to the element from any source, as written (`50%`, `var(--space-4)`), or nothing when nothing declares it (see **Declared values** below). Pilot is for writing CSS, not for inspecting what the browser computed. Computed values are only used behind the scenes, as where ↑/↓ and drags start from. Committing an empty field means "not set", and editors pass `""` to `onChange`. The dialog turns that into a removal when the page's CSS sets the property (see **Removing a value**), or just drops Pilot's inline value otherwise. Editors only decide what a typed value or a step means. Values too long for the field end with an **ellipsis** (`text-overflow`) until it's focused, so you can tell there's more. The **`compact`** variant is the box diagram's: no box, 16px tall, right-aligned, sized to its text with `field-sizing: content` (falling back to a width in `ch`, exact since the font is monospaced), up to 128px or the container's `--_max-width`, with 4px inline padding. With no value, it shows a dimmed dash, `—` (`NOT_SET`, in `--plt-color-contrast-low`), since a field without a box needs something to click. The dash isn't a CSS keyword, so it can't be mistaken for a value. For linked fields (padding's `px` in the diagram), a field can report its draft (`onDraft`) and show another field's (`mirror`), meaning its text once typed and its selection drawn as `data-mirror-selected`. A focused, empty compact field counts as selected until you type: its placeholder gets the selection highlight (`data-placeholder-selected`), since typing replaces it, and linked fields mirror that. So `m` ⇥ highlights all four margins even when none is set.

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

**CSS property database** ([src/css/properties.ts](packages/overlay/src/css/properties.ts)): per property, its initial value, its keywords, whether negatives are valid, and its kind of value (length by default). It currently covers `width`, `min-width` (default `auto`), `max-width` (default `none`), and the four sides of `padding-*` (`0`), `margin-*` (`0`, negatives and `auto` allowed) `border-*-width` (`medium`, plus `thin`/`medium`/`thick`), `display` (its keywords are the select's options, `DISPLAY_VALUES`), `grid-template-columns` (`none`), `gap` (`normal`) `justify-content` and `align-items` (`normal`, options in `JUSTIFY_CONTENT_VALUES` and `ALIGN_ITEMS_VALUES`), `order` (`0`, integer), `grid-column` (`auto`, grid-span) and `grid-column-start`/`-end` (`auto`, grid-line). Add an entry whenever an editor starts writing a new property.

**Declared values** ([src/dom/declared.ts](packages/overlay/src/dom/declared.ts)): what fields show. For each of an editor's `properties`, the dialog passes `declared`: the winning declaration from any source, meaning the page's stylesheets, Tailwind classes, the app's inline styles and Pilot's own edits. Editors read it with `declaredOf(props, property)` ([editors/declared.ts](packages/overlay/src/editors/declared.ts)). How it's found:
- **Matching rules.** It walks the stylesheets of the element's root (the document or a shadow root, including adopted sheets) in document order, following `@import`. It keeps style rules whose selector matches the element (`element.matches`) and whose conditions hold: `@media` via `matchMedia`, `@supports` via `CSS.supports`, `@scope`'s start. Nested rules are resolved (`&`, and descendants of the parent selector).
- **The cascade.** `!important` beats normal. Then inline styles beat rules. Then `@layer` order: later layers and unlayered styles win normal declarations, the order flips for important ones, and styles directly in a layer beat its sub-layers. Then specificity (`:is`/`:not`/`:has` take their most specific argument, `:where` counts nothing), then order of appearance.
- **Shorthands and logical properties.** A side also comes from its logical longhand (`padding-inline-start`), the logical pair (`padding-inline`, which Tailwind's `px-4` writes) and the shorthand (`padding: 10px 18px`), assuming horizontal, left-to-right text. CSSOM can't expand a shorthand containing `var()`, so its text is split by hand: `calc(var(--spacing) * 4)` applies to every side.
- **Cost.** One walk is shared by all the editors in a render (cached for the rest of the task, and refreshed if the stylesheets or the element's classes change). It runs about 3ms per thousand rules.
- **Known gaps.** `@container` conditions can't be evaluated from script, so those rules are skipped. `@scope`'s end bound is ignored. Cross-origin stylesheets can't be read. The browser's own (user-agent) styles aren't visible, so a `<ul>`'s default padding counts as nothing declared. And since Pilot writes inline styles, a stylesheet `!important` still wins over its edits.
- **Clearing a field** removes Pilot's inline value, so the field shows the stylesheet's value again if there is one. Pilot can't remove a stylesheet declaration itself; that's the agent's job at handoff.

**Every property change goes through the edit history** ([src/edits/history.ts](packages/overlay/src/edits/history.ts)). Editors never write `element.style` themselves; they call `onChange(property, value, { gesture })`. The history then:

- sets the value as an inline style and records the inline value it replaced, so undo restores it exactly (or removes the property if there was none). For a **shorthand** it records every longhand it sets (`grid-column` → `grid-column-start`, `grid-column-end`, found by `longhandsOf()`), so undoing col-span brings back a col-start that was set on its own before,
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
    BoxAreas/                striped areas of the selection (padding, border, margin sides, or grid gaps being edited)
    GridOverlay/             grid lines and line numbers of a selected grid container
    PropertyRow/             shared: an editor row (label left, 128px value area right)
    PropertyLabel/           shared: the property name in an editor row
    PropertyInputText/       shared: the value control in an editor row (a text input)
    PropertySelect/          shared: the keyword control in an editor row (trigger + dropdown menu)
    Icon/                    shared: Pilot's icons (chevron-down, check in currentColor; layout icons in tokens)
    ScrubHandle/             shared: the drag-to-change wheel in a field
```

To add a component, create `components/<Name>/<Name>.tsx` and `<Name>.css`, then add one `@import` line to `styles/index.css`. Property editors will follow the same pattern under `src/editors/<name>/`.

| File | Purpose |
| --- | --- |
| [styles/index.css](packages/overlay/src/ui/styles/index.css) | Entry point. It declares the layer order and `@import`s every file. Add new component files here. |
| [styles/tokens.css](packages/overlay/src/ui/styles/tokens.css) | All design tokens as `--plt-*` custom properties, declared on `.root` (Pilot's container inside the Shadow DOM): color themes (light, plus dark via `prefers-color-scheme`), typography scale, spacing, radius, shadow, sizes, z-index. |
| [styles/base.css](packages/overlay/src/ui/styles/base.css) | Resets (cuts inheritance from the host page) and shared building blocks like `.surface`, the floating-panel look used by the toolbar and search. |
| `components/<Name>/<Name>.css` | That component's rules: [Toolbar](packages/overlay/src/ui/components/Toolbar/Toolbar.css), [PropertyDialog](packages/overlay/src/ui/components/PropertyDialog/PropertyDialog.css), [PropertySearch](packages/overlay/src/ui/components/PropertySearch/PropertySearch.css), [Highlight](packages/overlay/src/ui/components/Highlight/Highlight.css), [BoxAreas](packages/overlay/src/ui/components/BoxAreas/BoxAreas.css), [GridOverlay](packages/overlay/src/ui/components/GridOverlay/GridOverlay.css), [PropertyRow](packages/overlay/src/ui/components/PropertyRow/PropertyRow.css), [PropertyLabel](packages/overlay/src/ui/components/PropertyLabel/PropertyLabel.css), [PropertyInputText](packages/overlay/src/ui/components/PropertyInputText/PropertyInputText.css), [PropertySelect](packages/overlay/src/ui/components/PropertySelect/PropertySelect.css), [Icon](packages/overlay/src/ui/components/Icon/Icon.css), [ScrubHandle](packages/overlay/src/ui/components/ScrubHandle/ScrubHandle.css). |

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
- **OpenType features.** `--plt-font-features` holds them and is set to `normal`, Geist's defaults. Geist's figures are proportional and its zero isn't slashed, unlike Geist Mono's. Value fields (`PropertyInputText`) switch to **tabular figures** (`font-variant-numeric: tabular-nums`), so every digit is as wide: values don't jitter while they change (stepping, dragging), and numbers line up across rows.

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
- [x] **Declared values:** fields show the CSS that applies to the element from any source (stylesheets, Tailwind classes, the app's inline styles), not only Pilot's inline values. See **Declared values** under Property editors.
- [ ] **Set properties on an empty search:** with no query, the dialog lists the editors whose properties have a declared value, and typing filters them. This answers "which of these elements has a `max-width`?" without searching on each one.
- [x] Undo/redo for every property change (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y), with drags grouped into one step
- [ ] Inline-style preview engine: track `from → to` per element for the change set, revert per property/element
- [ ] Keep pending edits across page reloads. Today a reload (including the dev server's full reloads) drops every preview edit and the undo history, because they only live in the page's DOM and memory.
- [ ] First property editors (opacity, spacing, radius, color, typography…)
  - [x] **Padding as four rows** ([editors/padding](packages/overlay/src/editors/padding/PaddingEditor.tsx)): `padding-top`, `padding-right`, `padding-bottom` and `padding-left`, each a `lengthEditor` like width (a `PropertyLabel` and a `PropertyInputText`), so they behave the same: units, math, smart parentheses, ↑/↓, reset by clearing, Tab across rows.
    - **Values:** like every field, a row shows the declared value (the button's stylesheet `padding: 10px 18px` shows as `10px`/`18px`), or an empty field when nothing declares one.
    - **On the page:** hovering or focusing a row stripes that side's padding (the `inspect` option). The dialog combines what each shown editor asks for, so moving between rows always shows the right side.
    - **Not carried over from the diagram yet:** drag-to-scrub (the rows could opt into `ScrubHandle`), and `px`/`p` setting several sides with one value. Each row is independent for now.
  - [x] **Box editors (margin, border width)** ([editors/box/BoxEditor.tsx](packages/overlay/src/editors/box/BoxEditor.tsx)). Padding used the box diagram before moving to rows, and margin and border still do until we decide their layout. It's one component, configured per property group: the CSS property for each side, Tailwind aliases, the title, the page area to show, and optionally a property the value depends on. Each group is a small definition: [margin](packages/overlay/src/editors/margin/MarginEditor.tsx), [border](packages/overlay/src/editors/border/BorderEditor.tsx).
    - **Layout:** a row with the name as a `PropertyLabel` on the left and the diagram on the right. The diagram is 128×72, with a 48×24 center standing for the element. Each side is a trapezoid between the center and the edge, highlighted on hover. Each value is a compact `PropertyInputText` centered in its band: 16px tall, sized to its content, up to 4 characters on the left/right sides (`4ch` + padding ≈ 34px, inside the 40px bands) and 80px on top/bottom (24px bands), with an ellipsis when it doesn't fit.
    - **Values:** a declared value shows at full contrast, without `px` (`12`, `1.5rem`). With none, the side shows the dimmed dash, also while you delete a value, so it never repeats the deleted one. Values can be selected and mirrored like any text. A side accepts what every field accepts (`12` as px, units, keywords, math). Clearing it removes Pilot's inline value.
    - **Type:** click the value (text cursor) or anywhere else on a side. The first click selects all. Type, then press Enter.
    - **Arrow keys:** ↑/↓ change the value by 1, or 10 with Shift, keeping the unit.
    - **Drag:** drag over a side, outside its value, to scrub. Dragging outward from the label increases the value: up for top, right for right, and so on. Padding and border never go below 0. Margin can go negative. **Hold Alt while dragging** to change the opposite side too, or **Shift** for all four sides. Shift wins if both are held, either key can be pressed or released mid-drag, and a side that drops out is reverted to exactly what it was. Alt is shown before it's needed: on a side's drag area (the ↕/↔ cursor), the footer says "Hold **Alt** to change both sides". Holding Alt lights up the opposite side (`data-paired`), and the footer says "Drag to change top and bottom" without applying anything. Shift lights up the other three sides ("Drag to change all sides"). During the drag, the footer says "Changing top and bottom".
    - **On the page:** while a side is hovered or dragged, the selection outline and corner dots are replaced by the element's actual area (padding inside the border, the border itself, or margin outside it) for every affected side. It's drawn in the accent at 30% with 1px diagonal stripes, follows the values live, and carries `data-box` for styling.
    - **From the search:** the per-side alias (`pt`, `mr`, `border-b`…) or property name focuses that side. The axis aliases (`px`/`py`, `mx`/`my`, `border-x`/`border-y`) and the all-sides alias (`p`, `m`, `border`) link sides (`data-linked`), and the editor's name focuses top. Linked sides keep their own values until you type, then mirror the typed text. While the value is fully selected, they also show the selection highlight. Enter or Tab applies to all linked sides as one undo step. A link lasts only while focus stays in the editor: leaving it any way (Esc, Enter, a click elsewhere) ends the link, so a later click on one side edits just that side.
    - **Border needs a style:** a width does nothing while the side's `border-style` is `none` (the default). Setting a width on such a side also sets `border-{side}-style: solid` in the same undo step. Clearing that width later removes the style Pilot added, and an existing style is left alone.
  - [x] Width, min-width, max-width ([editors/width](packages/overlay/src/editors/width)), built on the shared one-value [LengthEditor](packages/overlay/src/editors/length/LengthEditor.tsx): a label and one value (`PropertyInputText`). `min-w`/`max-w` are the aliases. The rest of this entry describes width, and the other two work the same way.
    - **Values:** shows the width set on the element, in full contrast. With none set, the field is empty. Typing `auto` makes it explicit, so it shows as a value. Accepts what every Pilot field accepts (see **CSS values** below): `120` (taken as px), `50%`, `8lh`, `auto`, `fit-content`, and math without `calc()` (`100% - 20px`). Invalid text is ignored.
    - **Reset:** delete the content and confirm (Enter, Tab or click away) and the field stays empty: the element doesn't set a width. If the page's CSS sets one, that's a removal for the agent, and the page previews what applies without it (see **Removing a value**). It's undoable like any change.
    - **Keys:** ↑/↓ step the number and keep its unit (`100%` → `101%`; keywords step from the computed px), with Shift for 10. From the search, `w`/`width` + Tab/Enter focuses the value. With a single field, Tab and Shift+Tab return to the search.
  - [x] **Display** ([editors/display](packages/overlay/src/editors/display/DisplayEditor.tsx)): a `display` select (block, inline-block, inline, flex, inline-flex, grid, inline-grid, contents, none). Tailwind's display utilities are its aliases (`grid`, `flex`, `block`, `hidden`…).
    - **Grid rows:** picking `grid` or `inline-grid` shows four more rows below: grid-columns, gap, justify-content and align-items, 8px apart like the dialog's editors. Each is an editor of its own (below), listed in display's `embeds`: display reads and writes their properties and shows them as rows. Each writes its own property, so each change is its own undo step, and undoing back past `grid` hides the rows again. The select shows the declared `display`, so an element that's a grid through its stylesheet shows `grid` and its grid rows.
    - **Keys:** Tab goes display → grid-columns (select, then its field) → gap → justify-content → align-items, then to the next editor. From the search, `display`/`grid` land on the display select.
  - **Revealing properties.** Some properties, or values of them, bring others with them: `display: grid` shows the grid rows. Only the revealing property does that. The revealed editors are found on their own: searching `gap`, `cols` or `items` shows just that editor, not display or the other grid rows. The revealing editor lists them in `embeds`, which the search doesn't look at.
  - [x] **Grid columns** ([editors/grid-columns](packages/overlay/src/editors/grid-columns/GridColumnsEditor.tsx), labeled `grid-columns`, writes `grid-template-columns`). Tailwind's `cols`, `grid-cols` and `grid-columns` find it. It's a mode select (`repeat`, `custom`, `subgrid`, `none`, see [ColumnsRow](packages/overlay/src/editors/grid-columns/ColumnsRow.tsx)), plus a field for the modes that take a value. With a field, the two are 60px each. Without one, the select fills the value area.
    - **repeat** (the default): a column count. With nothing declared (no stylesheet or inline value), the row shows repeat and `1`, CSS grid's own default (one column), without writing anything. Clearing the count goes back to it, and ↓ at the default writes nothing. `3` writes `grid-template-columns: repeat(3, minmax(0, 1fr))`, three equal columns that can shrink below their content, and the field shows `3` back. Only whole numbers from 1 are accepted. ↑/↓ add or remove a column.
    - **custom:** any CSS for `grid-template-columns` (`1fr 2fr`, `200px auto`…), checked by the browser. Switching to custom starts from the current value, so it can be edited.
    - **subgrid, none:** written as soon as they're picked. Picking repeat after them writes `repeat(1, minmax(0, 1fr))` explicitly, since it may need to override a stylesheet. There's no "Select" option (`clearable={false}`): repeat 1 is the default.
    - Picking custom writes nothing until a value is typed. The row remembers the mode until then, or until the value changes (an undo, for example). The mode is read back from the value: Pilot's own `repeat(n, minmax(0, 1fr))` is repeat, and anything else not `subgrid` or `none` is custom.
    - Tab goes from the select to its field, then on to the next row or editor.
  - [x] **Gap** ([editors/gap](packages/overlay/src/editors/gap/GapEditor.tsx)): a length field like width (`16` → `16px`, units, math). ↑/↓ on an empty field start from 0. It has a drag handle (`ScrubHandle`): drag up or down to change the gap. While the row is hovered or focused, a grid's gaps are striped on the page, like padding sides are, but on top of the selection highlight and grid lines instead of replacing them (an inspect area `{ box: "gap" }`, drawn by `BoxAreas` from the grid lines). Row gaps are cut where column gaps cross them, so crossings aren't striped twice.
  - [x] **Order** ([editors/order](packages/overlay/src/editors/order/OrderEditor.tsx)): a plain field (no drag handle) for a whole number, negatives too. `order` finds it.
  - [x] **col-span, col-start, col-end** ([editors/grid-column](packages/overlay/src/editors/grid-column/GridColumnEditor.tsx)): where a grid item sits on the columns, named and labeled the Tailwind way. Plain fields, no drag handle. `col-span`, `col-start`, `col-end` find each, and `col` finds all three (`cols` is still grid-columns).
    - **col-span** writes the `grid-column` shorthand: `3` → `span 3 / span 3`, `full` → `1 / -1` (see the grid-span kind under **CSS values**). Its field shows `3` or `full`.
    - **col-start / col-end** write `grid-column-start` / `grid-column-end`: a line (`2`, `-1`), `span 2` or `auto`.
    - They share the item's `grid-column`, so the latest edit wins where they overlap: col-span sets both ends, so col-span after col-start replaces the start (and col-start then shows `span 3`, which is what CSS has). Set col-span first, then col-start, for "start at 2, span 3" (`2 / span 3`, still shown as `3` in col-span). Undo restores each end exactly.
  - [x] **Justify content** ([editors/justify](packages/overlay/src/editors/justify/JustifyContentEditor.tsx)) and **align items** ([editors/align](packages/overlay/src/editors/align/AlignItemsEditor.tsx)): keyword selects in the icon variant, both built with the shared `keywordEditor({ property, options, icons })` ([editors/keyword](packages/overlay/src/editors/keyword/KeywordEditor.tsx)).
    - **justify-content:** start, end, center, space-between, space-around, space-evenly. Tailwind's `justify`, `justify-start`, `justify-between`… find it.
    - **align-items:** start, center, end, stretch, baseline. Tailwind's `items`, `items-center`… find it.
    - **Icons** (12px): a square frame (`--plt-color-contrast-high` at 20%) and accent items (`--plt-color-accent`) sitting flush on its edges. justify-start is designed, and the other justify icons move its two items along the row. The align icons are designed too: a short item and a tall one, side by side, at the top, middle or bottom; both full height for stretch; and for baseline, their bottoms on one line. With nothing set, both show the designed no-value icon, the frame crossed out at 20% (`layout-empty`). A value set some other way (`flex-start`, `normal`) still shows, without an icon.
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
