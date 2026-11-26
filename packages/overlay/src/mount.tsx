import { isLocalHost } from "@pilot/protocol";
import { render } from "preact";
import { isProbeFrame } from "./checks/widths.ts";
import { DEFAULT_BRIDGE_URL } from "./bridge/client.ts";
import { PilotSession } from "./bridge/session.ts";
import { persistentHistory, resolveTarget } from "./edits/persist.ts";
import { App } from "./ui/App.tsx";
import { registerFonts } from "./ui/fonts.ts";
import styles from "./ui/styles/index.css?inline";

export interface PilotOptions {
  /**
   * Launch Pilot as soon as it mounts. Default: false (Pilot stays dormant
   * until the shortcut, or `npx usepilot` starting, launches it). A launch/close from the current tab session
   * takes precedence, so reloads keep whatever the user chose.
   */
  launch?: boolean;
  /** Development aids for working on Pilot itself (e.g. in the playground). */
  dev?: PilotDevOptions;
  /**
   * Data attributes this project names its elements with (e.g.
   * `["data-block"]`), shown in the selection label before the common ones
   * (`data-testid`, `data-slot`…). See dom/name.ts.
   */
  nameAttributes?: string[];
  /**
   * The keyboard shortcut that launches Pilot, as modifiers and a key joined
   * by `+` (`alt+p`, `ctrl+shift+e`). Default `alt+p` (Option+P on a Mac).
   * `false` turns it off. Ignored while typing in the page's own fields.
   */
  shortcut?: string | false;
  /**
   * Where Pilot reaches the agents: the bridge's URL (the hub, in `npx
   * usepilot`, which runs the agent). Default `http://127.0.0.1:` + the bridge's port for this version (DEFAULT_BRIDGE_PORT). `false` turns it off: nothing
   * can be sent (the editor alone, for developing Pilot).
   */
  bridge?: string | false;
  /**
   * The project this page belongs to: its package.json's name, written by
   * `npx usepilot init`. `npx usepilot` runs for its own project's pages only,
   * so with several projects open (or another app with Pilot), each goes to
   * its own. Without it (a loader from before 0.15), Pilot runs for this page
   * only when started with its address (`--url`).
   */
  project?: string;
}

export interface PilotDevOptions {
  /**
   * Keep the property dialog on screen while designing it: on every page load
   * Pilot launches (ignoring a previous Quit), turns select mode on, selects
   * the first element matching this selector and opens the dialog next to it.
   */
  select: string;
  /** Pre-fill the dialog's search, e.g. "padding" to show that editor. */
  query?: string;
}

export interface PilotInstance {
  /** Show the toolbar. No-op if already running. Called when `npx usepilot` starts for the site (via the bridge). */
  launch(): void;
  /**
   * Close, the toolbar's last button: closes Pilot on the whole site (every
   * tab of it). Jobs go on (Pilot keeps running the agent for them); the
   * launch shortcut opens it again, as it hides it in this tab only.
   */
  quit(): void;
  readonly running: boolean;
  /** Unmount completely and remove listeners. */
  destroy(): void;
}

const HOST_TAG = "pilot-root";
const STORAGE_KEY = "pilot:running";
/** Hidden in this tab, while running (see setHidden). */
const HIDDEN_KEY = "pilot:hidden";

/**
 * Mount the Pilot overlay into the current page. Mounting is invisible:
 * Pilot stays dormant until launched (the shortcut, Alt+P by default, or
 * `launch()`). On the server it does nothing, and on a page that isn't on a
 * development address (isLocalHost: production) it does nothing either.
 *
 * The UI lives in a Shadow DOM so the host app's CSS can't leak in and
 * Pilot's CSS can't leak out. Calling it twice returns the same instance.
 */
export function mountPilot(options: PilotOptions = {}): PilotInstance {
  // On the server (an SSR framework rendering the module): nothing to mount.
  if (typeof window === "undefined" || typeof document === "undefined") return INERT;
  // One of Pilot's own frames, measuring the page at another width (checks/widths.ts).
  if (isProbeFrame()) return INERT;
  // Never on a server's page: only on a development address (this machine, a
  // local name, a private network). If the loader ever slipped into
  // production, Pilot stays out of it: no toolbar, no shortcut, no connection.
  if (!isLocalHost(window.location.hostname)) {
    console.warn(`Pilot only runs on a development address (localhost, *.test, a private network), not ${window.location.hostname}.`);
    return INERT;
  }
  const existing = (window as WindowWithPilot).__pilot;
  if (existing) return existing;

  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  // All Pilot UI renders in here; tokens.css declares the design tokens on it.
  const container = document.createElement("div");
  container.className = "root";
  shadow.append(style, container);
  document.documentElement.append(host);
  const unregisterFonts = registerFonts();

  let running = options.dev ? true : (readStoredRunning() ?? options.launch ?? false);
  // One history per page load, restored from this tab's last one: edits
  // survive reloads, quitting and relaunching (see edits/persist.ts).
  const history = persistentHistory();
  const reattach = () => history.reattach(resolveTarget);
  // The handoff to agents: Send, the jobs, and `npx usepilot` launching Pilot.
  const session = new PilotSession(history, {
    bridge: options.bridge ?? DEFAULT_BRIDGE_URL,
    project: options.project,
    onLaunch: () => instance.launch(),
    // A page opened while Pilot runs for the site: it opens by itself, unless closed in this tab.
    onAgentsArrived: () => {
      if (readStoredRunning() !== false) instance.launch();
    },
    // Closed on this site, in another tab: closed here too.
    onQuit: () => setRunning(false),
  });

  // Hidden: running, but out of sight in this tab (the shortcut, or the toolbar's Hide), everything kept as
  // it is: the selection, its panel with its search and pills, the edits on the page. A look at the page,
  // its hover and focus tried for real, and back to where you were. Remembered over reloads, like running.
  let hidden = running && (readStored(HIDDEN_KEY) ?? false);
  container.toggleAttribute("data-hidden", hidden);
  // Where the focus was (the search, a field), given back when it's back: typing goes on there.
  let focusBefore: HTMLElement | null = null;
  const setHidden = (next: boolean) => {
    if (hidden === next) return;
    hidden = next;
    store(HIDDEN_KEY, next);
    // Not a toolbar button (Hide, reached with Tab): given back, it held the focus, and Esc, which the
    // dialog handles in Pilot, did nothing there (the selection stayed, with its panel).
    const active = shadow.activeElement;
    if (next) focusBefore = active instanceof HTMLElement && !active.closest(".toolbar") ? active : null;
    container.toggleAttribute("data-hidden", next);
    draw();
    if (!next && focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
    if (!next) focusBefore = null;
  };

  const setRunning = (next: boolean) => {
    if (running === next) return;
    running = next;
    storeRunning(next);
    if (next) reattach();
    draw();
  };

  const draw = () =>
    render(
      running ? (
        <App
          host={host}
          history={history}
          session={session}
          dev={options.dev}
          nameAttributes={options.nameAttributes}
          onReattach={reattach}
          onQuit={() => instance.quit()}
          hidden={hidden}
          onHide={() => setHidden(true)}
          hideShortcut={shortcut ? (options.shortcut || "alt+p") : undefined}
        />
      ) : null,
      container,
    );

  // The launch shortcut, from anywhere on the page (not while typing in the
  // page's own fields; in Pilot's own, like Option+C and V: its search always
  // has the focus). Matched on the physical key, since Option+P types π.
  // Pressed while Pilot is open, it hides it, everything kept (setHidden): the
  // agents keep listening, unlike Quit. Again, it's back as it was.
  const shortcut = options.shortcut === false ? null : parseShortcut(options.shortcut ?? "alt+p");
  const onKeyDown = (e: KeyboardEvent) => {
    if (!shortcut || !matchesShortcut(e, shortcut)) return;
    if (isTyping(e) && !e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
    if (running) setHidden(!hidden);
    else instance.launch();
  };
  window.addEventListener("keydown", onKeyDown, true);
  // Single-page apps: other pages' changes find their elements again on arrival.
  window.addEventListener("popstate", reattach);

  const instance: PilotInstance = {
    launch: () => {
      setHidden(false);
      setRunning(true);
    },
    // Quit, as the toolbar's button: for the whole site, the agents stop listening (PilotSession.quit).
    quit: () => {
      session.quit();
      setRunning(false);
    },
    get running() {
      return running;
    },
    destroy() {
      render(null, container);
      session.destroy();
      host.remove();
      unregisterFonts();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", reattach);
      delete (window as WindowWithPilot).__pilot;
    },
  };

  (window as WindowWithPilot).__pilot = instance;
  draw();
  session.start();
  return instance;
}

type WindowWithPilot = Window & { __pilot?: PilotInstance };

/** What mountPilot returns where there's no page (server rendering). */
const INERT: PilotInstance = { launch() {}, quit() {}, running: false, destroy() {} };

interface Shortcut {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  /** The physical key, as KeyboardEvent.code: "KeyP", "Digit1"… */
  code: string;
}

/** `alt+p` → Alt and the P key. Modifiers: alt/option, ctrl, meta/cmd, shift. */
export function parseShortcut(text: string): Shortcut | null {
  const parts = text.toLowerCase().split("+").map((p) => p.trim());
  const key = parts.pop();
  if (!key) return null;
  const has = (...names: string[]) => parts.some((p) => names.includes(p));
  const code = /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key;
  return { alt: has("alt", "option"), ctrl: has("ctrl", "control"), meta: has("meta", "cmd", "command"), shift: has("shift"), code };
}

export function matchesShortcut(e: KeyboardEvent, s: Shortcut): boolean {
  return (
    e.code === s.code && e.altKey === s.alt && e.ctrlKey === s.ctrl && e.metaKey === s.meta && e.shiftKey === s.shift
  );
}

/** Typing in one of the page's own fields (Pilot's own UI is in its Shadow DOM, so it never counts). */
function isTyping(e: KeyboardEvent): boolean {
  const el = e.composedPath()[0];
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

// Per-tab memory, so the constant reloads of a dev session (the agent editing
// files, HMR full reloads) don't relaunch or kill Pilot behind the user's back.
// Storage can throw (privacy modes, sandboxed iframes): fall back to defaults.
function readStoredRunning(): boolean | undefined {
  return readStored(STORAGE_KEY);
}

function storeRunning(running: boolean): void {
  store(STORAGE_KEY, running);
}

function readStored(key: string): boolean | undefined {
  try {
    const value = sessionStorage.getItem(key);
    return value === null ? undefined : value === "1";
  } catch {
    return undefined;
  }
}

function store(key: string, value: boolean): void {
  try {
    sessionStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Not persisted; Pilot still works for this page load.
  }
}
