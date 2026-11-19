# Edits: recorded, shown, handed off

How a change goes from an editor to the agent. Pilot never edits source files and never touches the elements' own `style`: it records plain-CSS intent, shows it through a stylesheet of its own, and hands it to the agent as a change set.

## The history

[edits/history.ts](../packages/overlay/src/edits/history.ts). **Every property change must be undoable**, so every one goes through `EditHistory`: editors call `onChange(property, value, { gesture })` and never write styles themselves. The history:

- records the change (element, property, value, widths, states, removal) and rebuilds the **preview** from every change in effect. Nothing is restored on undo: the undone change is just left out;
- lets a change replace Pilot's earlier ones it covers for the same element, widths and states: the same property, or a longhand of it (`padding` replaces `padding-top`, `grid-column` replaces `grid-column-start`). A change to `""` drops Pilot's value;
- groups a continuous interaction into one undo step: every change with the same `gesture` object is one step, so a drag passes the same token on each move;
- skips no-op changes (setting what Pilot already sets for those widths, or `""` where it sets nothing);
- can `revert()` one property of the ongoing gesture (dropping the step if nothing is left), behind the editors' `onRevert`;
- answers what Pilot sets at a width (`valueOf()`, a longhand read out of a shorthand) and whether a property is removed there (`removalOf()`), for the fields, and lists the changes in effect (`changes()`: one per element, property, range and states) for the change set.

**Cmd/Ctrl+Z** undoes and **Cmd/Ctrl+Shift+Z** / **Ctrl+Y** redoes, handled in `App`, across selections, unless there's nothing to undo or redo or the user is typing in one of the page's own fields (or a comment, where they undo the text).

The history belongs to `mountPilot` (one per page load), not the UI, so quitting and relaunching keeps it.

## The preview

[dom/preview.ts](../packages/overlay/src/dom/preview.ts). Each edited element gets a `data-pilot-edit` id, and each change in effect becomes a rule in a `<style data-pilot-preview>` that Pilot puts first in the document's head (or the element's shadow root), in the order the changes were made:

```css
@layer pilot-preview {
  [data-pilot-edit="1"] { padding-top: 4px !important; }
  @media (min-width: 960px) { [data-pilot-edit="1"] { padding-top: 30px !important; } }
}
```

- **Widths:** a change for some widths sits in `@media` with `min-width`/`max-width`, both ends included, so resizing shows each range's changes in their range and the page's CSS elsewhere. Among Pilot's rules the later wins, so a later change for every width wins in every range. This is why the preview is a stylesheet and not inline styles: resizing shows the truth.
- **It wins over the page's CSS:** every declaration is `!important`, in a layer declared before any of the page's (the sheet comes first), and important declarations in the first layer beat every other stylesheet's, layered (Tailwind v4's `!p-4`) or not. The one thing it can't beat is the app's own `style` attribute with `!important`.
- **States** go in rules for those states (`[data-pilot-edit]:hover`), and are drawn unconditionally while their pills are set ([property-dialog.md](property-dialog.md), *States*).
- **Values** are written by the browser (a scratch style declaration), so one it doesn't accept is left out.
- An element loses its `data-pilot-edit` when it has no rules left, and the sheet is emptied when there are none.
- Tests can give `EditHistory` another `Preview` ([test/inlinePreview.ts](../packages/overlay/src/test/inlinePreview.ts) writes inline styles, ignoring widths) to read what an edit did from `element.style`.

## Declared values

[dom/declared.ts](../packages/overlay/src/dom/declared.ts). What fields show: for each of an editor's properties, Pilot's own value at the window's width (`EditHistory.valueOf()`), else the winning declaration of the page's own CSS: its stylesheets, Tailwind classes and the app's inline styles (`fieldValues()` in the dialog), as written (`50%`, `var(--space-4)`), or nothing when nothing declares it. Pilot's preview sheet is left out of the walk (`isPreviewSheet()`): its edits come from the history, which knows them exactly.

- **Matching rules.** It walks the stylesheets of the element's root (the document or a shadow root, adopted sheets included) in document order, following `@import`, and keeps style rules whose selector matches the element and whose conditions hold: `@media` via `matchMedia`, `@supports` via `CSS.supports`, `@scope`'s start. Nested rules are resolved (`&`, descendants of the parent selector).
- **The cascade.** `!important` beats normal; then inline styles beat rules; then `@layer` order (later layers and unlayered styles win normal declarations, the order flips for important ones, styles directly in a layer beat its sub-layers); then specificity (`:is`/`:not`/`:has` take their most specific argument, `:where` counts nothing); then order of appearance.
- **Shorthands and logical properties.** A side also comes from its logical longhand (`padding-inline-start`), the logical pair (`padding-inline`, which Tailwind's `px-4` writes) and the shorthand (`padding: 10px 18px`), assuming horizontal, left-to-right text. CSSOM can't expand a shorthand containing `var()`, so its text is split by hand: `calc(var(--spacing) * 4)` applies to every side.
- **Cost.** One walk is shared by all the editors in a render, cached, and refreshed when the stylesheets or the element's classes change. About 3ms per thousand rules.
- **Known gaps.** `@container` conditions can't be evaluated from script, so those rules are skipped. `@scope`'s end bound is ignored. Cross-origin stylesheets can't be read. The browser's own styles aren't visible, so a `<ul>`'s default padding counts as nothing declared. The app's `style` attribute with `!important` wins over the preview.

## Removing a value

[edits/clear.ts](../packages/overlay/src/edits/clear.ts). Clearing a field means "this element doesn't set this property", never `0`, `none` or the default. Editors pass `""`, and the dialog's `clearProperty()` decides:

- **When only Pilot set the value**, clearing just drops Pilot's edit: there's nothing to remove.
- **When the page's CSS sets it** (a stylesheet rule, a Tailwind class, the app's own `style` attribute), Pilot records a **removal**: `{ property, from, to: "", removed: true, source }`, where `source` (`StyleSource`) says where the page declares it: the `style` attribute, or a rule's selector with how many elements on the page it matches. `formatPrompt()` marks the row *removed* and tells the agent to stop declaring it for this element, and for a rule other elements share, to remove it for this element only unless the designer's note says otherwise.
- **The field is empty**, the Pilot way of saying no value is set.
- **The page previews the fallback:** the next declaration in the cascade (`declaredWithout()` leaves the removed rule out), or `revert` when no other rule declares it. `revert` falls back to the browser's own styles (a list's padding, a heading's margins), which Pilot can't read, and otherwise to the inherited value or the default; `unset` would skip the browser's styles and show a wrong preview. The fallback is only for the preview: the agent gets "don't declare it here" and the removed value (to find the declaration), never the fallback, which the cascade gives anyway. For a value from the `style` attribute, the preview is the stylesheets' value.
- The page's own value is the declared one, and the preview sheet is left out of declared values: setting `20px` over a stylesheet's `16px` and then clearing removes the `16px`.
- With the width chip set, the removal is for those widths (`removalOf()` looks at the window's width).
- It's undoable like any change, and typing a value afterwards replaces it.

Once the agent applies it, the page's CSS no longer sets the property, and the field is empty for the same reason it is now.

## Widths

A change made with the width chip set carries `widths: { min?, max? }` (`WidthRange`: CSS px, both ends included); without one it has none and is for every width. Editors don't handle widths: the dialog passes the chip's widths to `history.apply(…, { widths })` and `clearProperty(…, widths)` for every editor.

`formatPrompt()` gives every change a Widths column (`from 1200px`, `to 767px`, `768–1199px`, `1108px only`, `every width`, worded by `describeWidths()`, which the chip uses too). It tells the agent to use the project's breakpoints when one matches (or is within a few pixels), else a custom media query, and that "every width" means no media query should override the value. When the old value comes from a rule inside `@media`, `StyleSource.media` holds the condition (`mediaOf()`), and the prompt says where it sits today. Pilot shows breakpoints as widths; the agent names them.

## States

Changes record the state pills' `states` the same way, through `history.apply(…, { widths, states })` / `clearProperty(…, widths, states)`; fields read values for exactly those states. Editors don't handle states either. The prompt adds a State column (only when a change has one) and tells the agent to use the project's form (`hover:`, `:hover`). Pilot can't put an element in a real hover or focus to measure it, so a state change is accepted on the agent's word after done (`unchecked`).

## Text changes

[dom/text.ts](../packages/overlay/src/dom/text.ts). Text edited inline ([page.md](page.md)) is one of the two non-CSS changes; the other is the DOM's own (below).

- What's edited is a **text run**: the text between an element's child elements, its text nodes in a row (a comment between them, like React's `<!-- -->`, doesn't break it). A text-only element has one run, its whole text.
- Each run is recorded in the history like a CSS change, under a reserved property (`textProperty(run)`: `text` for run 0, `text:1`, `text:2`…), with no widths or states: undo, reloads, Send, jobs and the check after done work the same, each run on its own.
- The change set gives them as the edit's `texts: [{ from, to }]` (whitespace runs as one space, trimmed), apart from the CSS changes; `from` is the page's own text, or the one it had when changed while the element isn't on the page. The prompt lists them under *Text (from → to)* and tells the agent to change the copy where it comes from (the markup, a prop, a translation file) for this element only.
- **The text preview** is the only place that writes an element's text. CSS can't replace text, so it writes into the run's own text nodes (the first gets the text, the others are emptied), **never replacing or removing them**: a framework that holds them still finds them, and the runs keep their places. A MutationObserver on those elements takes what the page writes into them (a re-render, hot reload after the agent's edit) as its own text and shows Pilot's over it again.
- That's what the check compares: a text change landed when the page's own text in that run is the designer's (whitespace aside).
- Descriptions (`describeElement()`'s snippet, an ancestor's too) use the page's own text, so the agent greps for what's in the source.
- **Known limits:** a run is found by its place among the element's runs, so a re-render that adds or removes child elements before it can shift it. A server-rendered page hydrating after Pilot restores a text change may log a hydration mismatch; the framework re-renders and the observer takes the new nodes in.

## DOM changes

[dom/structure.ts](../packages/overlay/src/dom/structure.ts), the actions in [edits/structure.ts](../packages/overlay/src/edits/structure.ts). The DOM tree's row menu ([page.md](page.md), *The DOM tree*) deletes elements and adds them: Duplicate, Add child, Add sibling.

- **Recorded like CSS changes**, under reserved properties (`DOM_REMOVE`, `DOM_INSERT` in [protocol/src/types.ts](../packages/protocol/src/types.ts)): `dom:remove` on a deleted element; `dom:insert:<id>` on the element a new one goes after or inside, with what it adds as the value (the new element's markup, where it goes, how many of the page's own elements its parent had). Each action is one undo step, for every element it acts on; undo, reloads, Send, jobs and the check work as for any change.
- **The page's own nodes are never removed or moved.** A framework (React, Vue…) keeps hold of the nodes it rendered, and the next re-render would fail on one that isn't where it left it. So a deleted element is only hidden, by the preview stylesheet (`display: none`, after every other rule of Pilot's), and a new element is **one of Pilot's own nodes** (`data-pilot-new`), put next to the page's: right after its element, after the ones added there before, or as its last child. A re-render that takes one out (its parent replaced) gets it put back, by a MutationObserver.
- **Duplicate** copies the element as the page shows it, children and Pilot's text changes included, without Pilot's marks, ids (two elements with one id would break the page's selectors) or the children deleted in it. Pilot's CSS changes to it and its children are copied onto the copy in the same undo step, so it looks the same; from then on they're apart, as copies in a design tool are. **Add child** and **Add sibling** add an empty `div` (picking its tag is next, with double-click editing).
- **Deleting a new element takes it back** (its insert dropped, one undo step): it was never in the code, so there's nothing to tell the agent.
- **Selectors leave Pilot's nodes out.** A copy shifts the page's own elements (the third item is no longer the third child), so the history's selectors are taken, and looked up after a reload, with Pilot's nodes out of the page for that moment (`withoutInserted()`); the text an element is described by leaves them out too. An element inside a new one is found from it: `[data-pilot-new="…"] > h2:nth-child(1)`. After a reload, the history makes the new elements again from their markup before it finds anything (`EditHistory.load()`).
- **The change set:** a deleted element's edit is `removed` (its other changes, and everything inside it, are left out); elements added after or inside an element are its `inserts`, named `new-1`, `new-2`… in the order added (`kind`: a copy or a new element, its tag); the edits of a new element, or of what's inside it, say which (`newElement`), and give no selector, which would be Pilot's own. The prompt says *Deleted*, and *Added*: where and what, and the edit guidelines say how: markup removed or added where the code writes it (or an item in the data a list renders), never CSS that hides it.
- **The check** ([edits/verify.ts](../packages/overlay/src/edits/verify.ts)): a deletion landed once the page no longer has the element. A new element landed once its parent has more of the page's own elements than it had when the element was added: one more per new element in the job, one fewer per deleted element that's gone, a count, not a match, since the agent writes its own markup. Changes on a new element (or inside it) follow its insert: Pilot's node goes when it lands, and they go with it. What didn't land goes back in the follow-up, in words ("deleted by the designer, but it's still on the page").
- **Known limits:** an element's later changes, made after its insert was sent, stay on Pilot's node, which goes when the insert lands, so they go with it. Comments and tasks on a new element point at something the code doesn't have yet. Pilot's nodes are static copies: no event handlers, no component state. A server-rendered page hydrating after Pilot restores them may log a hydration mismatch, as for text changes.

## The change set

`ChangeSet` in [protocol/src/types.ts](../packages/protocol/src/types.ts): page URL, viewport, an optional designer note, and per element its target and `{ property, from, to }` changes (with widths, states, removals), plus `texts`. `buildChangeSet()` ([edits/changeSet.ts](../packages/overlay/src/edits/changeSet.ts)) builds it from the history: per element, the page's own `from`, `to`, removals, widths and states.

**The target** comes from `describeElement()` ([dom/target.ts](../packages/overlay/src/dom/target.ts)):

- a selector guaranteed to match only that element, preferring ids and adding `:nth-of-type()` only where siblings would be ambiguous;
- a readable path like `main > section.hero > h1` (classes help the agent find it);
- a trimmed text snippet the agent can grep for.

**The prompt.** `formatPrompt()` ([protocol/src/format.ts](../packages/protocol/src/format.ts)) turns it into a Markdown brief that tells the agent to map the values to the project's conventions (no inline styles), prefer existing tokens and utilities and report any value it had to approximate, and ask before changing a shared component everywhere. **Copy prompt and the MCP path produce identical text**: both go through `formatPrompt()`, fed by `buildChangeSet()`.

## Edits survive reloads

[edits/persist.ts](../packages/overlay/src/edits/persist.ts). The history (changes, undo and redo) is saved in the tab's `sessionStorage` after every change and restored when Pilot mounts again: after a reload the preview comes back, undo still works, and Copy prompt still has everything. A new tab starts clean.

- Each change keeps how to find its element (its unique selector, taken at the first change) and the page it was made on. Anything new the history records must be plain data (JSON-safe) apart from the element, and found again from the change's `target` after a reload.
- On restore, an element found on this page gets its changes back. One that isn't (another page of the app, or not rendered yet) keeps its changes on a detached stand-in, still in the prompt, and finds its element again later (`reattach()`: on launch, on selecting an element, on `popstate`).
- **Known limit:** an element whose selector changed (a list reordered, classes renamed) can't be found again.

**No Clear changes button.** `EditHistory.clear()` still exists (undoable), but the designed toolbar left the button out: with an agent, Pilot clears what landed by itself; after a copied prompt is applied, undo removes the changes.
