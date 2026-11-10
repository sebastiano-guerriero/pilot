import type { ComponentType } from "preact";
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
   * For a continuous interaction (a drag), pass the same `gesture` object on
   * every change so the whole interaction is undone in one step.
   */
  onChange(property: string, value: string, options?: { gesture?: object }): void;
  /**
   * Set, as a new object each time, when the designer moves from the search
   * into this editor (Tab or Enter). `query` is what they typed (trimmed,
   * lowercase), so the editor can focus the matching part: `pt` → top side.
   */
  focusRequest?: { query: string };
  /**
   * Give focus back to the search so the next property can be typed: after
   * Enter on a value, or Tab/Shift+Tab past the editor's last/first field.
   * (Esc is handled by the dialog: it always returns to the search.)
   */
  onReturnToSearch?(): void;
}
