# The property dialog

Selecting an element opens the property dialog next to it ([PropertyDialog](../packages/overlay/src/ui/components/PropertyDialog/PropertyDialog.tsx)): a search field, the editors that match, and a footer with the keys.

## Where it sits

Strict rules (`dialogSpot()`, `dialogPosition()`):

1. It picks its spot once, when the element is selected: beside it, on its right, else its left, else overlapping its right edge when the element is too wide for either; level with its top.
2. **Editing never moves it.** The element growing, shrinking or moving (a padding, a width, a display change) leaves the dialog where it is, even if the element ends up under it. Don't re-anchor it to the element's live box.
3. Scrolling moves it with the page: the spot is in page coordinates.
4. It only shifts to stay on screen: when scrolling would take it off, or when it grows taller than the room below. A shift from growing sticks (`raisedSpot`): the spot moves up with it, so when it shrinks again (the `/` menu, a shorter list) its top stays put instead of dropping back. A shift from scrolling doesn't stick.
5. It picks a new spot when another element is selected, or when the window is resized (measuring the element right then).
6. **You can drag it** by a strip along its top edge, over the search's empty top padding (it adds no height), with a grip as the clue. The dragged spot lasts for this selection, still moves with scrolling and stays on screen; selecting another element (or resizing the window) puts it beside that element again. Focus stays in the search, and the drag never reaches the page.

The dialog is never taller than the window: the properties scroll inside it, the search and the footer stay. Rows fade out as they scroll under the search's line and the footer's line. The fades are separate overlays, not a mask on the list, so whatever opens out of the list (a select's menu) isn't cut off. There's no native scrollbar (it takes room on Windows and Linux and looks different in every browser): [ScrollThumb](../packages/overlay/src/ui/components/ScrollThumb/ScrollThumb.tsx) draws a thin thumb over the list's edge, shown while the pointer is over the list or just after a scroll, and draggable.

## With nothing typed

The dialog **lists the editors for every property the element has a value for** (from any source), in the order kept in [editors/listOrder.ts](../packages/overlay/src/editors/listOrder.ts) (`LIST_ORDER`), by group: Layout, Position, Appearance, Effects, Typography, Interactivity, SVG, Visibility. The project owner keeps that order; every editor that writes properties needs a place there, and `listOrder.test.ts` fails without it.

- The list (and only this one: searching shows the matches alone) is **grouped**: each group starts with its label, and a dotted line separates groups (`groupOf()`).
- Rows a revealing editor shows are set in `LIST_ORDER` too, per value (`rowsOf()`): display's grid and flex rows, position's inset. An editor another one shows as a row (gap under `display: grid`) is left to that one. A row that shows on its own (gap on an element that isn't a grid) is listed right after display.
- The list is taken when the search is empty and kept while you edit, so clearing a value doesn't make its row vanish.
- **A reset's values don't list.** A property whose value comes only from a rule for every element (`*`, `:where(*)`: `* { box-sizing: border-box }`, Tailwind's preflight with its `margin: 0`, `padding: 0`) isn't listed, or every element would list them (`isFromReset()` in [dom/declared.ts](../packages/overlay/src/dom/declared.ts)). The element's own rules (`.card { box-sizing: border-box }`, a `box-border` class) and Pilot's edits still list; searching finds the property either way, with its value. Deciding by value instead (hide `border-box`) was rejected: it would also hide those deliberate settings and Pilot's edits, and leave the reset's margin and padding.
- **A shorthand's implicit reset isn't a value.** `text-decoration: none` sets the line to none and puts the color, style and thickness back to their initial values without naming them; CSSOM reads those as `initial`. Pilot counts them as nothing declared (`isImplicitReset()` in [dom/declared.ts](../packages/overlay/src/dom/declared.ts): the value is `initial` and the rule's text doesn't name the property), so the fields show the initial value dimmed and the list leaves them out. The rule still wins the cascade: a less specific rule's value doesn't show through. `initial` written by the page is a value like any other.
- Size, which writes nothing of its own, isn't listed.
- `LIST_ALL_EDITORS = true` in `PropertyDialog.tsx` lists every editor, set or not (handy while many editors are built together). It's `false`.

## Searching

Type a property (`opacity`, `padding`, `radius`…) and the matching editors replace the list; clearing the search brings it back. When nothing matches, the dialog says so under the search ("No property matches “layo”"), rather than showing nothing; not for the `/` modifiers, which have their own menu. The search only finds properties: values are always set in the editor. (Typed values like `pt-4` + Enter are left out on purpose for now; see [roadmap.md](roadmap.md), *Open questions*.)

**The search carries over** from one selection to the next: set col-span on one card, click the next, and the col-span editor is already there. The carried-over query is selected, so Tab/Enter goes into its editor and typing replaces it. It starts empty again once nothing is selected (Esc, the tool turned off, the dialog closed).

### What the search looks at

Only three things: the editor's **label**, the **CSS property names** it writes (and their logical equivalents, `padding-inline`), and **Tailwind's class names** (its `aliases`, plus a row label that's neither, like `grid-columns`). There are no extra search keywords ("spacing", "layout"…): they matched things the designer didn't mean (`spa` found padding through "spacing"). Aliases borrow Tailwind's utility names, so a designer who knows them gets there in a keystroke or two.

**An alias is a class Tailwind really has** (`underline`, `grid`, `items-center`), not a bare prefix of a family of classes (`text`, `bg`). An exact alias beats every prefix, so `text` as font-size's alias hid text-align and the other text-* rows, and `bg` as bg-color's hid bg-blend-mode. Those families are found by their prefix instead (`text-lg` is font-size). The one-letter spacing aliases (`p`, `m`, `w`, `h`) are Tailwind's own classes for one editor on purpose.

### Ranking

`searchEditors()` and `matchEditors()` in [editors/registry.ts](../packages/overlay/src/editors/registry.ts), best first:

1. an exact **alias**;
2. an exact label or property name;
3. a prefix (`pad`);
4. a Tailwind class that starts with the query, within its first word or by whole words (`items` → `items-center`, align-items; `self` → align-self; `hue-rotate` → `hue-rotate-90`, filter): it beats a name that only has the word later (justify-items). Not into a later word, so `cols` isn't `col-start`;
5. a later word starting with the query (`spa` → the "span" in col-span, `ite` → align-items, `cols` → `grid-cols`): a word being typed counts;
6. a substring;
7. an **abbreviation**, only when nothing better matches: the query's letters in order in a property name, starting at a word start (`wdt` → width, `mxw` → max-width, `pdg` → the padding rows). Requiring a word start keeps it sensible (`dt` won't match width through its middle letters). Starting at a later word (the "width" in `min-width`) counts as one more skipped letter, so `wdt` prefers width itself. Among several, the fewest skipped letters win, then the shortest name.

Hyphens and spaces are ignored on both sides: `minw`, `min w`, `min-w` and `minwidth` are the same query, and `paddingtop` finds padding-top. Swapped letters (`widht`) aren't handled yet.

The dialog shows:

- **every editor tied for the best match**, if that match is a Tailwind class's first word or better (`w` → width, min-width and max-width; `min` → min-width and min-height; `font` → all five font editors; `content` → display's `contents` and align-content), or an abbreviation skipping as many letters (`pdg` → the four padding rows). A substring-only best match shows just the top editor, so a single letter doesn't flood the dialog. Tied editors keep the registry's order;
- **plus the family** of each editor shown. Editors can declare a `family`: min-width and max-width belong to `width`. A query that lands on the family's main editor brings the whole family, main one first (`w`, `width` → width, min-width, max-width). A query that lands on a member shows only that member (`min-w`, `max-width`);
- no limit for those prefix-or-better ties: they're the family the designer is typing, and cutting one hid it (`font` lost font-variant-numeric). An abbreviation shows at most 4 editors.

Padding shows how far this goes without extra logic: its four sides each carry the Tailwind aliases that include them, so `p` shows all four, `px` right and left, `pt` one. Equal matches show together.

## Variables

A field can take the page's tokens (its CSS variables, [dom/tokens.ts](../packages/overlay/src/dom/tokens.ts)) where a value goes, the ones that fit it: lengths in a padding or a radius, colors in a color, fonts in font-family, numbers in opacity, shadows in box-shadow's custom field (a value that reads as one: 2–4 lengths, a color, `inset`, each layer; Tailwind's `--shadow-md`) ([TokenMenu/tokens.ts](../packages/overlay/src/ui/components/TokenMenu/tokens.ts)). Two ways to the same list ([TokenMenu](../packages/overlay/src/ui/components/TokenMenu/TokenMenu.tsx)), under the field:

- **Typing `--`** at the start of a field or after a space, `(` or `,`: the list at the caret, filtered as you type, by name or by value (`inter` finds `--font-sans`). The way for anyone who knows the names, and inside a value: `calc(--sp` → `calc(var(--space-4)`, and the typing goes on.
- **The variable button** on the field's right edge (Nucleo's nut-2, filled, drawn at 8px in a 16px target, while the field is hovered or edited; the text then ends 4px before it, with an ellipsis when it's cut, except while being edited, when it scrolls): the same list, to browse without knowing a name. Picked, the token goes where the caret is, in place of the selection: the whole value when the field wasn't being edited.

**In order:** the ones meant for the property first, by their names (`tokenHint()`: the spacing scale for a padding, the radii for a radius, `bg`/`surface` for a background), then the rest in the page's order; what's typed still leads (the names starting with it).

**Opening on what the field holds:** a field holding one variable (`--space-4`) opens its list as a select on its value: that row checked, highlighted and scrolled to (`currentToken()` in [tokens.ts](../packages/overlay/src/ui/components/TokenMenu/tokens.ts)); ↑/↓ move from it, Enter or Esc keep it. In math, the variable the caret is in is the current one, and a pick replaces just it. On anything else (a number, math, empty) nothing is highlighted, and there's no checkmark column: ↓ starts at the top, ↑ at the bottom, Enter does what it does in the field. Typing a bare `--` highlights nothing; a name typed, its first match. Not considered the current one: a variable whose value equals the field's number (`16px` and `--space-4`): two can share a value (`--space-1`, `--radius-sm`), so it could point at the wrong one.

**Tokens in files too:** a project's tokens that never reach the page as CSS variables (a `tokens.json` in the W3C or Style Dictionary format, aliases followed; Sass `$variables`), read by Pilot's process in the project ([tokenFiles.ts](../packages/cli/src/tokenFiles.ts), `POST /tokens`, kept current like the components) while it runs for the site (`npx usepilot`). Listed after the page's, by their own names. Pilot defines each as a CSS variable of its own in a sheet of its own (`--color-brand-primary` for `color.brand.primary`, `setFileTokens()` in [dom/tokens.ts](../packages/overlay/src/dom/tokens.ts)), so a pick previews and is checked like any change; the agent's prompt says what each such variable stands for (`fileTokens` on the change set) and to write the token the project's way, never the `var(--…)`. Tailwind v3 configs are JavaScript, which would have to run: not read yet.

Picked, `var(--name)` goes in (just the name inside a `var(` already); ↑/↓ and Enter or Tab pick, Esc closes the list only. A pick that makes the value (from the variable button, or a variable alone) is applied at once, so the page shows it while the field keeps the focus; one inside math being typed (`calc(--`) waits for Enter or leaving the field, since the value goes on. Before, every pick waited, and the page didn't change until the designer clicked away. The change records `var(--name)` as written (names keep their case), the preview resolves it on the page, and the agent writes the project's form of the token. Rejected: a button that replaces the whole value, alone, since tokens sit inside values too (`calc()`, `padding: var(--a) var(--b)`). The list and the button are approved by the owner. Not yet: Tailwind v3 configs.

**Stepping a token:** ↑/↓ (and the wheel) on a field holding one token move it along its scale: `var(--space-3)` → `var(--space-4)`, `--radius-sm` → `--radius-md`, `--gray-100` → `--gray-200` in a color ([`stepToken()`](../packages/overlay/src/ui/components/TokenMenu/tokens.ts)). The scale is the tokens of the same kind named like it but for the last part, in order of their values when they can all be compared (lengths, numbers), else of that last part (numbers, t-shirt sizes). One token per step, Shift too, and it stays at either end: stepping never trades the token for a number on its own. A token with no scale (`--gutter`), or math (`calc(var(--space-2) + 4px)`), steps from the computed value instead, and the number replaces it (`stepValue()` in [css/values.ts](../packages/overlay/src/css/values.ts)), as the owner asked: the wheel and the arrows always do something. Rejected for math: stepping the number inside it (`+ 4px` → `+ 5px`), less predictable than the value you see. What the field shows counts, even before Enter: a variable just picked (or a value typed) is applied first when a step or a drag starts, and what it steps from is read from the page then, not at the last render. Otherwise a drag after a pick started from the variable applied before it.

**A lone token shows by its name:** `--radius-lg`, not `var(--radius-lg)`: the wrapper took the room, and cut the end, the part that tells `--space-3` from `--space-4` (`bareToken()` in [css/values.ts](../packages/overlay/src/css/values.ts)). Inside a value it keeps its `var()` (`var(--space-2) * 3`), and so does one with a fallback. A name typed (`--space-4`, `--a * 2`) goes in its `var()` (`withVars()`), so what a field shows can be typed back. The change still records `var(--name)`. Considered for names still too long: cutting them in the middle (`--color-b…primary`), which only reads well for one name; for a value of several parts (`10px 20px`, `repeat(3, 1fr)`) it hides the structure. Not built for now.

**Hovering a field says what it can't show** (a tooltip, at the field's right edge; not while it's being edited, when what's typed hasn't been applied):
- **Cut** (an ellipsis): the whole value. Measured as the pointer comes, since the variable button then takes room.
- **Math** (`100% - 20px`, `var(--space-2) * 3`, `clamp(…)`): what it comes to, `= 180px` (`mathResult()`), from the moment it's applied, with the pointer still on it; both when it's cut too (`100% - 20px = 180px`). Not for a lone token: its list shows its value.

Fields show declared values, never computed ones; the tooltip is the one place a computed value shows, beside the declared one, never in its place. Every field sits in a tooltip, empty when there's nothing to say, so the input is never made anew (and loses focus) when there comes to be.

## Modifiers: widths and states

Typed at the start of the search, shown as **pills** in a row above the field. More modifiers will sit there side by side later.

### The `/` menu

For discoverability (nobody guesses `from-1200`): typing `/` at the start of the search lists the **modifiers** inside the dialog ([search/modifiers.ts](../packages/overlay/src/search/modifiers.ts)), each with a name, its syntax and a short description: **From width** `from-768`, **To width** `to-767`, **Hover** `hover:`, **Focus** `focus:`, **Focus visible** `focus-visible:`, **Active** `active:`.

- Typing after `/` filters by any word of the name or syntax (`/fr`, `/width`). ↑/↓ move, Enter or Tab picks.
- Picking a state sets its pill at once. Picking a width puts its syntax in the search to finish typing (`from-`, with the window's width suggested).
- Esc closes the menu and clears the `/…` text, since it isn't a property search (the dialog stays open).
- No property starts with `/`, so it never gets in the way. The placeholder says so: "Add a property, or / for modifiers".
- More modifiers (`*`, group-checked…) are one entry each in `MODIFIERS`; what they do once set is their own work. The rows' look is a placeholder, pending design.

### Viewport widths

Changes are for **every width** unless you set the **width chip** ([edits/widths.ts](../packages/overlay/src/edits/widths.ts)). Pilot never infers a range from the window size, since a designer on a small screen may still mean every width.

- **Type** `from-1200` then a space: the chip reads `from 1200px`, and the rest is the search (`from-1200 pt` searches `pt`). `to-767 ` is `to 767px`, and both make a range: `from-768 to-1199 ` is `768–1199px`. The same width at both ends reads `1108px only`. Typing another token replaces that end. A token counts only once followed by a space, so `from-12` on the way to `from-1200` isn't taken.
- **Click** the viewport width ([page.md](page.md)): the chip becomes `from` that width; **Shift+click** makes it `to`. With one end set, a click at another width makes a range, in either order; the same width changes nothing, and a click on a full range starts over. Focus and the query stay where they are.
- **Click while typing a token** (`from`, `from-`, `to-76`, without its space yet: `partialWidth()`): the click finishes it, the typed word deciding the end (`to` clicks as Shift+click does), and the word leaves the search.
- **Suggestion:** after `from-` or `to-`, the window's width shows dimmed after the text, like a code editor's autocomplete, and **Tab** takes it. Only while the digits typed start the width (`widthSuggestion()`).
- **Remove** it with its × or Backspace at the very start of the field (which removes the last pill). Esc doesn't remove it.
- Both ends are included. The chip **stays** across selections and with nothing selected, until removed. Every change made while it's set is recorded for its widths, a separate change from the same property at other widths ([edits.md](edits.md), *Widths*).
- When the window is **outside** the chip's range, changes made now don't show until you resize into it, and the fields show what applies at the window's width. `data-outside` marks it (on the pill and the width button), unstyled for now.

### States

[edits/states.ts](../packages/overlay/src/edits/states.ts). Type Tailwind's variant at the start of the search (`hover:`, `focus:`, `focus-visible:`, `active:`; the colon ends it), or pick it in the `/` menu.

- Each is a pill, and they combine: `hover:active:` is hovered and pressed, and with a width too, in any order (`hover:from-768 `). Backspace at the start removes the last pill, states first, then the width chip. They stay across selections, like the chip.
- **The element shows the states while they're set**, like the browser's "force state": the page's own rules for those states (`forcedDeclarations()` in [dom/declared.ts](../packages/overlay/src/dom/declared.ts)), then Pilot's changes for them, are drawn on it unconditionally (`EditHistory.setForced()`).
- **Fields show the values for exactly those states**: Pilot's change for them, else the page's rule for them (`.btn:hover`), empty when nothing sets one. Without pills, rules that only apply in a state are left out, even while the element happens to be hovered. Only the element's own states count: an ancestor's (`.card:hover .title`) or one inside `:not()` doesn't (`subjectStates()`).
- Recording and handoff: [edits.md](edits.md), *States*.

## Copy and paste

A right-click on a property's name (the row's label) opens a menu at the pointer ([ContextMenu](../packages/overlay/src/ui/components/ContextMenu/ContextMenu.tsx), the variables list's look, placeholder pending the design), for that row's properties: its editor's, with what it writes along (line-clamp's companions, mask-image's composite), and a revealed row's own (display's gap row is gap's, `data-row`). A mask panel's rows (type, from…) aren't properties and have none.

- **Copy CSS** puts them on the clipboard as CSS, a declaration a line, as the fields show them (declared values, Pilot's edits included, for the state pills): `padding: 10px 18px;`, a shorthand set itself in place of its longhands ([propertyClipboard.ts](../packages/overlay/src/ui/propertyClipboard.ts)).
- **Copy properties** keeps the same values in Pilot, for the page load.
- **Paste properties** applies what was copied to the selected elements, as one undo step, with the width chip and the state pills, like any edit; whichever row was right-clicked (it pastes what's copied).
- Off (dimmed) when there's nothing to copy (the row sets nothing) or to paste. ↑/↓ move, Enter picks, Esc closes only the menu, a click elsewhere or a scroll closes it.
- Rejected for now, the owner's call: copying every property the element sets (Figma's Copy properties); the menu copies a row's.

## Keys

| Key | Where | Does |
| --- | --- | --- |
| type | search | Finds the property. Tailwind aliases work: `p`, `pt`, `px`… |
| **Tab** or **Enter** | search | Jumps into the matched editor. What you typed decides the focus: `pt` → top, `pl` → left |
| type a number | editor | `12` or `12px`. ↑/↓ change it by 1, by 10 with Shift; a token, along its scale (*Variables*) |
| wheel | editor, being edited | Like ↑/↓: up is ↑, one step per notch (or per 24px of a trackpad's scroll). A burst of steps is one undo step. A field not being edited lets the dialog scroll |
| **Enter** | editor | Applies the value and returns to the search, text selected, ready for the next property |
| **Tab / Shift+Tab** | editor | Next/previous field (padding: top → right → bottom → left), on into the next/previous editor. Past the first or last, back to the search |
| **Esc** | anywhere in the dialog | One level back: editor → search (discards typed text) → clears the search → closes the dialog |
| **Esc** | page, nothing selected | Turns the select tool off |
| double-click | a text on the page (Select) | Edits it in place: **Enter** done, **Esc** cancels |
| **Cmd/Ctrl+Z**, **Cmd/Ctrl+Shift+Z** | anywhere | Undo / redo |
| `from-1200` / `to-767` + **Space** | start of the search | Sets the width chip |
| `hover:` `focus:` `focus-visible:` `active:` | start of the search | Sets a state pill |
| `/` | start of the search | Lists the modifiers |
| **Tab** after `from-` / `to-` | search | Takes the suggested width |
| **Backspace** | start of the search | Removes the last pill |
| click / **Shift+click** | viewport width | Width chip `from` / `to` that width; a second width makes a range |

```
pt ⇥ 24 ⏎    px ⏎ 6 ⏎    …
```

Linked values follow Tailwind's meaning: `px` links left and right, `py` top and bottom, and `p` all four, so one number sets them all, as one undo step.

**The footer** always shows the keys for what you're doing: in the search, "**Tab** or **Enter** to edit"; in a property, "**Enter** to apply, **Esc** to go back" (editors can replace it for a moment, `onHint`). The keys are `<kbd>` elements and the footer carries `data-area="search" | "editor"`. The copy never names a property: every editor follows the same keys, so the messages stay the same for all of them.
