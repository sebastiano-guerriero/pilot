/** Options for mountPilot (all optional). */
export interface PilotOptions {
  /**
   * Launch Pilot as soon as it mounts. Default: false: Pilot stays dormant
   * until the shortcut launches it. A launch or close in the current browser
   * tab takes precedence, so reloads keep what the user chose.
   */
  launch?: boolean;
  /**
   * The keyboard shortcut that launches Pilot: modifiers and a key joined by
   * `+` (`alt+p`, `ctrl+shift+e`). Default `alt+p` (Option+P on a Mac).
   * `false` turns it off.
   */
  shortcut?: string | false;
  /**
   * Data attributes this project names its elements with (e.g.
   * `["data-block"]`), tried first when Pilot labels an element.
   */
  nameAttributes?: string[];
  /**
   * The project this page belongs to: its package.json's name, written by
   * `npx usepilot init`. `npx usepilot` runs for its own project's pages only.
   */
  project?: string;
}

export interface PilotInstance {
  /** Show Pilot's toolbar. No-op if it's already running. */
  launch(): void;
  /** Close Pilot. Same as the toolbar's Close button. */
  quit(): void;
  readonly running: boolean;
  /** Remove Pilot from the page completely. */
  destroy(): void;
}

/**
 * Mount Pilot into the page (once; later calls return the same instance).
 * Invisible until launched. Does nothing on the server.
 */
export function mountPilot(options?: PilotOptions): PilotInstance;
