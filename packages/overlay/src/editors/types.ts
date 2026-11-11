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
  /** Label shown in search results. */
  label: string;
  /** CSS properties this editor writes, in kebab-case. */
  properties: string[];
  /**
   * Short codes that match exactly and rank first, Tailwind-style: `p`, `pt`,
   * `px`… for padding. They're how a designer who knows the utility names gets
   * to an editor in one or two keystrokes.
   */
  aliases?: string[];
  /** Extra search terms ("transparency", "fade"...), matched anywhere in the word. */
  keywords?: string[];
  /**
   * The id of the editor this one belongs with (min-width → "width"). A search
   * that lands on that editor shows the whole family; a search that lands on
   * this one shows just it.
   */
  family?: string;
  component: ComponentType<PropertyEditorProps>;
}

export interface PropertyEditorProps {
  /** The element being edited. */
  element: EditableElement;
  /** Current values (computed style, or the pending edit) for `properties`. */
  values: Record<string, string>;
  /**
   * Apply a value: Pilot sets it as an inline style and records it in the undo
   * history (Cmd/Ctrl+Z). Editors never write `element.style` themselves.
   * An empty `value` removes the property's inline value: back to the
   * default / stylesheet (e.g. the designer cleared the field).
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
