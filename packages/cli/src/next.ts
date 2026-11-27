import { startWithDevServer } from "./dev.ts";

/**
 * `usepilot/next`: Pilot starts with `next dev`, so the designer never runs
 * `npx usepilot`. Next.js reads its config with the phase it's in; Pilot
 * starts only in its development server's (`next build` and `next start`
 * never run it). Next.js reads the config in more than one process: the
 * first one starts Pilot, the others see it running (dev.ts, RUNNER_ENV).
 *
 * ```ts
 * import { withPilot } from "usepilot/next";
 * export default withPilot(nextConfig);
 * ```
 */

/** The phase of `next dev` (`PHASE_DEVELOPMENT_SERVER` in `next/constants`). */
export const DEV_PHASE = "phase-development-server";

export function withPilot<Config>(config: Config | ((phase: string, context: unknown) => Config | Promise<Config>)) {
  return (phase: string, context: unknown): Config | Promise<Config> => {
    if (phase === DEV_PHASE) startWithDevServer({ cwd: process.cwd() });
    return typeof config === "function" ? (config as (phase: string, context: unknown) => Config | Promise<Config>)(phase, context) : config;
  };
}

export default withPilot;
