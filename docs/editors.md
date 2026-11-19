# Property editors

Every editor is first-party and designed by the project owner. Build the plumbing from the shared pieces and leave new visuals for review. How their changes are recorded and shown: [edits.md](edits.md).

## The contract

An editor is a Preact component plus metadata ([editors/types.ts](../packages/overlay/src/editors/types.ts)):

```ts
{
  id: "opacity",
  label: "Opacity",
  properties: ["opacity"],   // CSS it writes
  aliases: ["opacity-50"],   // Tailwind's class names: exact match, ranked first
  component: OpacityEditor,
}
```

Each editor lives in `src/editors/<name>/` with its `.tsx` and `.css`, is registered in [editors/registry.ts](../packages/overlay/src/editors/registry.ts), has its CSS imported in `ui/styles/index.css`, and has a place in `LIST_ORDER` ([property-dialog.md](property-dialog.md)). How the search finds it: [property-dialog.md](property-dialog.md), *Searching*.

The dialog renders each matched editor in its own `.editor` wrapper and passes:

- `values`: the element's **computed** values for its `properties`, only for steps and drags;
- `declared`: their **declared** values, what fields show, read with `declaredOf(props, property)` ([editors/declared.ts](../packages/overlay/src/editors/declared.ts)). Fields never show computed values: Pilot is for writing CSS, not for inspecting what the browser computed. See [edits.md](edits.md), *Declared values*;
- `query`: the live search text, so an editor can pick its view as you type (padding's sides);
- `onChange(property, value, { gesture })`: the only way to change a style. It goes through the history. For a continuous interaction (a drag), pass the same `gesture` object for the whole of it, so it's one undo step. `""` means "not set": the dialog's `clearProperty()` turns it into a removal when the page's CSS sets it. Don't handle clearing, widths or states per editor;
- `onRevert(property, gesture)`: takes back what an ongoing gesture did to one property, restoring its exact earlier value (Alt released mid-drag, a drag back to its start). Never re-apply the old number: that leaves a fake edit in the change set;
- `focusRequest`: a new `{ query }` each time the designer tabs or enters in from the search, so the editor focuses the part the query names (`pt` → top), or `{ edge: "first" | "last" }` when Tab arrives from a neighbor;
- `onReturnToSearch()` when a value is done (Enter), and `onTabOut(direction)` when Tab moves past the last field (or Shift+Tab before the first). Esc is the dialog's;
- `onHint(content | null)`: replaces the footer message while something editor-specific happens, such as a drag;
- `onInspect(areas | null)`: shows parts of the element's box on the page, like `[{ box: "padding", side: "top" }]` or a grid's gaps (`[{ box: "gap", axis }]`), drawn by [BoxAreas](../packages/overlay/src/ui/components/BoxAreas/BoxAreas.tsx).

**Whether an area hides the selection highlight** (outline, dots, label, grid lines) while its editor is in use is the project owner's call per property, set in one place: `hidesSelection()` in [dom/boxModel.ts](../packages/overlay/src/dom/boxModel.ts). Padding, margin and gap keep it: their stripes are drawn with it, and the outline helps place them. Border hides it, since the outline sits right on the border it would cover (no border editor right now). Ask the owner when a new area's case is unclear.

After an undo, inputs show the restored value.

## Builders

Don't fork the pieces per property; extend their config.

| Builder | For | Used by |
| --- | --- | --- |
| `lengthEditor({ … })` ([editors/length](../packages/overlay/src/editors/length)) | One value. Also for non-lengths: give the property a `kind` in `css/properties.ts`, and `name` for a row label that isn't the property name. `scrub: true` adds a drag handle | width, height and their min/max, flex-basis, border-radius, opacity, z-index, order, col-*, typography |
| `keywordEditor({ property, options, icons, name })` ([editors/keyword](../packages/overlay/src/editors/keyword)) | A keyword property: a select, with an icon per value if given, and `name` for a row label that isn't the property name. Where a select offers `none`, it's always last (the owner's rule) | justify-content, justify-items, align-items, align-content, align-self, justify-self, flex-direction, flex-wrap, object-fit, isolation, overflow, overscroll-behavior, box-sizing, float, the blend modes, visibility, font-style, text-align, text-wrap, white-space, text-overflow, font-variant-numeric, the interactivity selects |
| `splitEditor({ … })` ([editors/split](../packages/overlay/src/editors/split)) | A shorthand as one value or each part, switched by a button in `PropertyRow`'s `action` slot; configured with the parts' properties, icons, page areas, search words, and pairs typed together | gap directly; padding, margin, inset through `sidesEditor({ … })` ([editors/sides](../packages/overlay/src/editors/sides)) |
| `presetEditor({ property, presets, customLabel, placeholder, icons, hints })` ([editors/preset](../packages/overlay/src/editors/preset)) | A few values plus `custom`, which adds a field for any other value. A value set some other way that means a preset (`16/9`, `1.0`) shows as that preset. `icons` as in keywordEditor, plus one for `custom`; `hints`, a word after a preset, dimmed, in the menu and on the select (`PropertySelect`'s `hintFor`) | aspect-ratio, flex-grow, flex-shrink, font-weight, will-change, object-position |
| `revealEditor({ property, options, rows })` ([editors/reveal](../packages/overlay/src/editors/reveal)) | A select that reveals other editors as rows, per value, from `LIST_ORDER`, with Tab running through them. `options` can depend on the value set now (display's `-webkit-box`) | display, position |
| `colorEditor({ property, name, label, aliases, keywords })` ([editors/color](../packages/overlay/src/editors/color)) | A color and its opacity; `keywords` are values that aren't colors, taken as typed, with no opacity (fill and stroke's `none`) | color, background-color, fill, stroke |

**An editor that writes more than its property** lists the others in `reads`: they're fed to it like `properties` (declared and computed values), but the search and the list of set properties don't count them, so searching `display` doesn't find line-clamp.

**Revealing properties.** When a property or value brings others with it (`display: grid` shows grid-columns, grid-rows, gap, justify-content, justify-items, align-items, align-content), the revealed ones are editors of their own, listed in the revealing editor's `embeds` and rendered as its rows. Only the revealing property reveals: searching a revealed one (`gap`, `grid-cols`, `items-center`) shows just that editor. Don't add revealed properties to the revealing editor's `properties` or `aliases`, or the search finds it too. The search doesn't look at `embeds`.

## Shared pieces

### PropertyRow

[PropertyRow](../packages/overlay/src/ui/components/PropertyRow/PropertyRow.tsx): the property name (`PropertyLabel`) on the left and a fixed **128px value area** on the right; the labels get the rest, 92px at the dialog's width, enough for `padding-bottom` or `mix-blend-mode`. A property name that doesn't fit gets a shorter row label (`name`), taken from the property, not from Tailwind's class names: `bg-color`, `bg-blend-mode`, `overscroll`, `font-numeric`, `line-clamp`. Fields in the value area share it equally (a grid of equal columns, so a field's own padding doesn't change its share). The `action` slot puts a control at the end of the value area (split editors' view button); the fields give up its width, and its right edge lines up with other rows' fields.

### PropertyInputText

[PropertyInputText](../packages/overlay/src/ui/components/PropertyInputText/PropertyInputText.tsx): the value control, a real `<input type="text">` in the shared `.field-box` look (`base.css`), so every value control (this and `PropertySelect`) looks the same.

- Works like every Pilot value: the first click selects all, Enter commits and returns to the search, Esc discards, ↑/↓ ask the editor for a step (×10 with Shift), and after an undo it shows the restored value.
- **With no value set, the box is empty**, with no placeholder: the box itself shows there's a field. (A split editor's one value reads "Mixed" when the parts differ.)
- Values too long for the field end with an ellipsis until it's focused.
- `:focus-visible` gives the focused look. Text fields match it whenever they're focused, the select's trigger only from the keyboard.
- **Linked fields** (padding's `px`, size): a field can report its draft (`onDraft`) and show another field's (`mirror`): its text once typed, and the selection drawn over the text (`.mirror-selection`, the same highlight as `::selection`), since a page holds only one real selection. The linked field also gets the focused look (`data-mirror-focus`), so every field typing goes to looks focused. A drawn caret was tried and dropped: a static one next to the real blinking caret looked off, and a synced custom caret would mean replacing the browser's.
- **Icon variant** (`icon`): an icon at the left of the field. Clicks go through it.
- **Smart parentheses**, as in a code editor (safe in CSS: every `(` needs its `)`). `(` inserts `()` with the caret inside, or wraps the selection. `)` before a `)` that closes an open one steps over it, and Backspace inside an empty `()` deletes both. So `var(` + `--gap` + `)` gives `var(--gap)`. It hooks `beforeinput`, so it works however the character is typed; pasted text is left as is.
- **Tabular figures**, so values don't jitter while they change and numbers line up across rows.

### ScrubHandle

[ScrubHandle](../packages/overlay/src/ui/components/ScrubHandle/ScrubHandle.tsx), drag logic in `useScrub()` ([editors/length/useScrub.ts](../packages/overlay/src/editors/length/useScrub.ts)). **Opt-in, only where asked:** `PropertyInputText` adds it when the editor passes `onScrub(steps, startText, gesture)`; a length row asks with `scrub: true`.

- **Look** (the owner's design): a small wheel at the field's right end, lined up with a select's chevron, drawn as lines on a drum seen edge-on, like the iOS timer picker. It turns with the pointer and comes to rest on a line on release. The target is taller and wider than the drawing.
- **Behavior:** `ns-resize` cursor. Drag up to increase, down to decrease, 1 step per pixel, ×10 with Shift. The drag is followed on the window, so every move counts wherever the pointer goes, and the value always follows the total distance from the start. Steps keep the starting value's unit; font-relative units (`em`, `rem`, `lh`…) step by 0.1 (`scrubIncrement`). The whole drag is one undo step (one `gesture`). What it steps from is fixed when the drag starts, since the computed value changes with every step.
- **Back at the start**, the exact earlier value is restored with `onRevert`, leaving no fake edit.
- **From an empty field**, it steps from the computed value (0 for gap, so the first step up is `1px`) and never goes back to empty: back at the start it's `0px`, and only deleting the text removes the value.
- **At the minimum** (0, unless negatives are allowed), dragging further doesn't count: turning back moves the value at once, instead of first climbing back through the distance dragged below 0.

### PropertySelect

[PropertySelect](../packages/overlay/src/ui/components/PropertySelect/PropertySelect.tsx): the keyword control, a trigger in the same `.field-box` with a chevron, and **Pilot's own dropdown menu** (the browser's can't be styled and draws differently per browser).

- With no value set, the trigger says **Select**, dimmed. Values that don't fit end with an ellipsis.
- **The menu** opens over the trigger like macOS's native select: the current value's option on top of the trigger, its label exactly where the trigger's is (the menu grows leftward by the checkmark column; the shift is measured, not hardcoded), right edges lined up. Near a viewport edge it's pushed back inside, and then no longer covers the trigger exactly (`menuPosition`). It's `position: fixed`, so the dialog's `overflow: hidden` doesn't clip it. It's as wide as its longest option, capped (longer options end with an ellipsis), and scrolls past a maximum height.
- **Options** have a checkmark column, so labels line up and the current value gets the check.
- **Keys** (a WAI-ARIA select-only combobox: focus stays on the trigger, the highlighted option is its `aria-activedescendant`):
  - closed, **typing picks at once**, like a native select: `f` sets flex, repeating a letter cycles through the options starting with it (`i` → inline-block, `i` again → inline…), several letters typed quickly (`inline-f`) narrow the match. Each pick is its own undo step, and "Select" is never matched;
  - Enter, Space, ↑ or ↓ open the menu on the current value; Backspace/Delete remove the value; Tab/Shift+Tab move on; Esc goes back to the search;
  - open: ↑/↓ and Home/End move the highlight, typing moves it the same way, Enter or Space picks, Esc closes without picking, Tab closes and moves on. Picking keeps focus on the trigger. Clicking picks; losing focus closes.
- **The first option is "Select"** (unless `clearable={false}`, for selects that always have a value): no value, checked while nothing is set, and picking it removes the value. A value set some other way that isn't in the list is still listed, right after it.
- **Icon variant** (`iconFor(value)`): an icon before the text, on the trigger and every option; `iconFor("")` for nothing set. Every option gets the slot, empty where a value has none, so labels line up.

## Values

[src/css](../packages/overlay/src/css). Editors parse, display and step values with `parseValue`, `displayValue`, `stepValue` ([css/values.ts](../packages/overlay/src/css/values.ts)), so every field accepts the same things. Don't write per-editor parsers.

- a bare number is px: `120` → `120px`;
- every CSS length unit (`px % em rem ch lh vw vh svw … cm mm in pt pc`);
- the property's keywords (`auto`, `fit-content`…) and the global ones (`inherit`, `initial`, `unset`, `revert`, `revert-layer`);
- functions as typed: `min()`, `max()`, `clamp()`, `var()`…;
- **math without `calc()`**: `100% - 20px`, `50%+2rem`, `100vw/3` are wrapped in `calc()` with the spaces CSS requires. Typing `calc(…)` works too, but fields show the value without it (`displayValue`), so designers learn they don't need it.

Values are checked against the grammar, then by the browser (`CSS.supports`). `stepValue` keeps the unit, steps keywords and empty fields from the computed px, leaves math alone, and never goes below 0 unless the property allows negatives.

**Kinds** (`kind` in [css/properties.ts](../packages/overlay/src/css/properties.ts)), each with its own grammar in the same functions:

- **length** (the default);
- **integer** (`order`, `z-index`): whole numbers, no unit, negatives where allowed;
- **number** (flex-grow, flex-shrink): no unit, decimals allowed, never negative;
- **percent** (opacity): 0–100; `50` or `50%` write `50%`, a fraction typed with a point (`0.5`) is its share of 100, and the page's `0.5` (Tailwind's `opacity-50`) shows as 50;
- **line-height**: a bare number stays unitless (`1.5`, not `1.5px`) and steps by tenths;
- **font-family**: the names as typed, case kept, commas normalized; not stepped;
- **ratio** (aspect-ratio): `4/5`, `4 / 5` and `4:5` write `4 / 5`; one number (`1.5`) is that ratio to 1;
- **grid-line** (`grid-column-start`/`-end`, `grid-row-start`/`-end`): a line (`2`, `-1`, never 0: lines count from 1, or from -1 at the end), `span N`, or `auto`. ↑/↓ skip 0;
- **grid-span** (`grid-column` and `grid-row`, the col-span and row-span fields): a count writes `span N / span N`, like Tailwind's `col-span-N`, and `full` writes `1 / -1`. Shown back as `N` and `full` (also `2 / span 3` → `3`). An explicit `2 / 4` is kept as typed. ↓ on an empty field writes nothing.

**The property database** ([css/properties.ts](../packages/overlay/src/css/properties.ts)) holds, per property, its initial value, keywords, whether negatives are valid, and its kind. Add an entry whenever an editor starts writing a new property.

## The editors

What each one decides beyond the shared pieces. Their order in the list is `LIST_ORDER`; their files are under [src/editors](../packages/overlay/src/editors).

### Layout

- **Display** (`display/`): a `revealEditor` select (block, inline-block, inline, flex, inline-flex, grid, inline-grid, contents, none; Tailwind's display utilities are its aliases, `hidden` included). `grid`/`inline-grid` reveal grid-columns, grid-rows, gap, justify-content, justify-items, align-items, align-content; `flex`/`inline-flex` reveal flex-direction, flex-wrap, gap, justify-content, align-items, align-content (justify-items does nothing in flex). Each row writes its own property, so each change is its own undo step, and undoing back past `grid` hides the rows. It shows the declared `display`, so a grid through its stylesheet shows its grid rows. `flex` alone finds display. While display is `-webkit-box` (line-clamp sets it), the menu offers it before `none` (`displayOptions()`); it isn't offered otherwise, since nobody picks it on its own.
- **Width, min-width, max-width** (`width/`) and **height, min-height, max-height** (`height/`): `lengthEditor`s with a drag handle. `w` and `width` bring the family; `min-w` finds just min-width; `min` finds min-width and min-height. Typing `auto` makes it explicit, so it shows as a value.
- **Size** (`size/`): Tailwind's `size`, width and height as two rows. Only `size` finds it: width and height are its `embeds`. From the search it lands on width with height linked, like `px` on padding (`LengthLink`: what's typed shows in both, Enter writes both as one undo step). The link lasts while focus stays on width; arrows and drags change one row. It writes nothing of its own, so it isn't in the empty-search list.
- **Aspect ratio** (`aspect-ratio/`): a `presetEditor` with the common ratios (`1 / 1`, `4 / 3`, `3 / 2`, `16 / 9`, `21 / 9`, their portrait versions, `auto`) and custom (placeholder `x/y`), which writes nothing until a ratio is typed. A listed ratio set some other way (`16/9`, `1`) shows as that option. Found by `aspect` and Tailwind's `aspect-auto`, `aspect-square`, `aspect-video`.
- **Padding** (`padding/`) and **margin** (`margin/`): `sidesEditor`s, one value or each side. Margin allows negatives and `auto` (`mx` + `auto` centers).
  - **One value** takes one value, not the shorthand's list (`12px 16px` isn't accepted), and writes the shorthand. When the sides differ it reads "Mixed", and a value typed there sets them all. Clearing it clears every side as one undo step.
  - **Each side**: four fields, each writing its own property.
  - **Which view: the search decides as you type**, before Tab. A side (`pt`, `ps`/`pe`, `padding-top`, `padding-inline-start`…) or a pair (`px`/`padding-inline` lands on right, `py`/`padding-block` on top) shows each side and Tab lands there. `p` shows the one value. Anything else (`padding`, nothing typed) keeps the view, which opens on each side when the sides differ.
  - A value typed in a pair sets both sides (one undo step) while focus stays on that field; the other field mirrors it.
  - Logical names assume horizontal, left-to-right text, as declared values do.
  - Tab goes through the sides, then on. The view button isn't a Tab stop: the search switches views from the keyboard. It changes nothing on the page.
  - Clearing a side after setting the one value shows the page's own value for that side (`revert-layer` in the preview).
  - Hovering or focusing a field stripes its area on the page.
- **Box sizing** (`box-sizing/`): border-box, content-box; Tailwind's `box-border`, `box-content`.
- **Float** (`float/`): left, right, inline-start, inline-end, none; Tailwind's `float-left`, `float-start`… Listed right after display, since both decide how the element sits in the flow.
- **Overflow** (`overflow/`): visible, hidden, clip, scroll, auto. It writes the shorthand, so a page value on one axis only (`overflow-x`) isn't shown.
- **Overscroll** (`overscroll/`, labeled `overscroll`, writes `overscroll-behavior`): auto, contain, none. Like overflow, it writes the shorthand.
- **Order** (`order/`): an integer, negatives too.
- **Align self, justify self** (`align/SelfEditors.tsx`): where one item sits in its own area, over its parent's align-items / justify-items: auto, then the parent's values (align-self adds baseline). Listed with the item's own properties, after order, not revealed by anything. auto's icon is the centered one in `--plt-color-contrast-low` (the owner's call). justify-self only works in a grid. Tailwind's `self-*`, `justify-self-*`.
- **Flex grow, flex shrink, flex basis** (`flex-item/`): grow and shrink are `presetEditor`s with `0`, `1` and custom; basis is a length with a drag handle, or a size keyword. Tailwind's `grow`, `shrink`, `basis`.
- **col-span, col-start, col-end** (`grid-column/`): where a grid item sits, named the Tailwind way; `col` finds all three (`cols` is grid-columns). col-span writes `grid-column` (the grid-span kind); col-start/col-end write `grid-column-start`/`-end`. They share `grid-column`, so the latest edit wins where they overlap: set col-span first, then col-start, for "start at 2, span 3" (`2 / span 3`). Undo restores each end exactly.
- **row-span, row-start, row-end** (same file): the same on the rows, writing `grid-row`, `grid-row-start`/`-end`; Tailwind's `row-span`, `row-start`, `row-end`.
- **Object fit** (`object-fit/`): cover, fill, contain, scale-down, none. Icons per value, the owner's.
- **Object position** (`object-fit/`, a `presetEditor`): Tailwind's nine positions (`top left` … `bottom right`, aliases `object-top-left`…), and custom for any other: up to four parts, side keywords, lengths and percentages (`25% 75%`, `right 10px bottom 20px`), the `position` kind. Tailwind's `_` for spaces (`25%_75%`, from `object-[25%_75%]`) is read as a space, so a class pasted from the code works. A preset written in the other order (`left top`) shows as custom. Icons: top left and custom are the owner's; the other eight move top left's box on a 3×3 grid (derived).

### Grid and flex rows

- **Grid columns** (`grid-columns/`, labeled `grid-columns`, writes `grid-template-columns`; found by `grid-cols`, `grid-columns`, `cols`): a mode select ([TracksRow](../packages/overlay/src/editors/grid-columns/TracksRow.tsx)) plus a field for the modes that take one.
  - **repeat** (the default): a column count. With nothing declared, it shows repeat and `1`, CSS grid's own default, without writing anything. `3` writes `repeat(3, minmax(0, 1fr))`, equal columns that can shrink below their content, and shows `3` back. ↓ at the default writes nothing.
  - **custom:** any `grid-template-columns` (`1fr 2fr`), starting from the current value. Writes nothing until a value is typed; the row remembers the mode until then.
  - **subgrid, none:** written when picked. Picking repeat after them writes `repeat(1, …)` explicitly, since it may need to override a stylesheet. No "Select" option (`clearable={false}`).
  - The mode is read back from the value: Pilot's own `repeat(n, minmax(0, 1fr))` is repeat, anything else not `subgrid`/`none` is custom.
- **Grid rows** (`grid-rows/`, labeled `grid-rows`, writes `grid-template-rows`; found by `grid-rows`): the same row (`TracksRow` with `axis="rows"`), after grid-columns. One difference, the default: with nothing declared the count is empty, with `auto` as its placeholder, since a grid with no rows set makes as many as its items need, sized by their content. So `1` is written when typed (one explicit row isn't the default), ↑ on the empty count writes 1 and ↓ writes nothing.
- **Gap** (`gap/`): a `splitEditor` with `row-gap` and `column-gap`; one value writes `gap`. `gap-y`/`row-gap` split and land on the row gap, `gap-x`/`column-gap` on the column gap (Tailwind's `gap-x` is column-gap). `gap` lands on the one value even when they differ, like `p`. ↑/↓ or a drag on an empty field start from 0 (`normal` isn't a length). Both parts also come from a `gap` shorthand the browser can't expand (`gap: var(--space)`, `sourcesOf()`).
  - **On the page**, the gaps are striped on top of the selection and grid lines: one value stripes both (row gaps cut where column gaps cross, so crossings aren't striped twice), each part only its own (`gapRects(grid, axes)`). **Flex containers** get the same stripes from where the items are ([dom/flexGaps.ts](../packages/overlay/src/dom/flexGaps.ts)): items overlapping on the cross axis form a line; the main-axis gap is striped between neighbors as tall as the line, the cross-axis gap between wrapped lines; each stripe is the gap's own size, centered in the space between the items.
- **Justify content** (`justify/`): start, end, center, space-between, space-around, space-evenly; found by `justify` and Tailwind's `justify-*`. **Align items** (`align/`): start, center, end, stretch, baseline; found by `items` and `items-*`. Icon selects; a value set some other way (`flex-start`, `normal`) still shows, without an icon.
- **Justify items** (`justify/`, grid only): align-items' values on the other axis, without baseline (Tailwind has none); Tailwind's `justify-items-*`. **Align content** (`align/`, a grid's rows or a wrapping flex container's lines): justify-content's values on the other axis, plus stretch; Tailwind's `content-*`. Rows of display, after the property they pair with (justify-content → justify-items, align-items → align-content).
- **Flex direction** and **flex wrap** (`flex/`): keyword selects with icons; Tailwind's `flex-row`, `flex-col`… and `flex-wrap`, `flex-nowrap`, `flex-wrap-reverse`.

### Position

- **Position** (`position/`): a `revealEditor` select (static, relative, absolute, fixed, sticky), with **inset** always shown as its row, set or not.
- **Inset** (`inset/`): a `sidesEditor` (`sideProperty` names the sides, which have no `inset-` prefix). Found by `inset`, `top`/`right`/`bottom`/`left`, `inset-x`/`inset-y` (a pair) and `start`/`end` (so those find inset before col-start and col-end). Negatives and `auto` allowed. No inset area is drawn on the page yet (none designed).
- **Z-index** (`z-index/`): an integer, negatives too, or `auto`; Tailwind's `z`. ↑/↓ from `auto` start at 0.
- **Isolation** (`isolation/`): auto, isolate.

### Appearance

- **Background color** (`color/`, labeled `bg-color`, since the full name doesn't fit): found by `background-color`, `background`, `bg-color`, `bg`; `color` still finds only the text color.
- **Border radius** (`border-radius/`): one value for every corner, a length or percentage, never negative. Found by `radius` and `rounded`.
- **Opacity** (`opacity/`): the percent kind; drags stop at 0 and 100.
- **Mix blend mode** and **background blend mode** (`blend/`, the second labeled `bg-blend-mode`): the blend modes (mix-blend-mode adds `plus-darker`, `plus-lighter`); Tailwind's `mix-blend`, `bg-blend`. `background` finds both background editors.
- **Border** is removed while its new component is designed; the old box diagram is gone too.

### Typography

[editors/typography](../packages/overlay/src/editors/typography/TypographyEditors.tsx), plus color. font-size, line-height, letter-spacing and text-indent have a drag handle; the others don't.

- **color** ([editors/color](../packages/overlay/src/editors/color/ColorEditor.tsx)): two fields sharing the value area as one box: the color with a swatch, and its opacity (0–100, with a drag handle). The swatch shows the computed color; with no color set it shows the "nothing set" icon. The color field shows hex, or how the page names the color (`var(--brand)`, `oklch(…)`), as written. Typing takes hex with or without `#` (3 to 8 digits) or any CSS color; a hex with alpha sets the opacity too. Written back as one value ([css/colors.ts](../packages/overlay/src/css/colors.ts)): `#000000`, `#00000080` below 100, or `color-mix(in srgb, var(--brand) 50%, transparent)` for a named color. Clearing the color removes it; clearing the opacity makes it 100.
- **font-family**: Tailwind's `font-sans`, `font-serif`, `font-mono`.
- **font-size**: a length, percentage or size keyword; Tailwind's `text`.
- **font-style**: normal, italic, oblique; `italic`, `not-italic`.
- **font-weight**: a `presetEditor` with 100–900 and custom, for a variable font's in-between weights (`450`) or a keyword; `font-thin` … `font-black`. Each weight shows its name after it, dimmed (`700 bold`), Tailwind's, since few people know the numbers by heart.
- **line-height**: ↑ and drags from nothing set start at 1.2, about what `normal` is; a unitless value drags by 0.1 per pixel; Tailwind's `leading`.
- **letter-spacing**: a length, negatives too, or `normal`; `tracking`.
- **text-align**: an icon select (left, center, right, justify; `start` set some other way still shows); `text-left`… `text-end`. `text` alone finds font-size.
- **font-variant-numeric** (labeled `font-numeric`): one value from the select (`tabular-nums`, `slashed-zero`…); a combination set some other way still shows. Tailwind's numeric class names.
- **text-indent**: a length, negatives too; `indent`.
- **text-wrap**: wrap, nowrap, balance, pretty; `text-nowrap`, `text-balance`, `text-pretty`.
- **white-space**: normal, nowrap, pre, pre-line, pre-wrap, break-spaces; `whitespace`.
- **text-overflow**: clip, ellipsis; `text-ellipsis`, `text-clip`, `truncate`. Ellipsis shows only with `overflow: hidden` and `white-space: nowrap`, which it doesn't set: Tailwind's `truncate` is all three.
- **line-clamp** ([editors/line-clamp](../packages/overlay/src/editors/line-clamp/LineClampEditor.tsx)): a number of lines, or `none`. Browsers don't support the unprefixed `line-clamp` yet, so it writes what Tailwind's `line-clamp-3` does, as one undo step: `-webkit-line-clamp`, plus `display: -webkit-box`, `-webkit-box-orient: vertical` and `overflow: hidden` where they aren't set already. Cleared (or `none`), it clears those that still hold the clamp's values and leaves the page's own (`display: flex`). The page's line-clamp class shows as its number.
- `font` shows the four font-* editors; `size` finds the size editor, not font-size.

### Interactivity

[editors/interactivity](../packages/overlay/src/editors/interactivity/InteractivityEditors.tsx). **cursor** (the shapes, `pointer` and `text` first), **pointer-events** (auto, none), **user-select** (auto, text, all, none; Tailwind's `select`), **appearance** (auto, none). **will-change** is a `presetEditor`: Tailwind's four (auto, scroll-position, contents, transform), and custom for any property names (`opacity, transform`, the `idents` kind). Tailwind names the others after the property, so they have no aliases.

### SVG

[editors/svg](../packages/overlay/src/editors/svg/SvgEditors.tsx): **fill** and **stroke** are color editors that also take `none` (no opacity then); **stroke-width** is a length (`2` is 2px) with a drag handle. The swatch shows the paint applied: `currentcolor` shows the text color. Tailwind's `stroke-2` would collide with stroke's name, so stroke-width has no alias.

### Visibility

- **Visibility** (`visibility/`): visible, hidden, collapse; `visible`, `invisible`, `collapse`. Mask, clip-path and other properties about what's drawn will join this group.

## Icons

Icons are in `ICONS` ([Icon.tsx](../packages/overlay/src/ui/components/Icon/Icon.tsx)), used through `<Icon name="…" />`. Rules for adding the owner's icons are in [CLAUDE.md](../CLAUDE.md). Which ones are **derived** rather than designed (so the owner can replace them):

- flex-wrap: `flex-wrap-reverse` flips `flex-wrap`;
- flex-direction: `flex-row-reverse` and `flex-col-reverse` mirror `flex-row` and `flex-col`;
- inset: `inset-right`, `inset-bottom`, `inset-left` rotate `inset-top`, and `inset-all` puts the four together;
- gap: `gap-column` rotates `gap-row`;
- justify-content: the other values move justify-start's items;
- align-content turns justify-content's icons a quarter (stretch: the two items fill the height), and justify-items turns align-items';
- align-self and justify-self show align-items' tall item (or justify-items' wide one) alone; align-self's baseline reuses align-items';
- text-align: left and right are derived from center.
