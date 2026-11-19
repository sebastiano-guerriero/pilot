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

The dialog **lists the editors for every property the element has a value for** (from any source), in the order kept in [editors/listOrder.ts](../packages/overlay/src/editors/listOrder.ts) (`LIST_ORDER`), by group: Layout, Position, Appearance, Typography, Interactivity, SVG, Visibility. The project owner keeps that order; every editor that writes properties needs a place there, and `listOrder.test.ts` fails without it.

- The list (and only this one: searching shows the matches alone) is **grouped**: each group starts with its label, and a dotted line separates groups (`groupOf()`).
- Rows a revealing editor shows are set in `LIST_ORDER` too, per value (`rowsOf()`): display's grid and flex rows, position's inset. An editor another one shows as a row (gap under `display: grid`) is left to that one. A row that shows on its own (gap on an element that isn't a grid) is listed right after display.
- The list is taken when the search is empty and kept while you edit, so clearing a value doesn't make its row vanish.
- **A reset's values don't list.** A property whose value comes only from a rule for every element (`*`, `:where(*)`: `* { box-sizing: border-box }`, Tailwind's preflight with its `margin: 0`, `padding: 0`) isn't listed, or every element would list them (`isFromReset()` in [dom/declared.ts](../packages/overlay/src/dom/declared.ts)). The element's own rules (`.card { box-sizing: border-box }`, a `box-border` class) and Pilot's edits still list; searching finds the property either way, with its value. Deciding by value instead (hide `border-box`) was rejected: it would also hide those deliberate settings and Pilot's edits, and leave the reset's margin and padding.
- Size, which writes nothing of its own, isn't listed.
- `LIST_ALL_EDITORS = true` in `PropertyDialog.tsx` lists every editor, set or not (handy while many editors are built together). It's `false`.

## Searching

Type a property (`opacity`, `padding`, `radius`…) and the matching editors replace the list; clearing the search brings it back. When nothing matches, the dialog says so under the search ("No property matches “layo”"), rather than showing nothing; not for the `/` modifiers, which have their own menu. The search only finds properties: values are always set in the editor. (Typed values like `pt-4` + Enter are left out on purpose for now; see [roadmap.md](roadmap.md), *Open questions*.)

**The search carries over** from one selection to the next: set col-span on one card, click the next, and the col-span editor is already there. The carried-over query is selected, so Tab/Enter goes into its editor and typing replaces it. It starts empty again once nothing is selected (Esc, the tool turned off, the dialog closed).

### What the search looks at

Only three things: the editor's **label**, the **CSS property names** it writes (and their logical equivalents, `padding-inline`), and **Tailwind's class names** (its `aliases`, plus a row label that's neither, like `grid-columns`). There are no extra search keywords ("spacing", "layout"…): they matched things the designer didn't mean (`spa` found padding through "spacing"). Aliases borrow Tailwind's utility names, so a designer who knows them gets there in a keystroke or two.

### Ranking

`searchEditors()` and `matchEditors()` in [editors/registry.ts](../packages/overlay/src/editors/registry.ts), best first:

1. an exact **alias**;
2. an exact label or property name;
3. a prefix (`pad`);
4. a Tailwind class whose first word starts with the query (`items` → `items-center`, align-items; `self` → align-self): it beats a name that only has the word later (justify-items). The first word only, so `cols` isn't `col-start`;
5. a later word starting with the query (`spa` → the "span" in col-span, `ite` → align-items, `cols` → `grid-cols`): a word being typed counts;
6. a substring;
7. an **abbreviation**, only when nothing better matches: the query's letters in order in a property name, starting at a word start (`wdt` → width, `mxw` → max-width, `pdg` → the padding rows). Requiring a word start keeps it sensible (`dt` won't match width through its middle letters). Starting at a later word (the "width" in `min-width`) counts as one more skipped letter, so `wdt` prefers width itself. Among several, the fewest skipped letters win, then the shortest name.

Hyphens and spaces are ignored on both sides: `minw`, `min w`, `min-w` and `minwidth` are the same query, and `paddingtop` finds padding-top. Swapped letters (`widht`) aren't handled yet.

The dialog shows:

- **every editor tied for the best match**, if that match is a Tailwind class's first word or better (`w` → width, min-width and max-width; `min` → min-width and min-height; `font` → all five font editors; `content` → display's `contents` and align-content), or an abbreviation skipping as many letters (`pdg` → the four padding rows). A substring-only best match shows just the top editor, so a single letter doesn't flood the dialog. Tied editors keep the registry's order;
- **plus the family** of each editor shown. Editors can declare a `family`: min-width and max-width belong to `width`. A query that lands on the family's main editor brings the whole family, main one first (`w`, `width` → width, min-width, max-width). A query that lands on a member shows only that member (`min-w`, `max-width`);
- no limit for those prefix-or-better ties: they're the family the designer is typing, and cutting one hid it (`font` lost font-variant-numeric). An abbreviation shows at most 4 editors.

Padding shows how far this goes without extra logic: its four sides each carry the Tailwind aliases that include them, so `p` shows all four, `px` right and left, `pt` one. Equal matches show together.

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

## Keys

| Key | Where | Does |
| --- | --- | --- |
| type | search | Finds the property. Tailwind aliases work: `p`, `pt`, `px`… |
| **Tab** or **Enter** | search | Jumps into the matched editor. What you typed decides the focus: `pt` → top, `pl` → left |
| type a number | editor | `12` or `12px`. ↑/↓ change it by 1, by 10 with Shift |
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
