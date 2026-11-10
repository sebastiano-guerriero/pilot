import { mountPilot } from "@pilot/overlay";

// Same as a real project: Pilot stays dormant until `/pilot` launches it.
const pilot = mountPilot();

// Playground-only stand-in for `/pilot` until the bridge exists.
document.querySelector("[data-launch-pilot]")?.addEventListener("click", () => pilot.launch());
