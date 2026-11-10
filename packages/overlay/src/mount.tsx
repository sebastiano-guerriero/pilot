import { render } from "preact";
import { App } from "./ui/App.tsx";
import styles from "./ui/styles.css?inline";

export interface PilotOptions {
  /**
   * Launch Pilot as soon as it mounts. Default: false (Pilot stays dormant
   * until `/pilot` launches it). A launch/quit from the current tab session
   * takes precedence, so reloads keep whatever the user chose.
   */
  launch?: boolean;
}

export interface PilotInstance {
  /** Show the toolbar. No-op if already running. Called by `/pilot` (via the bridge). */
  launch(): void;
  /** Hide everything. Same as the toolbar's Quit button. */
  quit(): void;
  readonly running: boolean;
  /** Unmount completely and remove listeners. */
  destroy(): void;
}

const HOST_TAG = "pilot-root";
const STORAGE_KEY = "pilot:running";

/**
 * Mount the Pilot overlay into the current page. Mounting is invisible:
 * Pilot stays dormant until launched.
 *
 * The UI lives in a Shadow DOM so the host app's CSS can't leak in and
 * Pilot's CSS can't leak out. Calling it twice returns the same instance.
 */
export function mountPilot(options: PilotOptions = {}): PilotInstance {
  const existing = (window as WindowWithPilot).__pilot;
  if (existing) return existing;

  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const container = document.createElement("div");
  shadow.append(style, container);
  document.documentElement.append(host);

  let running = readStoredRunning() ?? options.launch ?? false;

  const setRunning = (next: boolean) => {
    if (running === next) return;
    running = next;
    storeRunning(next);
    draw();
  };

  const draw = () => render(running ? <App host={host} onQuit={() => instance.quit()} /> : null, container);

  const instance: PilotInstance = {
    launch: () => setRunning(true),
    quit: () => setRunning(false),
    get running() {
      return running;
    },
    destroy() {
      render(null, container);
      host.remove();
      delete (window as WindowWithPilot).__pilot;
    },
  };

  (window as WindowWithPilot).__pilot = instance;
  draw();
  return instance;
}

type WindowWithPilot = Window & { __pilot?: PilotInstance };

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
