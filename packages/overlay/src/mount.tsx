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
   * until the shortcut, or `/pilot` in an agent, launches it). A launch/quit from the current tab session
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
   * Where Pilot reaches the agents: the bridge's URL (`pilot mcp`, started by
   * the agent). Default `http://127.0.0.1:` + the bridge's port for this version (DEFAULT_BRIDGE_PORT). `false` turns it off: no
   * Send, no launch from `/pilot`, Copy prompt only.
   */
  bridge?: string | false;
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
  /** Show the toolbar. No-op if already running. Called by `/pilot` (via the bridge). */
  launch(): void;
  /**
   * Quit, the toolbar's Quit button: closes Pilot on the whole site (every
   * tab of it) and tells its agents to stop listening, so their chats end the
   * loop. Jobs no agent took yet are unsent changes again; the ones being
   * applied finish. `/pilot` in a chat starts it again. (Hiding without
   * quitting: the launch shortcut, pressed while Pilot is open.)
   */
  quit(): void;
  readonly running: boolean;
  /** Unmount completely and remove listeners. */
  destroy(): void;
}

const HOST_TAG = "pilot-root";
const STORAGE_KEY = "pilot:running";

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
  // The handoff to agents: Send, the jobs, and /pilot launching Pilot.
  const session = new PilotSession(history, {
    bridge: options.bridge ?? DEFAULT_BRIDGE_URL,
    onLaunch: () => instance.launch(),
    // A page opened after /pilot: Pilot opens by itself, unless quit in this tab.
    onAgentsArrived: () => {
      if (readStoredRunning() !== false) instance.launch();
    },
    // Quit on this site, in another tab: closed here too.
    onQuit: () => setRunning(false),
  });

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
        />
      ) : null,
      container,
    );

  // The launch shortcut, from anywhere on the page (not while typing in the
  // page's own fields). Matched on the physical key, since Option+P types π.
  // Pressed while Pilot is open, it hides it (a look at the bare page): the
  // agents keep listening, unlike Quit. Again, it's back.
  const shortcut = options.shortcut === false ? null : parseShortcut(options.shortcut ?? "alt+p");
  const onKeyDown = (e: KeyboardEvent) => {
    if (!shortcut || !matchesShortcut(e, shortcut) || isTyping(e)) return;
    e.preventDefault();
    if (running) setRunning(false);
    else instance.launch();
  };
  window.addEventListener("keydown", onKeyDown, true);
  // Single-page apps: other pages' changes find their elements again on arrival.
  window.addEventListener("popstate", reattach);

  const instance: PilotInstance = {
    launch: () => setRunning(true),
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
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value === null ? undefined : value === "1";
  } catch {
    return undefined;
  }
}

function storeRunning(running: boolean): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, running ? "1" : "0");
  } catch {
    // Not persisted; Pilot still works for this page load.
  }
}
