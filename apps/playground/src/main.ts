import { mountPilot } from "@pilot/overlay";

const pilot = mountPilot({
  // Designing the property dialog: keep it open on every reload, anchored to
  // the "Get started" button, showing the padding editor. Remove `dev` to get
  // the real flow back (Pilot dormant until `/pilot`).
  dev: { select: ".button--primary", query: "padding" },
});

// Playground-only stand-in for `/pilot` until the bridge exists.
document.querySelector("[data-launch-pilot]")?.addEventListener("click", () => pilot.launch());
