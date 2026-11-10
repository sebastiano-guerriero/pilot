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
        class="button"
        aria-pressed={selecting}
        aria-label="Select an element"
        title="Select an element"
        onClick={onToggleSelect}
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path
            d="M15.554,5.748L3.724,1.367c-.679-.251-1.423-.09-1.935,.423-.513,.513-.674,1.253-.422,1.933L5.748,15.553c.27,.728,.944,1.197,1.72,1.197h.01c.778-.004,1.452-.48,1.716-1.213l1.626-4.517c.033-.093,.106-.167,.201-.201l4.517-1.626c.733-.264,1.209-.938,1.213-1.717,.004-.779-.466-1.458-1.196-1.728Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button
        type="button"
        class="button"
        aria-label="Send to agent"
        title={canSend ? "Send to agent" : "No edits to send yet"}
        disabled={!canSend}
        onClick={onSend}
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path
            d="M9,1C4.589,1,1,4.589,1,9s3.589,8,8,8,8-3.589,8-8S13.411,1,9,1Zm3.03,7.78c-.146,.146-.338,.22-.53,.22s-.384-.073-.53-.22l-1.22-1.22v4.689c0,.414-.336,.75-.75,.75s-.75-.336-.75-.75V7.561l-1.22,1.22c-.293,.293-.768,.293-1.061,0s-.293-.768,0-1.061l2.5-2.5c.293-.293,.768-.293,1.061,0l2.5,2.5c.293,.293,.293,.768,0,1.061Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <span class="divider" aria-hidden="true" />
      <button type="button" class="button" aria-label="Quit Pilot" title="Quit Pilot" onClick={onQuit}>
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path
            d="M5.5,3.236c-1.946,1.184-3.25,3.319-3.25,5.764,0,3.728,3.022,6.75,6.75,6.75s6.75-3.022,6.75-6.75c0-2.445-1.304-4.579-3.25-5.764"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="var(--nucleo-stroke-width, 1.5)"
          />
          <line
            x1="9"
            y1="1.75"
            x2="9"
            y2="8.25"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="var(--nucleo-stroke-width, 1.5)"
            data-color="color-2"
          />
        </svg>
      </button>
    </div>
  );
}
