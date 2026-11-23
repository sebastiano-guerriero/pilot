import { mountPilot } from "@pilot/overlay";

const pilot = mountPilot({
  // Its project's name (package.json): `npx usepilot` in apps/playground runs for this page.
  project: "playground",
  // Designing the property dialog: keep it open on every reload, anchored to
  // the "Get started" button, with an empty search. Add `query: "padding"` to
  // open an editor directly; remove `dev` to get the real flow back (Pilot
  // dormant until `npx usepilot` runs for the site, or Option+P). `?select=<selector>` in the URL anchors it to
  // another element instead (`?select=.review-props`), and survives reloads.
  dev: { select: new URLSearchParams(location.search).get("select") ?? ".button--primary" },
  // This project names its blocks with data-block (the CTA row): the
  // selection label tries it before data-testid, data-slot…
  nameAttributes: ["data-block"],
  // `?bridge=http://127.0.0.1:4790` talks to a hub on another port: a runner of this branch's code
  // (`startRunner({ port })`) beside an installed Pilot that holds the usual one.
  ...(new URLSearchParams(location.search).get("bridge") ? { bridge: new URLSearchParams(location.search).get("bridge") as string } : {}),
});

// Playground-only: opens Pilot, as `npx usepilot` starting for the site does.
document.querySelector("[data-launch-pilot]")?.addEventListener("click", () => pilot.launch());
