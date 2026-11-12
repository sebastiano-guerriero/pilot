import { mountPilot } from "@pilot/overlay";
import { installFrameBridge } from "./frame.ts";

if (window.self !== window.top) {
  // Inside a canvas frame (canvas.html): the canvas decides when Pilot runs.
  installFrameBridge();
} else {
  const pilot = mountPilot({
    // Designing the property dialog: keep it open on every reload, anchored to
    // the "Get started" button, with an empty search. Add `query: "padding"` to
    // open an editor directly; remove `dev` to get the real flow back (Pilot
    // dormant until `/pilot`).
    dev: { select: ".button--primary" },
  });

  // Playground-only stand-in for `/pilot` until the bridge exists.
  document.querySelector("[data-launch-pilot]")?.addEventListener("click", () => pilot.launch());
}
