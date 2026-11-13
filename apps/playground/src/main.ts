import { mountPilot } from "@pilot/overlay";

const pilot = mountPilot({
  // Designing the property dialog: keep it open on every reload, anchored to
  // the "Get started" button, with an empty search. Add `query: "padding"` to
  // open an editor directly; remove `dev` to get the real flow back (Pilot
  // dormant until `/pilot`).
  dev: { select: ".button--primary" },
  // This project names its blocks with data-block (the CTA row): the
  // selection label tries it before data-testid, data-slot…
  nameAttributes: ["data-block"],
});

// Playground-only stand-in for `/pilot` until the bridge exists.
document.querySelector("[data-launch-pilot]")?.addEventListener("click", () => pilot.launch());
