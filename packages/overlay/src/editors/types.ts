import type { ComponentChildren, ComponentType } from "preact";
import type { BoxArea } from "../dom/boxModel.ts";
import type { EditableElement } from "../dom/target.ts";

/**
 * A property editor: the control shown when the designer searches for a CSS
 * property (e.g. typing "opa" surfaces the opacity editor).
 *
 * Editors are first-party: they ship with Pilot and define its look and
 * behaviour. End users pick them through search, they don't customise them.
 */
export interface PropertyEditor {
  /** Stable id, e.g. `opacity`. */
  id: string;
  /**
   * The editor's name ("Column span"). Searched like `properties` and
   * `aliases`: those three are all the search looks at (no extra keywords).
   */
  label: string;
  /** CSS properties this editor writes, in kebab-case. */
  properties: string[];
  /**
   * Tailwind's class names for it, which match exactly and rank first: `p`,
   * `pt`, `px`… for padding, `col-span` for grid-column. Also the row's label
   * when it's neither the property nor the editor's name (`grid-columns`).
   * Only those: no made-up shortcuts.
   */
  aliases?: string[];
  /**
   * The id of the editor this one belongs with (min-width → "width"). A search
   * that lands on that editor shows the whole family; a search that lands on
   * this one shows just it.
   */
  family?: string;
  /**
   * Editors this one shows as rows of its own (display shows justify-content
   * and align-items under grid). Their properties are read and written through
   * this editor (`values`, `declared`, `onChange`), but don't make it match
   * the search: searching for them finds the embedded editor on its own.
   */
  embeds?: PropertyEditor[];
  /**
   * Listed (with nothing searched) when one of its `embeds` has a value too, not only one of its own properties:
   * an editor that holds others (transform's panel: translate, rotate, scale), which then aren't listed on their own.
   */
  listsEmbeds?: boolean;
  /**
   * Other properties it reads, and writes along with its own (line-clamp sets
   * display and overflow). Fed to it like `properties`, but neither the search
   * nor the list of set properties counts them as its own: searching
   * `display` doesn't find line-clamp.
   */
  reads?: string[];
  component: ComponentType<PropertyEditorProps>;
}

/** Every property an editor reads: its own, its `reads`, then its embedded editors'. */
export function propertiesOf(editor: PropertyEditor): string[] {
  return [...editor.properties, ...(editor.reads ?? []), ...(editor.embeds ?? []).flatMap(propertiesOf)];
}

export interface PropertyEditorProps {
  /** The element being edited. */
  element: EditableElement;
  /**
   * Computed values for `properties`. Never shown in fields: they're only
   * where steps and drags start from (and what overlays measure).
   */
  values: Record<string, string>;
  /**
   * What fields show: the declared value for each of `properties`, the CSS
   * that actually applies to the element from any source (stylesheets,
   * Tailwind classes, inline styles, Pilot's edits), as written (`50%`,
   * `var(--space-4)`), or "" when nothing declares it. See dom/declared.ts.
   * Read it with `declaredOf()` (editors/declared.ts).
   */
  declared?: Record<string, string>;
  /**
   * Properties whose value differs across the selected elements (several
   * selected, see PropertyDialog's `others`): their `declared` value is ""
   * and their field reads "Mixed". A change sets it on all of them. Read it
   * with `isMixed()` (editors/declared.ts).
   */
  mixed?: ReadonlySet<string>;
  /**
   * Properties whose `declared` value only a reset gives (a rule for every
   * element, `*`: Tailwind's preflight `border: 0 solid`), not the element
   * nor Pilot. An editor may show them as not set (border's style does).
   * Read it with `isFromReset()` (editors/declared.ts).
   */
  reset?: ReadonlySet<string>;
  /**
   * Apply a value: Pilot records it in the undo history (Cmd/Ctrl+Z) and
   * shows it on the page (the preview stylesheet). Editors never write
   * `element.style` themselves. An empty `value` clears it: the element
   * doesn't set the property (a removal when the page's CSS does, see
   * edits/clear.ts).
   * For a continuous interaction (a drag), pass the same `gesture` object on
   * every change so the whole interaction is undone in one step.
   */
  onChange(property: string, value: string, options?: { gesture?: object }): void;
  /**
   * Take back what the ongoing `gesture` did to `property`, restoring exactly
   * what it was before (e.g. releasing Alt un-mirrors the opposite side).
   * Better than re-applying the old number, which would leave a fake edit.
   */
  onRevert?(property: string, gesture: object): void;
  /**
   * Set, as a new object each time, when the designer moves from the search
   * into this editor (Tab or Enter). `query` is what they typed (trimmed,
   * lowercase), so the editor can focus the matching part: `pt` → top side.
   */
  focusRequest?: FocusRequest;
  /**
   * What's typed in the search right now (as typed; "" when nothing is), live,
   * not only when focus moves in: an editor may adapt its view to it before
   * Tab (padding shows each side for `px`). Focus still waits for focusRequest.
   */
  query?: string;
  /**
   * Give focus back to the search so the next property can be typed: after
   * Enter on a value, or Tab/Shift+Tab past the editor's last/first field.
   * (Esc is handled by the dialog: it always returns to the search.)
   */
  onReturnToSearch?(): void;
  /**
   * Tab moved past the editor's last field (1) or Shift+Tab before its first
   * (-1): the dialog moves on to the next/previous editor, or the search.
   */
  onTabOut?(direction: 1 | -1): void;
  /**
   * Replace the dialog footer's helper message while something editor-specific
   * is going on (e.g. "Hold Alt to change both sides" during a drag). Pass
   * null to go back to the dialog's default message.
   */
  onHint?(hint: ComponentChildren | null): void;
  /**
   * Show these areas of the element on the page (e.g. the padding sides being
   * hovered or dragged) instead of the selection highlight. Pass null to go
   * back to the normal highlight.
   */
  onInspect?(areas: BoxArea[] | null): void;
}

/**
 * Why an editor should take focus: the designer moved in from the search
 * (`query` is what they typed: `pt` → top side), or tabbed in from the
 * previous/next editor (`edge`: focus the first or last field).
 */
export interface FocusRequest {
  query: string;
  edge?: "first" | "last";
}
