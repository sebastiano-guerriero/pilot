interface ToolbarProps {
  /** Select mode is on (the cursor button is pressed). */
  selecting: boolean;
  onToggleSelect(): void;
  /** There are collected edits to send. */
  canSend: boolean;
  onSend(): void;
  onQuit(): void;
}

/**
 * The only UI visible while Pilot runs: cursor (select), send, quit.
 * Icons and styling are placeholders pending the real design.
 */
export function Toolbar({ selecting, onToggleSelect, canSend, onSend, onQuit }: ToolbarProps) {
  return (
    <div class="toolbar" role="toolbar" aria-label="Pilot">
      <button
        type="button"
        class="tool"
        aria-pressed={selecting}
        aria-label="Select an element"
        title="Select an element"
        onClick={onToggleSelect}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 2l10 5.5-4.5 1.2L6.8 13z" />
        </svg>
      </button>
      <button
        type="button"
        class="tool"
        aria-label="Send to agent"
        title={canSend ? "Send to agent" : "No edits to send yet"}
        disabled={!canSend}
        onClick={onSend}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
      <span class="divider" aria-hidden="true" />
      <button type="button" class="tool" aria-label="Quit Pilot" title="Quit Pilot" onClick={onQuit}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
    </div>
  );
}
