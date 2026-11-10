import { render } from "preact";
import { App } from "./ui/App.tsx";
import styles from "./ui/styles.css?inline";

export interface PilotOptions {
  /** Start with the panel open. Default: false. */
  open?: boolean;
  /**
   * Keyboard shortcut that toggles Pilot, matched against `KeyboardEvent.code`
   * plus modifiers. Default: Alt+P (Option+P on macOS).
   */
  shortcut?: { code: string; alt?: boolean; meta?: boolean; ctrl?: boolean; shift?: boolean };
}

export interface PilotInstance {
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
}

const HOST_TAG = "pilot-root";

/**
 * Mount the Pilot overlay into the current page.
 *
 * The UI lives in a Shadow DOM so the host app's CSS can't leak in and
 * Pilot's CSS can't leak out. Calling it twice returns the same instance.
 */
export function mountPilot(options: PilotOptions = {}): PilotInstance {
  const existing = (window as WindowWithPilot).__pilot;
  if (existing) return existing;

  const shortcut = options.shortcut ?? { code: "KeyP", alt: true };
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const container = document.createElement("div");
  shadow.append(style, container);
  document.documentElement.append(host);

  let isOpen = options.open ?? false;
  const draw = () => render(<App open={isOpen} onClose={() => instance.close()} />, container);

  const onKeyDown = (e: KeyboardEvent) => {
    if (
      e.code === shortcut.code &&
      e.altKey === !!shortcut.alt &&
      e.metaKey === !!shortcut.meta &&
      e.ctrlKey === !!shortcut.ctrl &&
      e.shiftKey === !!shortcut.shift
    ) {
      e.preventDefault();
      instance.toggle();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);

  const instance: PilotInstance = {
    open() {
      isOpen = true;
      draw();
    },
    close() {
      isOpen = false;
      draw();
    },
    toggle() {
      isOpen = !isOpen;
      draw();
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown, true);
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
