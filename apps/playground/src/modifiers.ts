import { mountPilot } from "@pilot/overlay";

// The modifiers demo: Pilot as on the main page (see main.ts), the dialog
// anchored to the breakpoint card on reload (`?select=` picks another).
const params = new URLSearchParams(location.search);
const pilot = mountPilot({
  project: "playground",
  dev: { select: params.get("select") ?? ".demo-card" },
  nameAttributes: ["data-block"],
  ...(params.get("bridge") ? { bridge: params.get("bridge") as string } : {}),
});
document.querySelector("[data-launch-pilot]")?.addEventListener("click", () => pilot.launch());

// The window's width and which breakpoints apply, live, so a test knows what it's looking at.
const width = document.querySelector("[data-width]");
const active = document.querySelector("[data-active]");
const showWidth = () => {
  const w = window.innerWidth;
  if (width) width.textContent = `${w}px`;
  const on = [768, 900, 1200].filter((b) => w >= b).map((b) => `from ${b}px`);
  if (active) active.textContent = on.length ? `${on.join(", ")} apply` : "no breakpoint applies (base values)";
};
showWidth();
window.addEventListener("resize", showWidth);

// The toggle: data-checked on and off (the condition on the parent).
for (const toggle of document.querySelectorAll<HTMLButtonElement>("[data-toggle]")) {
  toggle.addEventListener("click", () => {
    const on = !toggle.hasAttribute("data-checked");
    toggle.toggleAttribute("data-checked", on);
    toggle.setAttribute("aria-pressed", String(on));
  });
}
