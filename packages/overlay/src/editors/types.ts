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
  /** Extra search terms ("transparency", "fade"...). */
  keywords?: string[];
  component: ComponentType<PropertyEditorProps>;
}

export interface PropertyEditorProps {
  /** The element being edited. */
  element: EditableElement;
  /** Current values (computed style, or the pending edit) for `properties`. */
  values: Record<string, string>;
  /** Preview a value: Pilot applies it as an inline style and records the change. */
  onChange(property: string, value: string): void;
}
